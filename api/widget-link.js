const crypto = require("crypto");
const { adminRequest, authenticateBearer, isConfigured } = require("./_lib/supabase-admin");

const LINK_LIFETIME_SECONDS = 120;
const APP_ORIGIN = "https://estudiemos-app.vercel.app";
const VALID_WIDGETS = new Set(["workspace", "inbox", "calendar", "pomodoro", "streak"]);

module.exports = async function widgetLink(request, response) {
  setHeaders(response);
  if (!isConfigured()) return response.status(503).json({ message: "La conexión de cuenta no está disponible." });

  try {
    if (request.method === "POST") return createHandoff(request, response);
    if (request.method === "GET") return redeemHandoff(request, response);
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ message: "Método no permitido." });
  } catch (error) {
    console.error("Widget account handoff failed", error);
    return response.status(503).json({ message: "No pudimos conectar la cuenta con el widget." });
  }
};

async function createHandoff(request, response) {
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  const user = await authenticateBearer(request.headers.authorization);
  if (!user?.id) return response.status(401).json({ message: "Ingresá a tu cuenta antes de agregar el widget." });

  const widget = normalizeWidget(request.body?.widget);
  if (!widget) return response.status(400).json({ message: "Widget no válido." });

  const expiresAt = Math.floor(Date.now() / 1000) + LINK_LIFETIME_SECONDS;
  const payload = {
    sub: user.id,
    widget,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString("base64url")
  };
  return response.status(200).json({
    token: signPayload(payload),
    expiresAt: new Date(expiresAt * 1000).toISOString()
  });
}

async function redeemHandoff(request, response) {
  const payload = verifyToken(String(request.query?.token || ""));
  if (!payload) return response.status(401).send("Este acceso temporal venció. Volvé a agregar el widget desde Estudiemos.");

  const widget = normalizeWidget(payload.widget);
  if (!widget) return response.status(400).send("Widget no válido.");

  const user = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(payload.sub)}`);
  if (!user?.email) return response.status(404).send("No encontramos la cuenta.");

  const redirectTo = `${APP_ORIGIN}/widget.html?view=${encodeURIComponent(widget)}&embed=rainmeter&linked=1`;
  const generated = await adminRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email: user.email, redirect_to: redirectTo })
  });
  if (!generated?.action_link) throw new Error("SUPABASE_LINK_MISSING");

  response.statusCode = 302;
  response.setHeader("Location", generated.action_link);
  return response.end();
}

function signPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || encoded.length > 1024 || signature.length > 128) return null;
  const expected = crypto.createHmac("sha256", signingSecret()).update(encoded).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch (_) { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload?.sub || !normalizeWidget(payload.widget) || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function signingSecret() {
  return `${process.env.SUPABASE_SECRET_KEY}:estudiemos-widget-link:v1`;
}

function normalizeWidget(value) {
  const widget = String(value || "").toLowerCase();
  return VALID_WIDGETS.has(widget) ? widget : "";
}

function setHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function isSameOriginRequest(request) {
  const origin = String(request.headers?.origin || "");
  if (!origin) return true;
  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "").split(",")[0].trim();
  try { return new URL(origin).host === host; } catch (_) { return false; }
}
