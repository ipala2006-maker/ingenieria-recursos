const crypto = require("crypto");
const { enforceRateLimit, setSecurityHeaders } = require("./_lib/request-security");
const { adminRequest, isConfigured } = require("./_lib/supabase-admin");

function csvCell(value) {
  const raw = value == null ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

const MAX_EXPORT_ROWS = 10000;
const MAX_EXPORT_BYTES = 2 * 1024 * 1024;

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method Not Allowed");
  }
  if (!(await enforceRateLimit(request, response, { route: "user-registry", limit: 8, windowSeconds: 300 }))) return;

  if (!isConfigured() || !hasValidExportToken(request)) {
    return response.status(401).send("Unauthorized");
  }

  try {
    const users = await adminRequest(
      "/rest/v1/user_registry?select=email,registered_at,confirmed_at,last_sign_in_at&order=registered_at.desc&limit=10000"
    );
    if (!Array.isArray(users)) return response.status(502).send("Registry unavailable");
    const header = ["Correo", "Fecha de registro", "Correo confirmado", "Ultimo acceso"];
    const rows = users.slice(0, MAX_EXPORT_ROWS).map((user) => [
      user.email,
      user.registered_at,
      user.confirmed_at,
      user.last_sign_in_at
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    if (Buffer.byteLength(csv, "utf8") > MAX_EXPORT_BYTES) {
      return response.status(413).send("Registry export is too large");
    }

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="usuarios-estudiemos.csv"');
    return response.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Unable to export the user registry", error);
    const status = error?.status >= 400 && error?.status < 500 ? 403 : 502;
    return response.status(status).send("Registry unavailable");
  }
};

function hasValidExportToken(request) {
  const expected = String(process.env.USER_REGISTRY_EXPORT_TOKEN || "");
  const authorization = String(request.headers?.authorization || "");
  const received = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
