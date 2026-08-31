const crypto = require("crypto");
const SUPABASE_CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js";
const SUPABASE_CLIENT_SHA256 = "cf529fe8980cbe6f2dd3e3930ecf96352ed3d3d71233b6760e4f927f89b94b9f";
const { enforceRateLimit, setSecurityHeaders } = require("./_lib/request-security");

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method Not Allowed");
  }
  if (!(await enforceRateLimit(request, response, { route: "supabase-client", limit: 180, windowSeconds: 60 }))) return;

  try {
    const upstream = await fetch(SUPABASE_CLIENT_URL, {
      headers: { Accept: "application/javascript" }
    });

    if (!upstream.ok) throw new Error(`Supabase client returned ${upstream.status}`);

    const source = Buffer.from(await upstream.arrayBuffer());
    const digest = crypto.createHash("sha256").update(source).digest("hex");
    if (digest !== SUPABASE_CLIENT_SHA256) throw new Error("Supabase client integrity check failed");
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    return response.status(200).send(source);
  } catch (error) {
    console.error("Unable to proxy the Supabase browser client", error);
    return response.status(502).send("Service temporarily unavailable");
  }
};
