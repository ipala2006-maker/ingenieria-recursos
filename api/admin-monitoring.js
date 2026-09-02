const { hasValidAdminToken } = require("./_lib/admin-auth");
const { enforceRateLimit, setSecurityHeaders } = require("./_lib/request-security");
const { adminRequest, isConfigured } = require("./_lib/supabase-admin");

module.exports = async function adminMonitoring(request, response) {
  setSecurityHeaders(response);
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ message: "Method Not Allowed" });
  }
  if (!(await enforceRateLimit(request, response, { route: "admin-monitoring", limit: 12, windowSeconds: 900 }))) return;
  if (!isConfigured() || !hasValidAdminToken(request)) {
    return response.status(401).json({ message: "Unauthorized" });
  }

  const startedAt = Date.now();
  let database = "ok";
  try {
    await adminRequest("/rest/v1/user_registry?select=user_id&limit=1");
  } catch (_) {
    database = "error";
  }

  const services = {
    web: "ok",
    database,
    ai: process.env.GEMINI_API_KEY ? "configured" : "not_configured",
    whatsapp: allConfigured([
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID"
    ]),
    androidPush: allConfigured(["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_JSON"]),
    captcha: process.env.TURNSTILE_SITE_KEY ? "configured" : "not_configured"
  };
  const healthy = database === "ok";
  return response.status(healthy ? 200 : 503).json({
    healthy,
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    version: String(process.env.VERCEL_GIT_COMMIT_SHA || "unknown").slice(0, 12),
    services
  });
};

function allConfigured(names) {
  return names.every((name) => Boolean(process.env[name])) ? "configured" : "not_configured";
}
