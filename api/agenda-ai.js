// This function keeps the model credential on Vercel and out of the browser.
const { consumePlanAction, planLimitMessage } = require("./_lib/plan-access");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MAX_AGENDA_ITEMS = 500;
const MAX_INSTRUCTION_LENGTH = 1200;
const MAX_RANGE_DAYS = 370;
const REQUEST_TIMEOUT_MS = 50000;
const MODEL_RETRY_DELAY_MS = 900;

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
          horaInicio: { type: "string", description: "Hora HH:MM solo si el usuario la indico; en otro caso cadena vacia." },
          horaFin: { type: "string", description: "Hora HH:MM solo si el usuario la indico; en otro caso cadena vacia." },
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
          date: { type: "string", description: "Fecha YYYY-MM-DD solo si el usuario menciono una fecha o dia; en otro caso cadena vacia para guardar en Inbox." },
          subject: { type: "string" },
          note: { type: "string" },
          horaInicio: { type: "string", description: "Hora HH:MM solo si el usuario la indico; en otro caso cadena vacia." },
          horaFin: { type: "string", description: "Hora HH:MM solo si el usuario la indico; en otro caso cadena vacia." },
          done: { type: "boolean" }
        },
        required: ["title", "eventType", "date", "subject", "note", "horaInicio", "horaFin", "done"]
      }
    },
    deleteIds: {
      type: "array",
      description: "IDs exactos de anotaciones individuales que se deben eliminar. No usar para borrados masivos o condicionales.",
      items: { type: "string" }
    },
    deleteRules: {
      type: "array",
      description: "Reglas para borrados masivos o condicionales. El servidor las aplica de forma exacta sobre Inbox y calendario.",
      items: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Materia afectada. Vacio solamente si la orden abarca todo Inbox y calendario." },
          titleContains: { type: "string", description: "Texto que debe contener el titulo. Vacio si no corresponde." },
          dateFrom: { type: "string", description: "Fecha inicial YYYY-MM-DD. Vacio si no hay limite." },
          dateUntil: { type: "string", description: "Fecha final YYYY-MM-DD. Vacio si no hay limite." },
          deleteAll: { type: "boolean", description: "Eliminar todo lo que coincida con materia, titulo y fechas." },
          keepWeekdays: { type: "array", description: "Conservar estos dias y eliminar los demas dentro del alcance.", items: { type: "integer" } },
          deleteWeekdays: { type: "array", description: "Eliminar solamente estos dias dentro del alcance.", items: { type: "integer" } },
          removeDuplicates: { type: "boolean", description: "Eliminar duplicados conservando siempre el registro mas antiguo." }
        },
        required: ["subject", "titleContains", "dateFrom", "dateUntil", "deleteAll", "keepWeekdays", "deleteWeekdays", "removeDuplicates"]
      }
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
  required: ["summary", "clarification", "createSchedules", "createEvents", "deleteIds", "deleteRules", "updates"]
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

  let access;
  try {
    access = await consumePlanAction(request, "ai");
  } catch (error) {
    return response.status(503).json({ code: "PLAN_UNAVAILABLE", error: "No pudimos comprobar tu plan. Probá nuevamente." });
  }
  if (!access.authenticated) return response.status(401).json({ code: "AUTH_REQUIRED", error: "Ingresá a tu cuenta para usar el asistente." });
  if (!access.usage?.allowed) {
    return response.status(429).json({ code: "PLAN_LIMIT_REACHED", error: planLimitMessage("ai", access.usage), usage: access.usage });
  }

  try {
    const plan = await createAgendaPlan(input.value);
    return response.status(200).json(plan);
  } catch (error) {
    if (error?.code === "AI_BUSY" || error?.code === "AI_REQUEST_FAILED") {
      return response.status(error.code === "AI_BUSY" ? 503 : 502).json({
        code: error.code,
        error: error.code === "AI_BUSY"
          ? "La IA esta ocupada en este momento. Proba nuevamente en unos segundos."
          : "No se pudo interpretar la instruccion.",
        details: error.details || ""
      });
    }
    const timedOut = error?.name === "AbortError";
    return response.status(503).json({
      code: timedOut ? "AI_TIMEOUT" : "AI_CONNECTION_FAILED",
      error: timedOut
        ? "La IA tardo demasiado en responder. Proba nuevamente."
        : "No se pudo conectar con la IA en este momento."
    });
  }
};

