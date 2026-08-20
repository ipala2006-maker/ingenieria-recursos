function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method Not Allowed");
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const exportToken = typeof request.query?.token === "string" ? request.query.token : "";

  if (!supabaseUrl || !publishableKey || !exportToken) {
    return response.status(401).send("Unauthorized");
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/rest/v1/rpc/export_user_registry`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ export_token: exportToken })
    });

    if (!upstream.ok) {
      const status = upstream.status >= 400 && upstream.status < 500 ? 403 : 502;
      return response.status(status).send("Registry unavailable");
    }

    const users = await upstream.json();
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
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    return response.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    console.error("Unable to export the user registry", error);
    return response.status(502).send("Registry unavailable");
  }
};
