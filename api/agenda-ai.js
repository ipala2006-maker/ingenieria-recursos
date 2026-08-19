// This function keeps the model credential on Vercel and out of the browser.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_AGENDA_ITEMS = 500;
const MAX_INSTRUCTION_LENGTH = 1200;
const MAX_RANGE_DAYS = 370;
const REQUEST_TIMEOUT_MS = 25000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Resumen breve, claro y en espanol rioplatense de lo que se va a hacer."
    },
    clarification: {
      type: "string",
      description: "Pregunta concreta si falta informacion indispensable. Vacio si la orden es clara."
    },
    createSchedules: {
      type: "array",
      description: "Horarios semanales recurrentes que deben expandirse entre dateFrom y dateUntil.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          subject: { type: "string" },
          eventType: { type: "string", enum: ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"] },
          weekdays: { type: "array", items: { type: "integer" } },
          dateFrom: { type: "string" },
          dateUntil: { type: "string" },
          horaInicio: { type: "string" },
          horaFin: { type: "string" },
          note: { type: "string" }
        },
        required: ["title", "subject", "eventType", "weekdays", "dateFrom", "dateUntil", "horaInicio", "horaFin", "note"]
      }
    },
    createEvents: {
      type: "array",
      description: "Anotaciones unicas, no recurrentes.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          eventType: { type: "string", enum: ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"] },
          date: { type: "string" },
          subject: { type: "string" },
          note: { type: "string" },
          horaInicio: { type: "string" },
          horaFin: { type: "string" },
          done: { type: "boolean" }
        },
        required: ["title", "eventType", "date", "subject", "note", "horaInicio", "horaFin", "done"]
      }
    },
    deleteIds: {
      type: "array",
      description: "IDs exactos de anotaciones existentes que se deben eliminar.",
      items: { type: "string" }
    },
    updates: {
      type: "array",
      description: "Cambios sobre anotaciones existentes. Incluir siempre su ID y solo los valores finales necesarios.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          eventType: { type: "string", enum: ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"] },
          date: { type: "string" },
          subject: { type: "string" },
          note: { type: "string" },
          horaInicio: { type: "string" },
          horaFin: { type: "string" },
          done: { type: "boolean" }
        },
        required: ["id"]
      }
    }
  },
  required: ["summary", "clarification", "createSchedules", "createEvents", "deleteIds", "updates"]
};

module.exports = async function agendaAi(request, response) {
  setResponseHeaders(response);

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Metodo no permitido." });
  }

  if (!isSameOriginRequest(request)) {
    return response.status(403).json({ error: "Origen no permitido." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return response.status(503).json({
      code: "AI_NOT_CONFIGURED",
      error: "El asistente todavia no tiene configurada su clave segura."
    });
  }

  const input = validateInput(request.body);
  if (!input.ok) return response.status(400).json({ error: input.error });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    ).finally(() => clearTimeout(timeout));

    const payload = await modelResponse.json().catch(() => null);
    if (!modelResponse.ok) {
      const unavailable = modelResponse.status === 429 || modelResponse.status >= 500;
      return response.status(unavailable ? 503 : 502).json({
        error: unavailable
          ? "La IA esta ocupada en este momento. Proba nuevamente en unos segundos."
          : "No se pudo interpretar la instruccion."
      });
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = JSON.parse(text);
    const plan = sanitizePlan(parsed, input.value.agenda);
    return response.status(200).json(plan);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return response.status(503).json({
      error: timedOut
        ? "La IA tardo demasiado en responder. Proba nuevamente."
        : "No se pudo conectar con la IA en este momento."
    });
  }
};

function setResponseHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function isSameOriginRequest(request) {
  const origin = String(request.headers?.origin || "");
  if (!origin) return true;
  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch (_) {
    return false;
  }
}

