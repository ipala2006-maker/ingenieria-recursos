const crypto = require("crypto");
const { adminRequest, authenticateBearer, encodeFilter, isConfigured } = require("./_lib/supabase-admin");
const { enforceRateLimit, isSameOriginRequest, rejectOversizedBody, setSecurityHeaders } = require("./_lib/request-security");

const CODE_LIFETIME_MINUTES = 15;

module.exports = async function whatsappLink(request, response) {
  setHeaders(response);
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, DELETE");
    return response.status(405).json({ message: "Método no permitido." });
  }
  if (!isSameOriginRequest(request)) return response.status(403).json({ message: "Origen no permitido." });
  if (rejectOversizedBody(request, response, 8 * 1024)) return;
  if (!(await enforceRateLimit(request, response, { route: "whatsapp-link", limit: 30, windowSeconds: 60 }))) return;
  if (!isConfigured() || !whatsappConfigured()) {
    return response.status(503).json({ configured: false, message: "WhatsApp todavía no está configurado." });
  }

  const user = await authenticateBearer(request.headers.authorization);
  if (!user?.id) return response.status(401).json({ message: "Ingresá a tu cuenta para vincular WhatsApp." });

  try {
    if (request.method === "GET") return getStatus(user.id, response);
    if (request.method === "DELETE") return unlink(user.id, response);
    return createCode(user.id, response);
  } catch (error) {
    return response.status(503).json({ message: "No pudimos preparar la vinculación en este momento." });
  }
};

async function getStatus(userId, response) {
  const rows = await adminRequest(`/rest/v1/whatsapp_links?user_id=eq.${encodeFilter(userId)}&select=wa_id,display_name,linked_at&limit=1`);
  const link = Array.isArray(rows) ? rows[0] : null;
  return response.status(200).json({
    configured: true,
    linked: Boolean(link),
    phone: link ? maskPhone(link.wa_id) : "",
    displayName: link?.display_name || "",
    linkedAt: link?.linked_at || ""
  });
}

async function createCode(userId, response) {
  const code = randomCode();
  const codeHash = sha256(code);
  const expiresAt = new Date(Date.now() + CODE_LIFETIME_MINUTES * 60000).toISOString();
  await adminRequest(`/rest/v1/whatsapp_link_codes?user_id=eq.${encodeFilter(userId)}&used_at=is.null`, { method: "DELETE" });
  await adminRequest("/rest/v1/whatsapp_link_codes", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, code_hash: codeHash, expires_at: expiresAt })
  });
  const publicNumber = String(process.env.WHATSAPP_PUBLIC_NUMBER || "").replace(/\D/g, "");
  const message = `VINCULAR ${code}`;
  return response.status(200).json({
    configured: true,
    linked: false,
    expiresAt,
    url: `https://wa.me/${publicNumber}?text=${encodeURIComponent(message)}`
  });
}

async function unlink(userId, response) {
  await adminRequest(`/rest/v1/whatsapp_links?user_id=eq.${encodeFilter(userId)}`, { method: "DELETE" });
  await adminRequest(`/rest/v1/whatsapp_pending_actions?user_id=eq.${encodeFilter(userId)}`, { method: "DELETE" });
  return response.status(200).json({ configured: true, linked: false });
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : "Vinculado";
}

function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_PUBLIC_NUMBER && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function setHeaders(response) {
  setSecurityHeaders(response);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
}
