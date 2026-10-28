const BODY_LIMIT = 512 * 1024;

async function readBody(request) {
  if (!request.body) return new Uint8Array();
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > BODY_LIMIT) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function invokeHandler(request, handler, { query = {}, templates = {}, sendPush } = {}) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  let status = 200, body = null, ended = false;
  const response = {
    status(value) { status = value; return this; },
    setHeader(name, value) {
      headers.delete(name);
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
      return this;
    },
    getHeader(name) { return headers.get(name); },
    json(value) { this.setHeader('Content-Type', 'application/json; charset=utf-8'); return this.end(JSON.stringify(value)); },
    send(value) { return this.end(value); },
    end(value = null) { body = value; ended = true; return this; },
    get statusCode() { return status; },
    set statusCode(value) { status = value; }
  };
  try {
    const url = new URL(request.url), bytes = await readBody(request);
    const inputHeaders = Object.fromEntries(request.headers);
    // Never trust client-supplied forwarding headers for origin or rate limits.
    for (const key of ['x-forwarded-host', 'x-forwarded-for', 'x-vercel-forwarded-for']) delete inputHeaders[key];
    inputHeaders.host = url.host;
    const parsedQuery = Object.create(null);
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      parsedQuery[key] = values.length === 1 ? values[0] : values;
    }
    Object.assign(parsedQuery, query);
    const raw = new TextDecoder().decode(bytes);
    let parsed = raw || undefined;
    if (raw && /^(application\/json)(?:;|$)/i.test(request.headers.get('content-type') || '')) {
      try { parsed = JSON.parse(raw); }
      catch { return Response.json({ message: 'Invalid JSON' }, { status: 400, headers }); }
    }
    const input = {
      method: request.method, url: url.pathname + url.search,
      headers: inputHeaders, query: parsedQuery, body: parsed, templates, sendPush,
      socket: { remoteAddress: request.headers.get('cf-connecting-ip') || 'unknown' },
      async *[Symbol.asyncIterator]() { if (bytes.byteLength) yield bytes; }
    };
    await handler(input, response);
    if (!ended) throw new Error('HANDLER_DID_NOT_RESPOND');
  } catch (error) {
    // Do not leak upstream errors, tokens, task titles, query strings or cookies.
    status = error?.status === 413 ? 413 : 503;
    headers.delete('Set-Cookie');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    body = JSON.stringify({ message: status === 413 ? 'Request too large' : 'Service unavailable' });
  }
  return new Response(request.method === 'HEAD' || [204, 304].includes(status) ? null : body, { status, headers });
}
