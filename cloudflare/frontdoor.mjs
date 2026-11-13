import staticConfig from '../vercel.json' with { type: 'json' };
import courseLinks from '../shared/course-app-links.js';

const dynamicPath = pathname => pathname.startsWith('/api/') || pathname.startsWith('/materia/') || pathname.startsWith('/amistad/');
const consentPaths = new Set(['/consentimiento', '/consentimiento/', '/consentimiento.html']);
const appPaths = new Set(['/', '/index.html', '/mi-espacio', '/mi-espacio/', '/mi-espacio.html', '/materias', '/materias/', '/materias.html', '/semana', '/progreso']);
const cmpSources = {
  'script-src': ['https://cmp.inmobi.com'],
  'img-src': ['https://cmp.inmobi.com', 'https://supply.inmobicdn.net'],
  'connect-src': ['https://cmp.inmobi.com', 'https://api.cmp.inmobi.com', 'https://visit-server.inmobi-choice.io'],
  'frame-src': ["'self'", 'https://cmp.inmobi.com']
};
const staticHeaders = staticConfig.headers.find(rule => rule.source === '/(.*)').headers;
const consentPolicy = [
  "default-src 'none'",
  "script-src 'self' https://cmp.inmobi.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https://cmp.inmobi.com https://supply.inmobicdn.net",
  "connect-src https://cmp.inmobi.com https://api.cmp.inmobi.com https://visit-server.inmobi-choice.io",
  "frame-src 'self' https://cmp.inmobi.com",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');

function withCmp(policy) {
  return policy.split(';').map(directive => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (!Object.hasOwn(cmpSources, name)) return directive.trim();
    return [name, ...new Set([...sources, ...cmpSources[name]])].join(' ');
  }).join('; ');
}

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
    const destination = ['GET','HEAD'].includes(request.method) && courseLinks.publicEntryRedirect(url);
    if (destination) return new Response(null, {status:308,headers:{
      Location:destination.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
    }});
    const binding = dynamicPath(url.pathname) ? env.BACKEND : env.ASSETS;
    try {
      if (!binding || typeof binding.fetch !== 'function') throw new Error('UNAVAILABLE_BINDING');
      const canonical = url.origin === 'https://estudiemos.ar';
      const preferences = consentPaths.has(url.pathname);
      if (preferences && !canonical) return new Response(null, { status: 404 });
      const response = await binding.fetch(request);
      if (!preferences && !(canonical && appPaths.has(url.pathname))) return response;
      if (response.status !== 304 && (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html'))) return response;
      const headers = new Headers(response.headers);
      if (preferences) {
        headers.set('Content-Security-Policy', consentPolicy);
        headers.set('X-Robots-Tag', 'noindex, nofollow');
        headers.set('Cache-Control', 'no-store');
      } else {
        for (const { key, value } of staticHeaders) {
          if (key === 'Content-Security-Policy') headers.set(key, withCmp(value));
          else if (!headers.has(key)) headers.set(key, value);
        }
      }
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Servicio temporalmente no disponible.', { status: 503, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff'
      } });
    }
  }
};
