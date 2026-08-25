const crypto = require("crypto");
const agendaAi = require("./agenda-ai");
const { adminRequest, encodeFilter, isConfigured } = require("./_lib/supabase-admin");

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES_PER_WEBHOOK = 5;
const DEFAULT_DAILY_LIMIT = 30;
const PENDING_MINUTES = 15;

module.exports = async function whatsappWebhook(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET") return verifyWebhook(request, response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).send("Method not allowed");
  }
  if (!webhookConfigured() || !isConfigured()) return response.status(503).send("Not configured");

  const rawBody = await readRawBody(request);
  if (!verifySignature(rawBody, request.headers["x-hub-signature-256"])) {
    return response.status(401).send("Invalid signature");
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch (_) { return response.status(400).send("Invalid JSON"); }

  await cleanupExpiredData().catch(() => null);
  const messages = extractMessages(payload).slice(0, MAX_MESSAGES_PER_WEBHOOK);
  for (const message of messages) {
    await processMessage(message).catch(async () => {
      await markMessage(message.id, "failed").catch(() => null);
      await sendText(message.from, "No pude procesar ese mensaje. Probá nuevamente en unos minutos.").catch(() => null);
    });
  }
  return response.status(200).send("EVENT_RECEIVED");
};

module.exports.config = { api: { bodyParser: false } };

function verifyWebhook(request, response) {
  const mode = String(request.query?.["hub.mode"] || "");
  const token = String(request.query?.["hub.verify_token"] || "");
  const challenge = String(request.query?.["hub.challenge"] || "");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return response.status(200).send(challenge);
  }
  return response.status(403).send("Verification failed");
}

async function processMessage(message) {
  if (!message?.id || !message?.from) return;
  if (!(await claimMessage(message))) return;

  const text = extractText(message);
  const linkCode = text.match(/^VINCULAR\s+([A-Z0-9]{8})$/i)?.[1]?.toUpperCase();
  if (linkCode) {
    await consumeLinkCode(message.from, message.profileName, linkCode);
    await markMessage(message.id, "linked");
    return;
  }

  const link = await findLinkByWhatsAppId(message.from);
  if (!link) {
    await sendText(message.from, "Primero vinculá este número desde Estudiemos: abrí Perfil y elegí Vincular WhatsApp.");
    await markMessage(message.id, "unlinked");
    return;
  }

  const normalized = normalizeCommand(text);
  if (normalized === "confirmar") {
    await confirmPendingAction(link, message.from);
    await markMessage(message.id, "confirmed");
    return;
  }
  if (normalized === "cancelar") {
    await cancelPendingAction(link.user_id, message.from);
    await markMessage(message.id, "cancelled");
    return;
  }

  if (!["text", "audio"].includes(message.type)) {
    await sendText(message.from, "Por ahora puedo organizar Inbox y calendario a partir de texto o audio.");
    await markMessage(message.id, "unsupported");
    return;
  }

  const usage = await incrementUsage(link.user_id);
  if (usage > dailyLimit()) {
    await sendText(message.from, "Alcanzaste el límite de seguridad de hoy. Mañana vas a poder volver a organizar desde WhatsApp.");
    await markMessage(message.id, "limited");
    return;
  }

  const instruction = message.type === "audio" ? await transcribeAudio(message.audioId) : text;
  if (instruction.length < 3) {
    await sendText(message.from, "No pude entender el mensaje. Probá con un audio más claro o escribilo en una frase.");
    await markMessage(message.id, "empty");
    return;
  }

  const current = await readUserState(link.user_id);
  const agenda = readAgenda(current.state);
  const today = dateInArgentina(new Date());
  const dateUntil = addDays(today, 120);
  const input = agendaAi.validateAgendaInput({
    instruction,
    dateFrom: today,
    dateUntil,
    today,
    subjects: [...new Set(agenda.map((item) => item.subject).filter(Boolean))],
    agenda
  });
  if (!input.ok) {
    await sendText(message.from, input.error || "No pude interpretar esa indicación.");
    await markMessage(message.id, "invalid");
    return;
  }

  const plan = await agendaAi.createAgendaPlan(input.value);
  if (plan.clarification) {
    await sendText(message.from, plan.clarification);
    await markMessage(message.id, "clarification");
    return;
  }
  if (!countPlanChanges(plan)) {
    await sendText(message.from, "Entendí el pedido, pero no encontré ningún cambio nuevo para aplicar.");
    await markMessage(message.id, "no_changes");
    return;
  }

  await savePendingAction(link.user_id, message.from, message.id, instruction, plan);
  await sendText(message.from, `${formatPlanPreview(plan)}\n\nRespondé *CONFIRMAR* para aplicarlo o *CANCELAR* para descartarlo.`);
  await markMessage(message.id, "pending");
}

