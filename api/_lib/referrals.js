const crypto = require("crypto");
const { adminRequest, authenticateBearer } = require("./supabase-admin");
const { userRpc } = require("./plan-access");

async function getReferralStatus(request) {
  return userRpc(String(request.headers.authorization || ""), "get_referral_status", {});
}

async function claimReferral(request, codeValue) {
  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return { authenticated: false };
  const code = normalizeCode(codeValue);
  if (code.length < 8) return { authenticated: true, error: "El código de invitación no es válido." };
  return { authenticated: true, status: await userRpc(authorization, "claim_referral_code", { target_code: code }) };
}

async function confirmReferralPhone(request) {
  const authorization = String(request.headers.authorization || "");
  const user = await authenticateBearer(authorization);
  if (!user?.id) return { authenticated: false };
  const authUser = await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "GET" });
  if (!authUser?.phone || !authUser?.phone_confirmed_at) {
    return { authenticated: true, error: "Primero confirmá el código que recibiste por SMS." };
  }
  await adminRequest("/rest/v1/rpc/register_verified_referral_phone", {
    method: "POST",
    body: JSON.stringify({
      target_user_id: user.id,
      target_phone_hash: phoneHash(authUser.phone),
      target_phone_masked: maskPhone(authUser.phone)
    })
  });
  return { authenticated: true, status: await getReferralStatus(request) };
}

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
  if (raw.includes("EMAIL_VERIFICATION_REQUIRED")) return "Confirmá tu correo antes de usar una invitación.";
  if (raw.includes("PHONE_VERIFICATION_REQUIRED")) return "Verificá tu teléfono antes de usar una invitación.";
  if (raw.includes("REFERRAL_ALREADY_CLAIMED")) return "Esta cuenta ya fue vinculada a una invitación.";
  if (raw.includes("SELF_REFERRAL")) return "No podés usar tu propio código.";
  if (raw.includes("INVALID_REFERRAL")) return "El código de invitación no es válido.";
  if (raw.includes("REFERRAL_PHONE_HASH_SECRET")) return "La verificación telefónica todavía no está habilitada.";
  if (raw.includes("DUPLICATE") || raw.includes("UNIQUE")) return "Ese mismo teléfono ya está vinculado a otra cuenta.";
  return "No pudimos actualizar tus referidos en este momento.";
}

module.exports = { claimReferral, confirmReferralPhone, getReferralStatus, normalizeCode, phoneHash, referralErrorMessage };
