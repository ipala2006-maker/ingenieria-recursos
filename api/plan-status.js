const { getAuthenticatedPlan, setTestPlan } = require("./_lib/plan-access");
const { claimReferral, confirmReferralPhone, getReferralStatus, referralErrorMessage } = require("./_lib/referrals");
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
      const action = String(request.body?.action || "");
      if (action === "claim-referral") {
        const result = await claimReferral(request, request.body?.code);
        if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para usar referidos." });
        if (result.error) return response.status(400).json({ message: result.error });
        return response.status(200).json(result.status);
      }
      if (action === "confirm-referral-phone") {
        const result = await confirmReferralPhone(request);
        if (!result.authenticated) return response.status(401).json({ message: "Ingresá a tu cuenta para usar referidos." });
        if (result.error) return response.status(409).json({ message: result.error });
        return response.status(200).json(result.status);
      }
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
    if (String(request.body?.action || "").includes("referral")) {
      return response.status(409).json({ message: referralErrorMessage(error) });
    }
    return response.status(503).json({ message: "No pudimos consultar el plan en este momento." });
  }
};

async function referralStatus(request) {
  return getReferralStatus(request);
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
      code: String(referral?.code || ""),
      phoneVerified: Boolean(referral?.phoneVerified),
      phoneMasked: String(referral?.phoneMasked || ""),
      wasReferred: Boolean(referral?.wasReferred),
      discountPercent: Math.max(0, Number(referral?.discountPercent) || 0),
      discountValidUntil: referral?.discountValidUntil || null,
      qualifiedDirectCount: Math.max(0, Number(referral?.qualifiedDirectCount) || 0),
      pendingPaymentCount: Math.max(0, Number(referral?.pendingPaymentCount) || 0),
      reason: String(referral?.reason || "none")
    }
  };
}

function normalizeUsage(value, limit) {
  return { used: Math.max(0, Number(value?.used) || 0), limit };
}
