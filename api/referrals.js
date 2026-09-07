const crypto = require("crypto");
const { adminRequest, authenticateBearer } = require("./_lib/supabase-admin");
const { userRpc } = require("./_lib/plan-access");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, requireJsonRequest, setSecurityHeaders } = require("./_lib/request-security");

module.exports = async function referrals(request, response) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (request.method === "POST" && !requireJsonRequest(request, response)) return;
  if (rejectOversizedBody(request, response, 8 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route: "referrals", limit: 20, windowSeconds: 60 }))) return;

  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return response.status(401).json({ message: "Ingresá a tu cuenta para usar referidos." });

  try {
    if (request.method === "GET") {
      return response.status(200).json(await userRpc(authorization, "get_referral_status", {}));
    }
    if (request.method === "POST") {
      const action = String(request.body?.action || "");
      if (action === "claim") {
        const code = normalizeCode(request.body?.code);
        if (code.length < 8) return response.status(400).json({ message: "El código de invitación no es válido." });
        return response.status(200).json(await userRpc(authorization, "claim_referral_code", { target_code: code }));
      }
      if (action === "confirm-phone") {
        const authUser = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "GET" });
        if (!authUser?.phone || !authUser?.phone_confirmed_at) {
          return response.status(409).json({ message: "Primero confirmá el código que recibiste por SMS." });
        }
        await adminRequest("/rest/v1/rpc/register_verified_referral_phone", {
          method: "POST",
          body: JSON.stringify({
            target_user_id: user.id,
            target_phone_hash: phoneHash(authUser.phone),
            target_phone_masked: maskPhone(authUser.phone)
          })
        });
        return response.status(200).json(await userRpc(authorization, "get_referral_status", {}));
      }
      return response.status(400).json({ message: "Acción de referidos inválida." });
    }
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ message: "Método no permitido." });
  } catch (error) {
    const message = referralErrorMessage(error);
    const status = /ya fue|mismo teléfono|propio|no es válido|verificá/i.test(message) ? 409 : 503;
    console.error("Referral request failed", { status: error?.status, code: error?.data?.code });
    return response.status(status).json({ message });
  }
};

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function phoneHash(phone) {
  const secret = process.env.REFERRAL_PHONE_HASH_SECRET || process.env.SUPABASE_SECRET_KEY || "";
  if (secret.length < 32) throw new Error("REFERRAL_PHONE_HASH_SECRET_NOT_CONFIGURED");
  return crypto.createHmac("sha256", secret).update(String(phone)).digest("hex");
}

function maskPhone(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length > 4 ? `+${clean.slice(0, 3)} •••• ${clean.slice(-4)}` : "Teléfono verificado";
}

function referralErrorMessage(error) {
  const raw = `${error?.message || ""} ${error?.data?.message || ""}`.toUpperCase();
  if (raw.includes("PHONE_VERIFICATION_REQUIRED")) return "Verificá tu teléfono antes de usar una invitación.";
  if (raw.includes("REFERRAL_ALREADY_CLAIMED")) return "Esta cuenta ya fue vinculada a una invitación.";
  if (raw.includes("SELF_REFERRAL")) return "No podés usar tu propio código.";
  if (raw.includes("INVALID_REFERRAL")) return "El código de invitación no es válido.";
  if (raw.includes("REFERRAL_PHONE_HASH_SECRET")) return "La verificación telefónica todavía no está habilitada.";
  if (raw.includes("DUPLICATE") || raw.includes("UNIQUE")) return "Ese mismo teléfono ya está vinculado a otra cuenta.";
  return "No pudimos actualizar tus referidos en este momento.";
}

module.exports.normalizeCode = normalizeCode;
module.exports.phoneHash = phoneHash;