async function consumeLinkCode(waId, displayName, code) {
  const hash = sha256(code);
  const now = new Date().toISOString();
  const rows = await adminRequest(`/rest/v1/whatsapp_link_codes?code_hash=eq.${encodeFilter(hash)}&used_at=is.null&expires_at=gt.${encodeFilter(now)}&select=id,user_id&limit=1`);
  const codeRow = Array.isArray(rows) ? rows[0] : null;
  if (!codeRow) {
    await sendText(waId, "Ese código venció o ya fue usado. Generá uno nuevo desde Perfil en Estudiemos.");
    return;
  }

  await adminRequest(`/rest/v1/whatsapp_links?or=(user_id.eq.${encodeFilter(codeRow.user_id)},wa_id.eq.${encodeFilter(waId)})`, { method: "DELETE" });
  await adminRequest("/rest/v1/whatsapp_links", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: codeRow.user_id, wa_id: waId, display_name: cleanText(displayName, 80) })
  });
  await adminRequest(`/rest/v1/whatsapp_link_codes?id=eq.${encodeFilter(codeRow.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ used_at: now })
  });
  await sendText(waId, "Listo. Este WhatsApp quedó vinculado a tu cuenta de Estudiemos. Mandame una tarea por texto o audio para probarlo.");
}

async function confirmPendingAction(link, waId) {
  const now = new Date().toISOString();
  const rows = await adminRequest(`/rest/v1/whatsapp_pending_actions?user_id=eq.${encodeFilter(link.user_id)}&wa_id=eq.${encodeFilter(waId)}&expires_at=gt.${encodeFilter(now)}&select=id,plan&order=created_at.desc&limit=1`);
  const pending = Array.isArray(rows) ? rows[0] : null;
  if (!pending) {
    await sendText(waId, "No hay cambios pendientes. Enviame una nueva indicación.");
    return;
  }
  const result = await applyAgendaPlan(link.user_id, pending.plan);
  await adminRequest(`/rest/v1/whatsapp_pending_actions?id=eq.${encodeFilter(pending.id)}`, { method: "DELETE" });
  await sendText(waId, `Listo. Apliqué ${result.changed} ${result.changed === 1 ? "cambio" : "cambios"} en tu Inbox y calendario.`);
}

async function cancelPendingAction(userId, waId) {
  await adminRequest(`/rest/v1/whatsapp_pending_actions?user_id=eq.${encodeFilter(userId)}&wa_id=eq.${encodeFilter(waId)}`, { method: "DELETE" });
  await sendText(waId, "Descartado. No modifiqué nada.");
}

async function applyAgendaPlan(userId, plan) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readUserState(userId);
    const merged = mergeAgendaPlan(current.state, plan);
    const updatedAt = new Date().toISOString();
    if (!current.exists) {
      await adminRequest("/rest/v1/user_states", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, state: merged.state, updated_at: updatedAt })
      });
      return { changed: merged.changed };
    }

    const rows = await adminRequest(`/rest/v1/user_states?user_id=eq.${encodeFilter(userId)}&updated_at=eq.${encodeFilter(current.updatedAt)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ state: merged.state, updated_at: updatedAt })
    });
    if (Array.isArray(rows) && rows.length) return { changed: merged.changed };
  }
  throw new Error("USER_STATE_CHANGED_DURING_CONFIRMATION");
}

function mergeAgendaPlan(currentState, plan) {
  const state = normalizeState(currentState);
  let agenda = readAgenda(state);
  const deleteIds = new Set(Array.isArray(plan?.deleteIds) ? plan.deleteIds : []);
  const beforeDelete = agenda.length;
  agenda = agenda.filter((item) => !deleteIds.has(item.id));
  const deletedCount = beforeDelete - agenda.length;

  const updates = new Map((Array.isArray(plan?.updates) ? plan.updates : []).map((item) => [item.id, item]));
  let updatedCount = 0;
  agenda = agenda.map((item) => {
    const update = updates.get(item.id);
    if (!update) return item;
    updatedCount += 1;
    return { ...item, ...update, id: item.id };
  });

  const created = [
    ...expandSchedules(plan?.createSchedules),
    ...(Array.isArray(plan?.createEvents) ? plan.createEvents.map(createAgendaItem).filter(Boolean) : [])
  ];
  const occupied = new Set(agenda.map(agendaKey));
  const uniqueCreated = created.filter((item) => {
    const key = agendaKey(item);
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  });
  agenda = [...agenda, ...uniqueCreated].slice(-500);
  state.version = 1;
  state.values = state.values && typeof state.values === "object" ? state.values : {};
  state.values.bandeja_agenda = agenda;
  return { state, changed: deletedCount + updatedCount + uniqueCreated.length };
}

