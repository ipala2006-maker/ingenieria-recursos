const { getAuthenticatedPlan, setTestPlan, userRpc } = require("./_lib/plan-access");
const plans = require("../shared/plans");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, requireJsonRequest, setSecurityHeaders } = require("./_lib/request-security");

module.exports = async function planStatus(request, response) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (request.method === "POST" && !requireJsonRequest(request, response)) return;
  if (rejectOversizedBody(request, response, 8 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route: "plan-status", limit: 60, windowSeconds: 60 }))) return;

  try {
    if (request.method === "GET") {
      const result = await getAuthenticatedPlan(request);
      if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para ver el plan." });
      const referral = await referralStatus(request).catch(() => null);
      return response.status(200).json(normalizeStatus(result.status, referral));
    }
    if (request.method === "POST") {
      const planId = String(request.body?.planId || "");
      if (!plans.ids().includes(planId)) return response.status(400).json({ message: "Plan inválido." });
      const result = await setTestPlan(request, planId);
      if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para probar un plan." });
      const referral = await referralStatus(request).catch(() => null);
      return response.status(200).json(normalizeStatus(result.status, referral));
    }
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ message: "Método no permitido." });
  } catch (error) {
    console.error("Plan status failed", error);
    return response.status(503).json({ message: "No pudimos consultar el plan en este momento." });
  }
};

async function referralStatus(request) {
  return userRpc(String(request.headers.authorization || ""), "get_referral_status", {});
}

function normalizeStatus(value, referral = null) {
  const plan = plans.get(value?.planId);
  return {
    planId: plan.id,
    mode: value?.mode === "active" ? "active" : "test",
    billingEnabled: Boolean(value?.billingEnabled),
    storageBytes: plan.storageBytes,
    ai: normalizeUsage(value?.ai, plan.monthlyAiActions),
    whatsapp: normalizeUsage(value?.whatsapp, plan.monthlyWhatsappActions),
    referral: {
      discountPercent: Math.max(0, Number(referral?.discountPercent) || 0),
      qualifiedDirectCount: Math.max(0, Number(referral?.qualifiedDirectCount) || 0)
    }
  };
}

function normalizeUsage(value, limit) {
  return { used: Math.max(0, Number(value?.used) || 0), limit };
}
