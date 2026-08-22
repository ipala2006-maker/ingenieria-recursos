const PRIMARY_URL = "https://dolarapi.com/v1/dolares/oficial";
const FALLBACK_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares";
const REQUEST_TIMEOUT_MS = 5000;

module.exports = async function exchangeRate(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ message: "Método no permitido." });
  }

  try {
    const primary = await fetchJson(PRIMARY_URL);
    const rate = validRate(primary?.venta);
    if (rate) return response.status(200).json(ratePayload(rate, primary?.fechaActualizacion, "DolarAPI"));
  } catch (error) {}

  try {
    const fallback = await fetchJson(FALLBACK_URL);
    const official = Array.isArray(fallback) ? fallback.find((item) => item?.casa === "oficial") : null;
    const rate = validRate(official?.venta);
    if (rate) return response.status(200).json(ratePayload(rate, official?.fecha, "ArgentinaDatos"));
  } catch (error) {}

  return response.status(503).json({ message: "La cotización en pesos no está disponible temporalmente." });
};

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Estudiemos/1.0" },
      signal: controller.signal
    });
    if (!result.ok) throw new Error(`Exchange source responded ${result.status}`);
    return result.json();
  } finally {
    clearTimeout(timeout);
  }
}

function validRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 100 && rate < 100000 ? rate : 0;
}

function ratePayload(rate, updatedAt, source) {
  return {
    currency: "ARS",
    rate,
    reference: "Dólar oficial vendedor",
    updatedAt: String(updatedAt || new Date().toISOString()),
    source
  };
}