async function createAgendaPlan(input) {
  const { modelResponse, payload } = await requestModel(buildModelRequest(input));
  if (!modelResponse.ok) {
    const error = new Error("Agenda AI request failed");
    error.code = modelResponse.status === 429 || modelResponse.status >= 500 ? "AI_BUSY" : "AI_REQUEST_FAILED";
    error.details = cleanText(payload?.error?.message, 300);
    throw error;
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return sanitizePlan(JSON.parse(text), input);
}

async function requestModel(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let modelResponse;
  let payload;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      modelResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );
      payload = await modelResponse.json().catch(() => null);
      const retryable = modelResponse.status === 429 || modelResponse.status >= 500;
      if (modelResponse.ok || !retryable || attempt === 1) break;
      await wait(MODEL_RETRY_DELAY_MS);
    }
    return { modelResponse, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
  if (JSON.stringify(source).length > 200000) return { ok: false, error: "Los datos de Inbox y calendario son demasiado grandes." };
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
  const rawDate = String(item.date || "").trim();
  const date = cleanDate(rawDate);
  if (!id || !title || (rawDate && !date)) return null;
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
  const systemInstruction = `Sos el asistente de organizacion academica de Estudiemos. Tu trabajo es comprender ordenes naturales en espanol rioplatense y convertirlas en un plan exacto de cambios, no conversar ni copiar la orden como titulo.

Reglas de razonamiento:
- Inbox es la lista de tareas, recordatorios y anotaciones pendientes. Es completamente valido crear elementos de Inbox sin fecha.
- Interpreta la intencion completa, incluyendo negaciones, excepciones, pronombres, plurales, materias compartidas y varias acciones en una misma frase.
- Usa Inbox y el calendario recibidos como unica fuente de verdad para borrar o editar. En deleteIds usa solamente IDs que existan.
- Si piden borrar eventos fuera de determinados dias, conserva los de los dias permitidos y selecciona todos los demas de esa materia.
- Si piden quitar duplicados, conserva el registro mas antiguo de cada coincidencia por materia, fecha y horario, y elimina los posteriores.
- Para borrados masivos, por materia, por dias, por rango o de duplicados usa deleteRules y deja deleteIds vacio. El servidor elegira los IDs exactos.
- En deleteRules: keepWeekdays expresa los dias que deben conservarse; deleteWeekdays los que deben borrarse; removeDuplicates conserva el mas antiguo; deleteAll borra todo el alcance.
- Usa deleteIds solamente cuando el usuario identifica una o pocas anotaciones concretas y no hace falta una regla.
- No conviertas frases como "elimina...", "cambia..." o "mueve..." en eventos nuevos.
- Para horarios semanales usa createSchedules. El domingo es 0, lunes 1, martes 2, miercoles 3, jueves 4, viernes 5 y sabado 6.
- No uses createSchedules para una tarea o anotacion comun si el usuario no indico dias recurrentes.
- Si varias materias comparten dias y horario, crea un horario separado para cada materia. Nunca combines dos materias conocidas en un mismo title o subject.
- Para tareas, recordatorios y anotaciones usa createEvents, tengan fecha o no.
- Si el usuario no menciona una fecha, un dia o una expresion temporal concreta, deja date como cadena vacia. No uses hoy ni el rango predeterminado y no pidas una fecha: la anotacion pertenece a Inbox.
- Solo completa date cuando la instruccion menciona una fecha o un dia concreto, por ejemplo "hoy", "manana", "el viernes" o "23 de agosto".
- Si el usuario pide expresamente una tarea o anotacion "sin fecha", deja date como cadena vacia.
- Las horas son opcionales. Si el usuario no menciona una hora concreta, devuelve horaInicio y horaFin como cadenas vacias. Nunca inventes horarios para tareas, parciales, entregas, recordatorios ni sesiones de estudio.
- Solo completa horaInicio y horaFin cuando la instruccion incluye una hora o un rango horario explicito. Expresiones generales como "manana", "por la tarde" o "cuando pueda" no autorizan a inferir una hora exacta.
- Si el usuario no indica el periodo de una recurrencia, usa el rango predeterminado recibido.
- Si el usuario proporciona una hora pero su formato es realmente ambiguo, pedi una aclaracion. No completes la ambiguedad por tu cuenta.
- Ejecuta toda la orden solicitada en un solo plan. No agregues acciones no pedidas.
- Si falta un dato indispensable o hay dos interpretaciones peligrosas, completa clarification y deja todas las acciones vacias.
- agendaActualGrupos agrupa anotaciones con los mismos datos para evitar repeticiones. Lee datos y eventos segun sus listas de campos; cada evento conserva su ID, fecha y orden de creacion exactos.
- Responde exclusivamente con el JSON solicitado.`;

  const userContext = {
    instruccion: input.instruction,
    hoy: input.today,
    zonaHoraria: input.timezone,
    rangoPredeterminado: { desde: input.dateFrom, hasta: input.dateUntil },
    materiasConocidas: input.subjects,
    agendaActualDatosCampos: ["titulo", "tipo", "materia", "nota", "horaInicio", "horaFin", "hecha"],
    agendaActualEventoCampos: ["id", "fecha", "creadaEn"],
    agendaActualGrupos: compactAgendaForModel(selectAgendaForModel(input))
  };

  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(userContext) }] }],
    generationConfig: {
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };
}

