// A positive allowlist of organic API operations. No generic proxy or ads endpoint.
export function allowedRequest(url, method) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.hash) return false;
  if (['access_token', 'token', 'key'].some(k => u.searchParams.has(k))) return false;
  if (u.hostname === 'oauth2.googleapis.com') return method === 'POST' && u.pathname === '/token';
  if (u.hostname === 'graph.facebook.com') {
    if (method === 'GET') return /^\/v\d+\.\d+\/[0-9]+(?:\/content_publishing_limit)?$/.test(u.pathname);
    return method === 'POST' && /^\/v\d+\.\d+\/[0-9]+\/(media|media_publish)$/.test(u.pathname);
  }
  if (u.hostname === 'rupload.facebook.com') return method === 'POST' && /^\/ig-api-upload\/v\d+\.\d+\/[0-9]+$/.test(u.pathname);
  if (u.hostname === 'www.googleapis.com') {
    if (method === 'GET') return ['/youtube/v3/channels', '/youtube/v3/videos'].includes(u.pathname);
    return ['POST', 'PUT'].includes(method) && u.pathname === '/upload/youtube/v3/videos' && u.searchParams.get('uploadType') === 'resumable';
  }
  return false;
}

export class ApiError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable; }
}

export function network(fetchImpl = fetch) {
  return async function request(url, options = {}) {
    const method = options.method || 'GET';
    if (!allowedRequest(url, method)) throw new ApiError('NETWORK_POLICY_BLOCKED');
    let res;
    try { res = await fetchImpl(url, { ...options, method, redirect: 'error', signal: AbortSignal.timeout(options.body && method !== 'GET' ? 120000 : 20000) }); }
    catch { throw new ApiError('NETWORK_UNCERTAIN', method === 'GET'); }
    if (!res.ok && res.status !== 308) {
      // Never surface provider error bodies: they may echo tokens or private metadata.
      if (res.status === 401 || res.status === 403) throw new ApiError('AUTH_OR_PERMISSION');
      if (res.status === 429) throw new ApiError('RATE_LIMIT', method === 'GET');
      throw new ApiError(`HTTP_${res.status}`, method === 'GET' && res.status >= 500);
    }
    return res;
  };
}

export const API_MESSAGES = {
  AUTH_OR_PERMISSION: 'La conexion vencio o faltan permisos. Reconecta la cuenta oficial o usa la carga manual.',
  RATE_LIMIT: 'La plataforma limito temporalmente las solicitudes. Espera antes de volver a intentar.',
  NETWORK_UNCERTAIN: 'La respuesta se interrumpio. Revisa el perfil antes de repetir un envio.',
  NETWORK_POLICY_BLOCKED: 'El destino fue bloqueado por la politica de publicacion organica.',
  ACCOUNT_MISMATCH: 'La cuenta conectada no coincide con la cuenta oficial aprobada.',
  NOT_READY: 'La API aun no esta habilitada. El paquete manual esta disponible.',
  PROCESSING: 'La plataforma sigue procesando el video. Consulta el estado mas tarde.',
  PROCESSING_FAILED: 'La plataforma no pudo procesar el video. Usa el paquete manual.',
  MISSING_REMOTE_ID: 'No se pudo confirmar el identificador remoto. Revisa el perfil antes de repetir.',
  QUOTA: 'La cuenta alcanzo su limite de publicaciones. Usa el paquete cuando se libere el limite.'
};
