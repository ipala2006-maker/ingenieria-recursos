const crypto = require("crypto");
const { adminRequest, authenticateBearer, isConfigured } = require("./_lib/supabase-admin");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, requireJsonRequest, setSecurityHeaders } = require("./_lib/request-security");

const LINK_LIFETIME_SECONDS = 120;
const { publicOrigin } = require('../shared/course-app-links');
const OTP_HASH = /^[a-f0-9]{64}$/i;
const VALID_WIDGETS = new Set(["workspace", "inbox", "calendar", "pomodoro", "streak"]);

module.exports = async function widgetLink(request, response) {
  setHeaders(response);
  if(request.method==='GET' && request.query?.alarmFeed==='1' && !request.query?.alarmSetup){
    return response.status(410).json(require('../.well-known/windows-alarms-retired.json'));
  }
  if (!isConfigured()) return response.status(503).json({ message: "La conexión de cuenta no está disponible." });
  if (rejectOversizedBody(request, response, 8 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route:'widget-link', limit:30, windowSeconds:60 }))) return;

  try {
    if (request.query?.alarmSetup || request.query?.alarmFeed === '1' || ['alarms-connect','alarms-confirm'].includes(request.body?.action)) {
      return await require('./_lib/inbox-alarm-feed')(request, response);
    }
    if (request.method === "POST") return await createHandoff(request, response);
    if (request.method === "GET") return await redeemHandoff(request, response);
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ message: "Método no permitido." });
  } catch (error) {
    console.error("Widget account handoff failed", { name: error?.name, status: error?.status });
    return response.status(503).json({ message: "No pudimos conectar la cuenta con el widget." });
  }
};

async function createHandoff(request, response) {
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (!requireJsonRequest(request, response)) return;
  const user = await authenticateBearer(request.headers.authorization);
  if (!user?.id || !user.email || !user.email_confirmed_at) return response.status(401).json({ message: "Ingresá con una cuenta verificada antes de agregar el widget." });

  const widget = normalizeWidget(request.body?.widget);
  if (!widget) return response.status(400).json({ message: "Widget no válido." });
  if (widget === 'workspace' && !require('../shared/release').enabled('workspace')) return response.status(503).json({ code: 'FEATURE_COMING_SOON', message: 'Mi espacio: próximamente.' });

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
  if (widget === 'workspace' && !require('../shared/release').enabled('workspace')) return response.status(503).send('Mi espacio: próximamente.');

  const user = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(payload.sub)}`);
  if (user?.id !== payload.sub || !user.email || !user.email_confirmed_at) return response.status(404).send("No encontramos la cuenta.");
  const generated = await adminRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email: user.email })
  });
  if (!OTP_HASH.test(generated?.hashed_token || "") || generated.id !== user.id) throw new Error("SUPABASE_WIDGET_LINK_INVALID");

  // Keep the OTP in the fragment, without using the provider's redirect URL.
  const destination = new URL('/widget.html', publicOrigin());
  destination.search = new URLSearchParams({view:widget,embed:'rainmeter',linked:'1'});
  destination.hash = new URLSearchParams({widget_otp:generated.hashed_token});
  response.statusCode = 302;
  response.setHeader("Location", destination.href);
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
    if (!payload?.sub || !normalizeWidget(payload.widget) || !Number.isSafeInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
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
  setSecurityHeaders(response);
}
