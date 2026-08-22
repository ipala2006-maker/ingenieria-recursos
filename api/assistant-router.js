const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 30000;
const MAX_INSTRUCTION_LENGTH = 1200;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    destination: { type: "string", enum: ["agenda", "workspace", "none"] },
    clarification: { type: "string" },
    acknowledgement: { type: "string" }
  },
  required: ["destination", "clarification", "acknowledgement"]
};

module.exports = async function assistantRouter(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ message: "Método no permitido." });
  }
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (!process.env.GEMINI_API_KEY) return response.status(503).json({ message: "La IA todavía no está configurada." });
  if (!(await authenticateRequest(request))) return response.status(401).json({ message: "Ingresá a tu cuenta para usar el asistente." });

  const instruction = cleanText(request.body?.instruction, MAX_INSTRUCTION_LENGTH);
  if (instruction.length < 3) return response.status(400).json({ message: "Escribí una indicación más completa." });

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
        body: JSON.stringify(buildModelRequest(instruction)),
        signal: controller.signal
      }
    );
    const payload = await modelResponse.json().catch(() => null);
    if (!modelResponse.ok) {
      return response.status(modelResponse.status === 429 || modelResponse.status >= 500 ? 503 : 502).json({
        message: "La IA está ocupada. Probá nuevamente en unos segundos."
      });
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const route = sanitizeRoute(JSON.parse(text));
    return response.status(200).json({ route });
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

async function authenticateRequest(request) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const authorization = String(request.headers.authorization || "");
  if (!url || !key || !authorization.startsWith("Bearer ")) return false;
  try {
    const result = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization }
    });
    return result.ok;
  } catch (_) {
    return false;
  }
}

function buildModelRequest(instruction) {
  const systemInstruction = `Sos la entrada única del asistente de Estudiemos. Interpretá la intención del usuario y elegí qué herramienta especializada debe continuar.

- Usa destination "agenda" para tareas, anotaciones, parciales, recordatorios, clases, horarios, fechas, calendario o cualquier pedido de organización académica temporal.
- Usa destination "workspace" para crear, ordenar, mover o renombrar carpetas y archivos.
- Usa destination "none" cuando la instrucción mezcla ambos destinos de una forma que exige decidir un orden, cuando no alcanza la información o cuando no corresponde a ninguna herramienta.
- No inventes una intención. Si hay una ambigüedad relevante, hacé una sola pregunta breve y concreta en clarification.
- Si la intención es clara, clarification debe quedar vacía. No ejecutes cambios: solamente derivá la solicitud completa, sin reescribirla ni quitar detalles.
- Respondé en español rioplatense, con tono claro y amable.`;
  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: instruction }] }],
    generationConfig: {
      maxOutputTokens: 500,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    }
  };
}

function sanitizeRoute(raw) {
  const destination = ["agenda", "workspace"].includes(raw?.destination) ? raw.destination : "none";
  let clarification = cleanText(raw?.clarification, 300);
  if (destination === "none" && !clarification) {
    clarification = "¿Querés que te ayude con Inbox, el calendario o tus carpetas y archivos?";
  }
  return {
    destination,
    clarification,
    acknowledgement: cleanText(raw?.acknowledgement, 180)
  };
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

function cleanText(value, limit) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
