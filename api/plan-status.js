const { getAuthenticatedPlan, setTestPlan } = require("./_lib/plan-access");
const plans = require("../shared/plans");

module.exports = async function planStatus(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });

  try {
    if (request.method === "GET") {
      const result = await getAuthenticatedPlan(request);
      if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para ver el plan." });
      return response.status(200).json(normalizeStatus(result.status));
    }
    if (request.method === "POST") {
      const planId = String(request.body?.planId || "");
      if (!plans.ids().includes(planId)) return response.status(400).json({ message: "Plan inválido." });
      const result = await setTestPlan(request, planId);
      if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para probar un plan." });
      return response.status(200).json(normalizeStatus(result.status));
    }
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ message: "Método no permitido." });
  } catch (error) {
    console.error("Plan status failed", error);
    return response.status(503).json({ message: "No pudimos consultar el plan en este momento." });
  }
};

function normalizeStatus(value) {
  const plan = plans.get(value?.planId);
  return {
    planId: plan.id,
    mode: value?.mode === "active" ? "active" : "test",
    billingEnabled: Boolean(value?.billingEnabled),
    storageBytes: plan.storageBytes,
    ai: normalizeUsage(value?.ai, plan.monthlyAiActions),
    whatsapp: normalizeUsage(value?.whatsapp, plan.monthlyWhatsappActions)
  };
}

function normalizeUsage(value, limit) {
  return { used: Math.max(0, Number(value?.used) || 0), limit };
}

function isSameOriginRequest(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return true;
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
  try { return new URL(origin).host === host; } catch (_) { return false; }
}
