module.exports = function handler(_request, response) {
  const url = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";

  response.setHeader("Cache-Control", "no-store, max-age=0");

  if (!url || !publishableKey) {
    return response.status(503).json({
      enabled: false,
      message: "La sincronizacion de cuentas todavia no esta configurada."
    });
  }

  return response.status(200).json({ enabled: true, url, publishableKey });
};
