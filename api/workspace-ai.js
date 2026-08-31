const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const { consumePlanAction, planLimitMessage } = require("./_lib/plan-access");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, setSecurityHeaders } = require("./_lib/request-security");
const REQUEST_TIMEOUT_MS = 45000;
const MAX_ITEMS = 400;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    clarification: { type: "string" },
    createFolders: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          parentId: { type: "string" },
          parentKey: { type: "string" }
        },
        required: ["key", "name", "parentId", "parentKey"]
      }
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          destinationFolderId: { type: "string" },
          destinationFolderKey: { type: "string" },
          newName: { type: "string" }
        },
        required: ["itemId", "destinationFolderId", "destinationFolderKey", "newName"]
      }
    }
  },
  required: ["summary", "clarification", "createFolders", "changes"]
};

module.exports = async function workspaceAi(request, response) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ message: "Método no permitido." });
  }
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (rejectOversizedBody(request, response, 256 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route: "workspace-ai", limit: 12, windowSeconds: 60 }))) return;
  if (!process.env.GEMINI_API_KEY) return response.status(503).json({ message: "La IA todavía no está configurada." });

  const input = validateInput(request.body);
  if (!input.ok) return response.status(400).json({ message: input.error });

  let access;
  try {
    access = await consumePlanAction(request, "ai");
  } catch (error) {
    return response.status(503).json({ message: "No pudimos comprobar tu plan. Probá nuevamente." });
  }
  if (!access.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para usar la organización con IA." });
  if (!access.usage?.allowed) return response.status(429).json({ message: planLimitMessage("ai", access.usage), usage: access.usage });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const modelResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(buildModelRequest(input.value)),
        signal: controller.signal
      }
    );
    const payload = await modelResponse.json().catch(() => null);
    if (!modelResponse.ok) {
      const busy = modelResponse.status === 429 || modelResponse.status >= 500;
      return response.status(busy ? 503 : 502).json({
        message: busy ? "La IA está ocupada. Probá de nuevo en unos segundos." : "No pudimos interpretar la indicación."
      });
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = JSON.parse(text);
    return response.status(200).json({ plan: sanitizePlan(parsed, input.value.items) });
  } catch (error) {
    return response.status(503).json({
      message: error?.name === "AbortError"
        ? "La IA tardó demasiado en responder. Probá nuevamente."
        : "No pudimos conectar con la IA en este momento."
    });
  } finally {
    clearTimeout(timeout);
  }
};

function validateInput(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Solicitud inválida." };
  const instruction = cleanText(body.instruction, 1000);
  if (!instruction) return { ok: false, error: "Escribí cómo querés organizar tu espacio." };
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) return { ok: false, error: "El espacio es demasiado grande para organizarlo de una vez." };

  const ids = new Set();
  const items = body.items.map((raw) => {
    const id = cleanId(raw?.id);
    const kind = raw?.kind === "folder" ? "folder" : raw?.kind === "file" ? "file" : "";
    const name = cleanName(raw?.name);
    if (!id || !kind || !name || ids.has(id)) return null;
    ids.add(id);
    return {
      id,
      parentId: cleanId(raw.parentId),
      kind,
      name,
      mimeType: cleanText(raw.mimeType, 100),
      sizeBytes: Math.max(0, Math.min(Number(raw.sizeBytes) || 0, 52428800))
    };
  }).filter(Boolean);
  return { ok: true, value: { instruction, items } };
}

function buildModelRequest(input) {
  const systemInstruction = `Sos el asistente de organización de archivos de Estudiemos.
Tu tarea es convertir una instrucción natural en un plan pequeño, seguro y reversible.

Reglas obligatorias:
- Trabajá solamente con la lista de elementos recibida. Cada ID existente debe copiarse exactamente.
- Solo conocés nombres, tipos, tamaño y ubicación. No afirmes haber leído el contenido de ningún archivo.
- Podés proponer crear carpetas, mover elementos y cambiar nombres.
- Nunca borres archivos ni carpetas.
- No cambies extensiones de archivo. Si newName no es necesario, devolvé una cadena vacía.
- Corregí ortografía, acentos y mayúsculas en todos los nombres de carpetas que crees o renombres. Por ejemplo: "fisica" debe quedar "Física".
- Usá nombres académicos claros y breves. Si un nombre largo tiene una abreviatura inequívoca y útil, podés usarla. Por ejemplo: "Computación y Cálculo Numérico" debe quedar "CyCN".
- No abrevies automáticamente nombres de archivos; conservá su nombre y extensión salvo que el usuario pida renombrarlos.
- Para una carpeta nueva usá una key corta y única. Sus hijos pueden referenciarla mediante parentKey o destinationFolderKey.
- Para una carpeta existente usá su ID exacto. Una ubicación raíz se representa con cadenas vacías.
- No muevas una carpeta dentro de sí misma ni dentro de sus descendientes.
- Evitá crear carpetas redundantes o mover elementos que ya están bien ubicados.
- Si la orden es ambigua o podría desordenar muchos elementos de forma dudosa, escribí una pregunta en clarification y no devuelvas acciones.
- Respondé en español rioplatense y exclusivamente con el JSON solicitado.`;

  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      role: "user",
      parts: [{ text: JSON.stringify({ instruccion: input.instruction, elementos: input.items }) }]
    }],
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };
}