function selectAgendaForModel(input) {
  const instruction = normalizeText(input.instruction);
  const mentionedSubjects = input.subjects
    .map(normalizeText)
    .filter((subject) => subject && instruction.includes(subject));
  if (!mentionedSubjects.length) return input.agenda;

  return input.agenda.filter((item) => {
    const subject = normalizeText(item.subject);
    const title = normalizeText(item.title);
    return mentionedSubjects.some((mentioned) => subject === mentioned || title.includes(mentioned));
  });
}

function compactAgendaForModel(agenda) {
  const groups = new Map();
  agenda.forEach((item) => {
    const data = [
      item.title,
      item.type,
      item.subject,
      item.note,
      item.horaInicio,
      item.horaFin,
      item.done ? 1 : 0
    ];
    const key = JSON.stringify(data);
    if (!groups.has(key)) groups.set(key, { datos: data, eventos: [] });
    groups.get(key).eventos.push([item.id, item.date, item.createdAt]);
  });
  return [...groups.values()];
}

function sanitizePlan(raw, input) {
  const source = raw && typeof raw === "object" ? raw : {};
  const agenda = input.agenda;
  const validIds = new Set(agenda.map((item) => item.id));
  const directDeleteIds = Array.isArray(source.deleteIds) ? source.deleteIds.map((id) => cleanText(id, 180)) : [];
  const ruleDeleteIds = expandDeleteRules(source.deleteRules, agenda);
  const deleteIds = [...new Set([...directDeleteIds, ...ruleDeleteIds])]
    .filter((id) => validIds.has(id))
    .slice(0, MAX_AGENDA_ITEMS);
  const deleted = new Set(deleteIds);

  const keepGeneratedTimes = instructionHasExplicitTime(input.instruction);
  const keepGeneratedDates = instructionHasExplicitDate(input.instruction);
  const sanitizedSchedules = Array.isArray(source.createSchedules)
    ? source.createSchedules.map(sanitizeSchedule).filter(Boolean).slice(0, 50)
    : [];
  const createSchedules = splitCombinedSchedules(sanitizedSchedules, input.subjects)
    .map((item) => applyInstructionTimePolicy(item, keepGeneratedTimes))
    .slice(0, 50);
  const createEvents = Array.isArray(source.createEvents)
    ? source.createEvents
      .map(sanitizeCreatedEvent)
      .filter(Boolean)
      .map((item) => applyInstructionDatePolicy(item, keepGeneratedDates))
      .map((item) => applyInstructionTimePolicy(item, keepGeneratedTimes))
      .slice(0, 100)
    : [];
  const updates = Array.isArray(source.updates)
    ? source.updates
      .map((item) => sanitizeUpdate(item, validIds))
      .filter((item) => item && !deleted.has(item.id))
      .map((item) => applyInstructionTimePolicy(item, keepGeneratedTimes, true))
      .slice(0, 100)
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

function applyInstructionTimePolicy(item, keepTimes, preserveExisting = false) {
  if (keepTimes) return item;
  const result = { ...item };
  if (preserveExisting) {
    delete result.horaInicio;
    delete result.horaFin;
  } else {
    if (Object.prototype.hasOwnProperty.call(result, "horaInicio")) result.horaInicio = "";
    if (Object.prototype.hasOwnProperty.call(result, "horaFin")) result.horaFin = "";
  }
  return result;
}

function applyInstructionDatePolicy(item, keepDate) {
  return keepDate ? item : { ...item, date: "" };
}

function instructionHasExplicitDate(value) {
  const text = normalizeText(value);
  const original = String(value || "").toLowerCase();
  if (/\bsin\s+fecha\b/.test(text)) return false;
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(original) ||
    /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(original) ||
    /\b(?:hoy|manana|pasado manana|esta noche|este fin de semana|fin de mes)\b/.test(text) ||
    /\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(text) ||
    /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(text) ||
    /\b(?:esta|proxima|siguiente)\s+(?:semana|quincena|mes)\b/.test(text) ||
    /\b(?:la\s+)?(?:semana|quincena|mes)\s+que\s+viene\b/.test(text) ||
    /\b(?:dentro de|en)\s+\d+\s+(?:dia|dias|semana|semanas|mes|meses)\b/.test(text) ||
    /\b(?:el|para el|dia)\s+\d{1,2}\b/.test(text)
  );
}

