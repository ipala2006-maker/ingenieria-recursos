const { authenticateBearer } = require("./_lib/supabase-admin");
const { isConfigured, sendWidgetSync } = require("./_lib/firebase-push");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, setSecurityHeaders } = require("./_lib/request-security");

module.exports = async function widgetPush(request, response) {
  setSecurityHeaders(response);
  if (request.query?.mobilePush) return require('./_lib/mobile-push')(request, response);
  if (request.method !== "POST") return response.status(405).json({ message: "Metodo no permitido." });
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (rejectOversizedBody(request, response, 8 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route: "widget-push", limit: 60, windowSeconds: 60 }))) return;
  const user = await authenticateBearer(request.headers.authorization);
  if (!user) return response.status(401).json({ message: "Sesion invalida." });
  if (!isConfigured()) return response.status(202).json({ enabled: false, sent: 0 });

  try {
    const devices = await readOwnDevices(request.headers.authorization, user.id);
    const tokens = Array.isArray(devices)
      ? devices.map((device) => typeof device === "string" ? device : device?.token)
        .filter(token => typeof token === 'string' && token.trim().length > 0 && token.length <= 4096 && token !== request.body?.excludeToken)
      : [];
    const result = await sendWidgetSync(tokens);
    return response.status(200).json(result);
  } catch (_) {
    return response.status(202).json({ enabled: true, sent: 0 });
  }
};

async function readOwnDevices(authorization, userId) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const query = new URLSearchParams({select:'devices:state->values->estudiemos_android_devices',user_id:`eq.${userId}`,limit:'1'});
  const response = await fetch(`${url}/rest/v1/user_states?${query}`, {
    headers: { apikey: key, Authorization: authorization }
  });
  if (!response.ok) throw new Error("STATE_READ_FAILED");
  const rows = await response.json();
  let devices = Array.isArray(rows) && rows[0] ? rows[0].devices : null;
  if (typeof devices === 'string') {
    try { devices = JSON.parse(devices); } catch (_) { return []; }
  }
  return devices;
}
