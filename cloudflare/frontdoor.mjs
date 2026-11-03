const dynamicPath = pathname => pathname.startsWith('/api/') || pathname.startsWith('/materia/') || pathname.startsWith('/amistad/');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Static requests are upgraded by the zone's Always Use HTTPS setting.
    if (url.protocol === 'http:' && url.hostname === 'estudiemos.ar') {
      url.protocol = 'https:';
      url.port = '';
      return new Response(null, { status: 308, headers: {
        Location: url.href, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      } });
    }
    const binding = dynamicPath(url.pathname) ? env.BACKEND : env.ASSETS;
    try {
      if (!binding || typeof binding.fetch !== 'function') throw new Error('UNAVAILABLE_BINDING');
      return await binding.fetch(request);
    } catch {
      return new Response('Servicio temporalmente no disponible.', { status: 503, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff'
      } });
    }
  }
};