function instructionHasExplicitTime(value) {
  const text = normalizeText(value);
  const original = String(value || "").toLowerCase();
  return (
    /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(original) ||
    /\b(?:a\s+las?|desde\s+las?|hasta\s+las?)\s+(?:[01]?\d|2[0-3])\b/.test(text) ||
    /\b(?:de|entre)\s+(?:las?\s+)?(?:[01]?\d|2[0-3])\s+(?:a|y)\s+(?:las?\s+)?(?:[01]?\d|2[0-3])\b/.test(text) ||
    /\b(?:[01]?\d|2[0-3])\s*(?:h|hs|am|pm)\b/.test(text) ||
    /\b(?:mediodia|medianoche)\b/.test(text)
  );
}

function splitCombinedSchedules(schedules, subjects) {
  const knownSubjects = subjects
    .map((subject) => ({ original: subject, normalized: normalizeText(subject) }))
    .filter((subject) => subject.normalized);

  return schedules.flatMap((schedule) => {
    const searchable = normalizeText(`${schedule.subject} ${schedule.title}`);
    const matches = knownSubjects.filter((subject) => hasNormalizedPhrase(searchable, subject.normalized));
    if (matches.length < 2) return [schedule];
    return matches.map((subject) => ({
      ...schedule,
      title: `Clase de ${subject.original}`,
      subject: subject.original
    }));
  });
}

function hasNormalizedPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

function expandDeleteRules(rawRules, agenda) {
  if (!Array.isArray(rawRules)) return [];
  const deleted = new Set();

  rawRules.slice(0, 50).forEach((rawRule) => {
    const rule = sanitizeDeleteRule(rawRule);
    if (!rule || !rule.hasAction) return;
    const scoped = agenda.filter((item) => matchesDeleteRuleScope(item, rule));

    scoped.forEach((item) => {
      const weekday = new Date(`${item.date}T12:00:00Z`).getUTCDay();
      if (
        rule.deleteAll ||
        (rule.keepWeekdays.length && !rule.keepWeekdays.includes(weekday)) ||
        rule.deleteWeekdays.includes(weekday)
      ) {
        deleted.add(item.id);
      }
    });

    if (rule.removeDuplicates) {
      const seen = new Set();
      [...scoped]
        .filter((item) => !deleted.has(item.id))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .forEach((item) => {
          const identity = normalizeText(item.subject) || normalizeText(item.title);
          const key = [identity, item.type, item.date, item.horaInicio, item.horaFin].join("|");
          if (seen.has(key)) deleted.add(item.id);
          else seen.add(key);
        });
    }
  });

  return [...deleted];
}

function sanitizeDeleteRule(rawRule) {
  if (!rawRule || typeof rawRule !== "object") return null;
  const keepWeekdays = cleanWeekdays(rawRule.keepWeekdays);
  const deleteWeekdays = cleanWeekdays(rawRule.deleteWeekdays);
  const deleteAll = Boolean(rawRule.deleteAll);
  const removeDuplicates = Boolean(rawRule.removeDuplicates);
  return {
    subject: normalizeText(cleanText(rawRule.subject, 80)),
    titleContains: normalizeText(cleanText(rawRule.titleContains, 90)),
    dateFrom: cleanDate(rawRule.dateFrom),
    dateUntil: cleanDate(rawRule.dateUntil),
    deleteAll,
    keepWeekdays,
    deleteWeekdays,
    removeDuplicates,
    hasAction: deleteAll || keepWeekdays.length > 0 || deleteWeekdays.length > 0 || removeDuplicates
  };
}

function cleanWeekdays(value) {
  return [...new Set(Array.isArray(value) ? value.map(Number) : [])]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort();
}

function matchesDeleteRuleScope(item, rule) {
  const itemSubject = normalizeText(item.subject);
  const itemTitle = normalizeText(item.title);
  if (rule.subject && itemSubject !== rule.subject && !itemTitle.includes(rule.subject)) return false;
  if (rule.titleContains && !itemTitle.includes(rule.titleContains)) return false;
  if (rule.dateFrom && item.date < rule.dateFrom) return false;
  if (rule.dateUntil && item.date > rule.dateUntil) return false;
  return true;
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
  const rawDate = String(item.date || "").trim();
  const date = cleanDate(rawDate);
  const horaInicio = cleanTime(item.horaInicio);
  const horaFin = cleanTime(item.horaFin);
  if (!title || (rawDate && !date)) return null;
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

module.exports.createAgendaPlan = createAgendaPlan;
module.exports.validateAgendaInput = validateInput;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