function validateInput(body) {
  const source = body && typeof body === "object" ? body : {};
  if (JSON.stringify(source).length > 200000) return { ok: false, error: "La agenda enviada es demasiado grande." };
  const instruction = cleanText(source.instruction, MAX_INSTRUCTION_LENGTH);
  if (instruction.length < 3) return { ok: false, error: "Escribi una instruccion mas completa." };

  const dateFrom = cleanDate(source.dateFrom);
  const dateUntil = cleanDate(source.dateUntil);
  if (!dateFrom || !dateUntil || dateFrom > dateUntil) {
    return { ok: false, error: "El rango de fechas no es valido." };
  }
  const rangeDays = Math.floor((Date.parse(`${dateUntil}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86400000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) return { ok: false, error: "El rango no puede superar un ano." };

  const agenda = Array.isArray(source.agenda)
    ? source.agenda.slice(0, MAX_AGENDA_ITEMS).map(sanitizeAgendaItem).filter(Boolean)
    : [];
  const subjects = Array.isArray(source.subjects)
    ? [...new Set(source.subjects.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 100)
    : [];

  return {
    ok: true,
    value: {
      instruction,
      dateFrom,
      dateUntil,
      agenda,
      subjects,
      today: cleanDate(source.today) || new Date().toISOString().slice(0, 10),
      timezone: "America/Argentina/Buenos_Aires"
    }
  };
}

function sanitizeAgendaItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = cleanText(item.id, 180);
  const title = cleanText(item.title, 90);
  const date = cleanDate(item.date);
  if (!id || !title || !date) return null;
  return {
    id,
    title,
    type: validType(item.type) || "Tarea",
    date,
    subject: cleanText(item.subject, 80),
    note: cleanText(item.note, 240),
    horaInicio: cleanTime(item.horaInicio),
    horaFin: cleanTime(item.horaFin),
    done: Boolean(item.done),
    createdAt: Number(item.createdAt) || 0
  };
}

function buildModelRequest(input) {
  const systemInstruction = `Sos el asistente de agenda academica de Estudiemos. Tu trabajo es comprender ordenes naturales en espanol rioplatense y convertirlas en un plan exacto de cambios, no conversar ni copiar la orden como titulo.

Reglas de razonamiento:
- Interpreta la intencion completa, incluyendo negaciones, excepciones, pronombres, plurales, materias compartidas y varias acciones en una misma frase.
- Usa la agenda recibida como unica fuente de verdad para borrar o editar. En deleteIds usa solamente IDs que existan.
- Si piden borrar eventos fuera de determinados dias, conserva los de los dias permitidos y selecciona todos los demas de esa materia.
- Si piden quitar duplicados, conserva el registro mas antiguo de cada coincidencia por materia, fecha y horario, y elimina los posteriores.
- No conviertas frases como "elimina...", "cambia..." o "mueve..." en eventos nuevos.
- Para horarios semanales usa createSchedules. El domingo es 0, lunes 1, martes 2, miercoles 3, jueves 4, viernes 5 y sabado 6.
- Para eventos de una sola fecha usa createEvents.
- Si el usuario no indica el periodo de una recurrencia, usa el rango predeterminado recibido.
- Si una hora es ambigua, usa el contexto habitual universitario; si no hay contexto suficiente, pedi una aclaracion.
- Ejecuta toda la orden solicitada en un solo plan. No agregues acciones no pedidas.
- Si falta un dato indispensable o hay dos interpretaciones peligrosas, completa clarification y deja todas las acciones vacias.
- Responde exclusivamente con el JSON solicitado.`;

  const userContext = {
    instruccion: input.instruction,
    hoy: input.today,
    zonaHoraria: input.timezone,
    rangoPredeterminado: { desde: input.dateFrom, hasta: input.dateUntil },
    materiasConocidas: input.subjects,
    agendaActual: input.agenda
  };

  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(userContext) }] }],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };
}

function sanitizePlan(raw, agenda) {
  const source = raw && typeof raw === "object" ? raw : {};
  const validIds = new Set(agenda.map((item) => item.id));
  const deleteIds = [...new Set(Array.isArray(source.deleteIds) ? source.deleteIds.map((id) => cleanText(id, 180)) : [])]
    .filter((id) => validIds.has(id))
    .slice(0, MAX_AGENDA_ITEMS);
  const deleted = new Set(deleteIds);

  const createSchedules = Array.isArray(source.createSchedules)
    ? source.createSchedules.map(sanitizeSchedule).filter(Boolean).slice(0, 50)
    : [];
  const createEvents = Array.isArray(source.createEvents)
    ? source.createEvents.map(sanitizeCreatedEvent).filter(Boolean).slice(0, 100)
    : [];
  const updates = Array.isArray(source.updates)
    ? source.updates.map((item) => sanitizeUpdate(item, validIds)).filter((item) => item && !deleted.has(item.id)).slice(0, 100)
    : [];

  return {
    summary: cleanText(source.summary, 300) || "Plan de cambios listo para revisar.",
    clarification: cleanText(source.clarification, 300),
    createSchedules,
    createEvents,
    deleteIds,
    updates
  };
}

function sanitizeSchedule(item) {
  if (!item || typeof item !== "object") return null;
  const subject = cleanText(item.subject, 80);
  const title = cleanText(item.title, 90) || (subject ? `Clase de ${subject}` : "Clase");
  const dateFrom = cleanDate(item.dateFrom);
  const dateUntil = cleanDate(item.dateUntil);
  const weekdays = [...new Set(Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [])]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort();
  const horaInicio = cleanTime(item.horaInicio);
  const horaFin = cleanTime(item.horaFin);
  if (!title || !dateFrom || !dateUntil || dateFrom > dateUntil || !weekdays.length) return null;
  if ((horaInicio || horaFin) && (!horaInicio || !horaFin || horaInicio >= horaFin)) return null;
  return {
    title,
    subject,
    type: validType(item.eventType) || "Clase",
    days: weekdays,
    dateFrom,
    dateUntil,
    horaInicio,
    horaFin,
    note: cleanText(item.note, 240) || "Horario de cursado"
  };
}

function sanitizeCreatedEvent(item) {
  if (!item || typeof item !== "object") return null;
  const title = cleanText(item.title, 90);
  const date = cleanDate(item.date);
  const horaInicio = cleanTime(item.horaInicio);
  const horaFin = cleanTime(item.horaFin);
  if (!title || !date) return null;
  if ((horaInicio || horaFin) && (!horaInicio || !horaFin || horaInicio >= horaFin)) return null;
  return {
    title,
    type: validType(item.eventType) || "Tarea",
    date,
    subject: cleanText(item.subject, 80),
    note: cleanText(item.note, 240),
    horaInicio,
    horaFin,
    done: Boolean(item.done)
  };
}

function sanitizeUpdate(item, validIds) {
  if (!item || typeof item !== "object") return null;
  const id = cleanText(item.id, 180);
  if (!validIds.has(id)) return null;
  const update = { id };
  if (Object.prototype.hasOwnProperty.call(item, "title")) update.title = cleanText(item.title, 90);
  if (Object.prototype.hasOwnProperty.call(item, "eventType")) update.type = validType(item.eventType);
  if (Object.prototype.hasOwnProperty.call(item, "date")) update.date = cleanDate(item.date);
  if (Object.prototype.hasOwnProperty.call(item, "subject")) update.subject = cleanText(item.subject, 80);
  if (Object.prototype.hasOwnProperty.call(item, "note")) update.note = cleanText(item.note, 240);
  if (Object.prototype.hasOwnProperty.call(item, "horaInicio")) update.horaInicio = cleanTime(item.horaInicio);
  if (Object.prototype.hasOwnProperty.call(item, "horaFin")) update.horaFin = cleanTime(item.horaFin);
  if (Object.prototype.hasOwnProperty.call(item, "done")) update.done = Boolean(item.done);
  if (!update.title && Object.prototype.hasOwnProperty.call(update, "title")) delete update.title;
  if (!update.type && Object.prototype.hasOwnProperty.call(update, "type")) delete update.type;
  if (!update.date && Object.prototype.hasOwnProperty.call(update, "date")) delete update.date;
  return Object.keys(update).length > 1 ? update : null;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

function cleanTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function validType(value) {
  const allowed = ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"];
  return allowed.includes(value) ? value : "";
}
