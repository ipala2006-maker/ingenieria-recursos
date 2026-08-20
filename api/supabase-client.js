const SUPABASE_CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js";

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const upstream = await fetch(SUPABASE_CLIENT_URL, {
      headers: { Accept: "application/javascript" }
    });

    if (!upstream.ok) throw new Error(`Supabase client returned ${upstream.status}`);

    const source = await upstream.text();
    response.setHeader("Content-Type", "application/javascript; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
    return response.status(200).send(source);
  } catch (error) {
    console.error("Unable to proxy the Supabase browser client", error);
    return response.status(502).send("Service temporarily unavailable");
  }
};
