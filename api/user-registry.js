const { enforceRateLimit, setSecurityHeaders } = require("./_lib/request-security");
const { adminRequest, isConfigured } = require("./_lib/supabase-admin");

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

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

  const exportToken = typeof request.query?.token === "string" ? request.query.token : "";

  if (!isConfigured() || !exportToken) {
    return response.status(401).send("Unauthorized");
  }

  try {
    const users = await adminRequest("/rest/v1/rpc/export_user_registry", {
      method: "POST",
      body: JSON.stringify({ export_token: exportToken })
    });
    if (!Array.isArray(users)) return response.status(502).send("Registry unavailable");
    const header = ["ID de usuario", "Correo", "Fecha de registro", "Correo confirmado", "Ultimo acceso"];
    const rows = users.map((user) => [
      user.user_id,
      user.email,
      user.registered_at,
      user.confirmed_at,
      user.last_sign_in_at
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'inline; filename="usuarios-estudiemos.csv"');
    return response.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Unable to export the user registry", error);
    const status = error?.status >= 400 && error?.status < 500 ? 403 : 502;
    return response.status(status).send("Registry unavailable");
  }
};
