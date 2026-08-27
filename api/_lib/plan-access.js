const { authenticateBearer } = require("./supabase-admin");

const REQUEST_TIMEOUT_MS = 12000;

async function getAuthenticatedPlan(request) {
  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return { authenticated: false };
  const status = await userRpc(authorization, "get_plan_status", {});
  return { authenticated: true, user, status };
}

async function consumePlanAction(request, feature) {
  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return { authenticated: false };
  const usage = await userRpc(authorization, "consume_plan_action", { target_feature: feature });
  return { authenticated: true, user, usage };
}

async function setTestPlan(request, planId) {
  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return { authenticated: false };
  const status = await userRpc(authorization, "set_test_plan", { target_plan: planId });
  return { authenticated: true, user, status };
}

async function userRpc(authorization, functionName, body) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) throw new Error("PLAN_SERVICE_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: authorization,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.hint || `Plan service ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function planLimitMessage(feature, usage) {
  const label = feature === "whatsapp" ? "órdenes por WhatsApp" : "acciones de IA";
  return `Alcanzaste las ${usage?.limit || 0} ${label} incluidas este mes en tu plan.`;
}

module.exports = { consumePlanAction, getAuthenticatedPlan, planLimitMessage, setTestPlan, userRpc };
