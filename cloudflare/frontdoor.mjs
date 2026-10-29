const dynamicPath = pathname => pathname.startsWith('/api/') || pathname.startsWith('/materia/') || pathname.startsWith('/amistad/');

export default {
  async fetch(request, env) {
    const binding = dynamicPath(new URL(request.url).pathname) ? env.BACKEND : env.ASSETS;
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
