const dynamicPath = pathname => pathname.startsWith('/api/') || pathname.startsWith('/materia/') || pathname.startsWith('/amistad/');
const consentPaths = new Set(['/consentimiento', '/consentimiento/', '/consentimiento.html']);
const consentPolicy = [
  "default-src 'none'",
  "script-src 'self' https://cmp.inmobi.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cmp.inmobi.com https://supply.inmobicdn.net",
  "connect-src https://cmp.inmobi.com https://api.cmp.inmobi.com https://visit-server.inmobi-choice.io",
  "frame-src 'self' https://cmp.inmobi.com",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');

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
      if (!consentPaths.has(url.pathname)) return await binding.fetch(request);
      if (url.origin !== 'https://estudiemos.ar') return new Response(null, { status: 404 });
      const response = await binding.fetch(request);
      if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', consentPolicy);
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Servicio temporalmente no disponible.', { status: 503, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff'
      } });
    }
  }
};
