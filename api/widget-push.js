const { authenticateBearer } = require("./_lib/supabase-admin");
const { isConfigured, sendWidgetSync } = require("./_lib/firebase-push");

module.exports = async function widgetPush(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (request.method !== "POST") return response.status(405).json({ message: "Metodo no permitido." });
  const user = await authenticateBearer(request.headers.authorization);
  if (!user) return response.status(401).json({ message: "Sesion invalida." });
  if (!isConfigured()) return response.status(202).json({ enabled: false, sent: 0 });

  try {
    const state = await readOwnState(request.headers.authorization);
    const devices = state?.values?.estudiemos_android_devices;
    const tokens = Array.isArray(devices)
      ? devices.map((device) => typeof device === "string" ? device : device?.token).filter(Boolean)
      : [];
    const result = await sendWidgetSync(tokens);
    return response.status(200).json(result);
  } catch (_) {
    return response.status(202).json({ enabled: true, sent: 0 });
  }
};

async function readOwnState(authorization) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const response = await fetch(`${url}/rest/v1/user_states?select=state&limit=1`, {
    headers: { apikey: key, Authorization: authorization }
  });
  if (!response.ok) throw new Error("STATE_READ_FAILED");
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0].state : null;
}