function expandSchedules(schedules) {
  const result = [];
  (Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
    const start = parseIsoDate(schedule.dateFrom);
    const end = parseIsoDate(schedule.dateUntil);
    const days = new Set(Array.isArray(schedule.days) ? schedule.days : []);
    if (!start || !end || !days.size) return;
    const cursor = new Date(start);
    while (cursor <= end && result.length < 500) {
      if (days.has(cursor.getUTCDay())) {
        result.push(createAgendaItem({ ...schedule, date: cursor.toISOString().slice(0, 10) }));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });
  return result.filter(Boolean);
}

function createAgendaItem(item) {
  const title = cleanText(item?.title, 90);
  if (!title) return null;
  return {
    id: `agenda:${Date.now()}:wa:${crypto.randomUUID()}`,
    title,
    type: validAgendaType(item.type),
    date: cleanDate(item.date),
    subject: cleanText(item.subject, 80),
    note: cleanText(item.note, 240),
    horaInicio: cleanTime(item.horaInicio),
    horaFin: cleanTime(item.horaFin),
    done: Boolean(item.done),
    createdAt: Date.now()
  };
}

async function readUserState(userId) {
  const rows = await adminRequest(`/rest/v1/user_states?user_id=eq.${encodeFilter(userId)}&select=state,updated_at&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return { exists: Boolean(row), state: normalizeState(row?.state), updatedAt: row?.updated_at || "" };
}

function normalizeState(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : { version: 1, values: {} };
}

function readAgenda(state) {
  const agenda = state?.values?.bandeja_agenda;
  return Array.isArray(agenda) ? agenda.filter((item) => item && typeof item === "object").slice(0, 500) : [];
}

async function savePendingAction(userId, waId, messageId, instruction, plan) {
  await adminRequest(`/rest/v1/whatsapp_pending_actions?user_id=eq.${encodeFilter(userId)}&wa_id=eq.${encodeFilter(waId)}`, { method: "DELETE" });
  await adminRequest("/rest/v1/whatsapp_pending_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      wa_id: waId,
      source_message_id: messageId,
      instruction,
      plan,
      expires_at: new Date(Date.now() + PENDING_MINUTES * 60000).toISOString()
    })
  });
}

async function findLinkByWhatsAppId(waId) {
  const rows = await adminRequest(`/rest/v1/whatsapp_links?wa_id=eq.${encodeFilter(waId)}&select=user_id,wa_id&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function incrementUsage(userId) {
  const result = await adminRequest("/rest/v1/rpc/increment_whatsapp_usage", {
    method: "POST",
    body: JSON.stringify({ target_user_id: userId, target_date: dateInArgentina(new Date()) })
  });
  return Number(result) || 0;
}

async function claimMessage(message) {
  const result = await adminRequest("/rest/v1/whatsapp_message_log?on_conflict=message_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ message_id: message.id, wa_id_hash: sha256(message.from), status: "processing" })
  });
  return Array.isArray(result) && result.length > 0;
}

async function markMessage(messageId, status) {
  return adminRequest(`/rest/v1/whatsapp_message_log?message_id=eq.${encodeFilter(messageId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, completed_at: new Date().toISOString() })
  });
}

async function cleanupExpiredData() {
  const now = new Date().toISOString();
  const oldMessages = new Date(Date.now() - 30 * 86400000).toISOString();
  const oldUsage = dateInArgentina(new Date(Date.now() - 60 * 86400000));
  await Promise.all([
    adminRequest(`/rest/v1/whatsapp_link_codes?expires_at=lt.${encodeFilter(now)}`, { method: "DELETE" }),
    adminRequest(`/rest/v1/whatsapp_pending_actions?expires_at=lt.${encodeFilter(now)}`, { method: "DELETE" }),
    adminRequest(`/rest/v1/whatsapp_message_log?created_at=lt.${encodeFilter(oldMessages)}`, { method: "DELETE" }),
    adminRequest(`/rest/v1/whatsapp_daily_usage?usage_date=lt.${encodeFilter(oldUsage)}`, { method: "DELETE" })
  ]);
}

async function transcribeAudio(mediaId) {
  if (!mediaId) return "";
  const metadataResponse = await graphFetch(`/${encodeURIComponent(mediaId)}`);
  const metadata = await metadataResponse.json();
  if (!metadataResponse.ok || !metadata.url) throw new Error("AUDIO_METADATA_FAILED");
  if (Number(metadata.file_size) > MAX_AUDIO_BYTES) throw new Error("AUDIO_TOO_LARGE");
  const audioResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } });
  if (!audioResponse.ok) throw new Error("AUDIO_DOWNLOAD_FAILED");
  const audio = Buffer.from(await audioResponse.arrayBuffer());
  if (audio.length > MAX_AUDIO_BYTES) throw new Error("AUDIO_TOO_LARGE");
  const mimeType = String(metadata.mime_type || audioResponse.headers.get("content-type") || "audio/ogg").split(";")[0];
  const modelResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: "Transcribí este audio en español rioplatense. Conservá fechas, horas, materias, negaciones y órdenes exactamente. Devolvé solo la transcripción, sin comentarios." },
        { inlineData: { mimeType, data: audio.toString("base64") } }
      ] }],
      generationConfig: { maxOutputTokens: 1800, temperature: 0 }
    })
  });
  const payload = await modelResponse.json().catch(() => null);
  if (!modelResponse.ok) throw new Error("AUDIO_TRANSCRIPTION_FAILED");
  return cleanText(payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""), 1200);
}

async function sendText(to, body) {
  const response = await graphFetch(`/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: cleanMessageText(body, 3900) } })
  });
  if (!response.ok) throw new Error("WHATSAPP_SEND_FAILED");
}