function sanitizePlan(raw, items) {
  const validIds = new Set(items.map((item) => item.id));
  const folderIds = new Set(items.filter((item) => item.kind === "folder").map((item) => item.id));
  const folders = [];
  const keys = new Set();
  const candidates = Array.isArray(raw?.createFolders) ? raw.createFolders.slice(0, 50) : [];

  candidates.forEach((candidate) => {
    const key = cleanKey(candidate?.key);
    if (key) keys.add(key);
  });

  const acceptedKeys = new Set();
  for (const candidate of candidates) {
    const name = formatFolderName(candidate?.name);
    let key = cleanKey(candidate?.key);
    const parentId = cleanId(candidate?.parentId);
    const parentKey = cleanKey(candidate?.parentKey);
    if (!name || !key || acceptedKeys.has(key)) continue;
    if (parentId && !folderIds.has(parentId)) continue;
    if (parentKey && (!keys.has(parentKey) || parentKey === key)) continue;
    acceptedKeys.add(key);
    folders.push({ key, name, parentId, parentKey });
  }

  const orderedFolders = [];
  let pendingFolders = [...folders];
  const resolvedKeys = new Set();
  while (pendingFolders.length) {
    const ready = pendingFolders.filter((folder) => !folder.parentKey || resolvedKeys.has(folder.parentKey));
    if (!ready.length) break;
    ready.forEach((folder) => {
      orderedFolders.push(folder);
      resolvedKeys.add(folder.key);
    });
    pendingFolders = pendingFolders.filter((folder) => !resolvedKeys.has(folder.key));
  }

  const changes = [];
  const changedIds = new Set();
  for (const candidate of Array.isArray(raw?.changes) ? raw.changes.slice(0, MAX_ITEMS) : []) {
    const itemId = cleanId(candidate?.itemId);
    const destinationFolderId = cleanId(candidate?.destinationFolderId);
    const destinationFolderKey = cleanKey(candidate?.destinationFolderKey);
    const original = items.find((item) => item.id === itemId);
    if (!original || changedIds.has(itemId)) continue;
    if (destinationFolderId && !folderIds.has(destinationFolderId)) continue;
    if (destinationFolderKey && !resolvedKeys.has(destinationFolderKey)) continue;
    if (destinationFolderId && destinationFolderKey) continue;
    if (original.kind === "folder" && destinationFolderId === original.id) continue;
    const proposedName = original.kind === "folder"
      ? formatFolderName(candidate?.newName)
      : cleanName(candidate?.newName);
    const newName = preserveExtension(original, proposedName);
    const destination = destinationFolderId || destinationFolderKey || "";
    if (!newName && (destinationFolderId || "") === (original.parentId || "") && !destinationFolderKey) continue;
    changedIds.add(itemId);
    changes.push({ itemId, destinationFolderId, destinationFolderKey, newName });
  }

  const clarification = cleanText(raw?.clarification, 240);
  return {
    summary: cleanText(raw?.summary, 240) || "Plan de organización listo.",
    clarification,
    createFolders: clarification ? [] : orderedFolders,
    changes: clarification ? [] : changes
  };
}

function preserveExtension(item, proposed) {
  if (!proposed || proposed === item.name) return "";
  if (item.kind !== "file") return proposed;
  const oldMatch = item.name.match(/(\.[^.]{1,12})$/);
  if (!oldMatch) return proposed;
  const oldExtension = oldMatch[1].toLowerCase();
  const newMatch = proposed.match(/(\.[^.]{1,12})$/);
  if (!newMatch) return `${proposed}${oldMatch[1]}`.slice(0, 120);
  return newMatch[1].toLowerCase() === oldExtension ? proposed : "";
}

function formatFolderName(value) {
  const name = cleanName(value);
  if (!name) return "";
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const academicNames = new Map([
    ["fisica", "Física"],
    ["fisica 1", "Física I"],
    ["fisica i", "Física I"],
    ["fisica 2", "Física II"],
    ["fisica ii", "Física II"],
    ["quimica", "Química"],
    ["computacion", "Computación"],
    ["calculo numerico", "Cálculo Numérico"],
    ["computacion y calculo numerico", "CyCN"],
    ["computacion calculo numerico", "CyCN"],
    ["analisis matematico", "Análisis Matemático"],
    ["analisis matematico 1", "Análisis Matemático I"],
    ["analisis matematico i", "Análisis Matemático I"],
    ["analisis matematico 2", "Análisis Matemático II"],
    ["analisis matematico ii", "Análisis Matemático II"]
  ]);
  if (academicNames.has(normalized)) return academicNames.get(normalized);

  return name
    .replace(/\bcomputaci[oó]n\s+y\s+c[aá]lculo\s+num[eé]rico\b/gi, "CyCN")
    .replace(/\bf[ií]sica\b/gi, "Física")
    .replace(/\bqu[ií]mica\b/gi, "Química")
    .replace(/\bcomputaci[oó]n\b/gi, "Computación")
    .replace(/\bc[aá]lculo\s+num[eé]rico\b/gi, "Cálculo Numérico")
    .replace(/\ban[aá]lisis\s+matem[aá]tico\b/gi, "Análisis Matemático");
}

function cleanId(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function cleanKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 50);
}

function cleanName(value) {
  return String(value || "").replace(/[\\/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