function graphFetch(path, options = {}) {
  return fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, ...(options.headers || {}) }
  });
}

function extractMessages(payload) {
  const result = [];
  (payload?.entry || []).forEach((entry) => (entry?.changes || []).forEach((change) => {
    const value = change?.value || {};
    const names = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || ""]));
    (value.messages || []).forEach((message) => result.push({
      id: message.id,
      from: message.from,
      type: message.type,
      text: message.text?.body || "",
      audioId: message.audio?.id || "",
      profileName: names.get(message.from) || ""
    }));
  }));
  return result;
}

function extractText(message) {
  return cleanText(message?.text, 1200);
}

function formatPlanPreview(plan) {
  const rows = [];
  (plan.createSchedules || []).slice(0, 3).forEach((item) => rows.push(`• Agregar horario: ${item.subject || item.title}`));
  (plan.createEvents || []).slice(0, 4).forEach((item) => rows.push(`• Agregar: ${item.title}${item.date ? ` (${item.date})` : " (Inbox)"}`));
  if (plan.updates?.length) rows.push(`• Actualizar ${plan.updates.length} ${plan.updates.length === 1 ? "anotación" : "anotaciones"}`);
  if (plan.deleteIds?.length) rows.push(`• Eliminar ${plan.deleteIds.length} ${plan.deleteIds.length === 1 ? "anotación" : "anotaciones"}`);
  return `${cleanText(plan.summary, 300) || "Preparé estos cambios:"}\n${rows.slice(0, 7).join("\n")}`.trim();
}

function countPlanChanges(plan) {
  return (plan?.createSchedules?.length || 0) + (plan?.createEvents?.length || 0) + (plan?.updates?.length || 0) + (plan?.deleteIds?.length || 0);
}

function agendaKey(item) {
  return [item.title, item.type, item.date, item.subject, item.horaInicio, item.horaFin].map(normalizeCommand).join("|");
}

function normalizeCommand(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dailyLimit() {
  const value = Number(process.env.WHATSAPP_DAILY_COMMAND_LIMIT || DEFAULT_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 200) : DEFAULT_DAILY_LIMIT;
}

function dateInArgentina(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanDate(value) {
  const date = parseIsoDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function cleanTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1]}:${match[2]}`;
}

function validAgendaType(value) {
  return ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"].includes(value) ? value : "Tarea";
}

function cleanText(value, maxLength = 3900) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMessageText(value, maxLength = 3900) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, signature) {
  const secret = String(process.env.WHATSAPP_APP_SECRET || "");
  const received = String(signature || "");
  if (!secret || !received.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function webhookConfigured() {
  return Boolean(
    process.env.WHATSAPP_VERIFY_TOKEN &&
    process.env.WHATSAPP_APP_SECRET &&
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.GEMINI_API_KEY
  );
}
