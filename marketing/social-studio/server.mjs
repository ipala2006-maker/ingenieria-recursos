import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { Studio } from './lib/studio.mjs';
import { TOPICS, PLATFORMS } from './lib/content.mjs';
import { probe, command } from './lib/media.mjs';
import { hashFile, approvalDigest, assertApproved } from './lib/store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MAX_VIDEO = 512 * 1024 * 1024;
const PACKAGE_FILES = ['video.mp4', 'cover.jpg', 'subtitles.srt', 'copy.txt', 'publicar.txt', 'guion.txt'];
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.srt': 'text/plain; charset=utf-8' };

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Se esperaba un formulario valido.');
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 100000) throw new Error('El formulario es demasiado grande.'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function reply(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function sameToken(a, b) { return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

async function fileResponse(req, res, file, download = false) {
  const stat = await fs.stat(file), ext = path.extname(file);
  const headers = { 'Content-Type': ext === '.zip' ? 'application/zip' : CONTENT_TYPES[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  let start = 0, end = stat.size - 1, status = 200;
  if (req.headers.range) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!m || +m[1] >= stat.size || (m[2] && (+m[2] < +m[1] || +m[2] >= stat.size))) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
    start = +m[1]; end = m[2] ? +m[2] : end; status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
  await pipeline(createReadStream(file, { start, end }), res);
}

export async function createServer({ root = path.join(ROOT, '.social-studio'), env = process.env, ...deps } = {}) {
  const studio = new Studio(root, { env, ...deps }); await studio.init();
  const token = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'payment=(), camera=(), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) || !['same-origin', 'none', undefined].includes(req.headers['sec-fetch-site'])) { reply(res, 403, { error: 'Solo se permite acceso desde el estudio local.' }); return; }
      if (!['GET', 'HEAD'].includes(req.method) && !sameToken(req.headers['x-studio-token'], token)) { reply(res, 403, { error: 'Recarga el estudio para continuar.' }); return; }
      const url = new URL(req.url, `http://${host}`), route = url.pathname;
      if (req.method === 'GET' && route === '/api/state') { reply(res, 200, { ...await studio.snapshot(), token, topics: TOPICS }); return; }
      if (req.method === 'POST' && route === '/api/accounts') {
        reply(res, 200, await studio.store.lock('studio', async () => studio.accounts(await body(req)))); return;
      }
      if (req.method === 'POST' && route === '/api/jobs') {
        reply(res, 201, await studio.store.lock('studio', async () => studio.create(await body(req)))); return;
      }
      const match = /^\/api\/jobs\/([0-9a-f-]{36})\/(source|prepare|edit|approve|dispatch|finish|report)$/.exec(route);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'PUT' && action === 'source') {
          await studio.store.lock('studio', async () => {
            const job = await studio.store.get(id);
            if (job.source) throw new Error('La pieza ya tiene video.');
            if (!['video/mp4', 'video/quicktime', 'application/octet-stream'].includes(req.headers['content-type'])) throw new Error('Selecciona un video MP4 o MOV.');
            if (+req.headers['content-length'] > MAX_VIDEO) throw new Error('El video supera 512 MB.');
            const dir = studio.store.dir(id), temp = path.join(dir, 'source.part');
            let count = 0;
            const limiter = new Transform({ transform(chunk, encoding, cb) { count += chunk.length; cb(count > MAX_VIDEO ? new Error('El video supera 512 MB.') : null, chunk); } });
            await pipeline(req, limiter, createWriteStream(temp, { mode: 0o600 }));
            const info = await probe(temp, env);
            await fs.rename(temp, path.join(dir, 'source.mp4')); await studio.attach(id, info);
          });
          reply(res, 200, { ok: true }); return;
        }
        if (req.method === 'POST') {
          const input = await body(req);
          if (['prepare', 'dispatch'].includes(action)) {
            if (studio.store.pending.size) throw new Error('Hay una operacion en curso. Espera a que termine.');
            const operation = studio.store.lock('studio', () => action === 'prepare' ? studio.prepare(id) : studio.dispatch(id, input.platforms));
            operation.catch(async e => {
              // Persist a safe error without turning a queued response into a false success.
              try { const job = await studio.store.get(id); job.error = e.message; await studio.store.save(job); } catch { /* Invalid IDs have no job. */ }
            });
            reply(res, 202, { queued: true }); return;
          }
          const result = await studio.store.lock('studio', async () => {
            if (action === 'edit') return studio.edit(id, input);
            if (action === 'approve') return studio.approve(id, input);
            if (action === 'finish') return studio.finish(id, input.platform);
            if (action === 'report') return studio.report(id, input.platform, input);
            throw new Error('Accion no disponible.');
          });
          reply(res, 200, { id: result.id }); return;
        }
      }
      const bundle = /^\/download\/([0-9a-f-]{36})\/paquete\.zip$/.exec(route);
      if (bundle && req.method === 'GET') {
        const id = bundle[1];
        await studio.store.lock('studio', async () => {
          const job = await studio.store.get(id); await assertApproved(studio.store, job, await studio.store.accounts());
          await command('tar', ['-c', '--format=zip', '-f', 'Estudiemos-redes.zip', '--', ...PLATFORMS.flatMap(p => PACKAGE_FILES.map(f => `${p}/${f}`))], { cwd: studio.store.dir(id), timeout: 120000, failure: 'No se pudo crear el ZIP. Podes descargar los archivos por separado; en Windows se necesita tar de Windows 10/11.' });
          await fileResponse(req, res, path.join(studio.store.dir(id), 'Estudiemos-redes.zip'), true);
        }); return;
      }
      const media = /^\/(preview|download)\/([0-9a-f-]{36})\/(instagram|tiktok|youtube)\/(video\.mp4|cover\.jpg|subtitles\.srt|copy\.txt|publicar\.txt|guion\.txt)$/.exec(route);
      if (media && ['GET', 'HEAD'].includes(req.method)) {
        const [, type, id, platform, name] = media, job = await studio.store.get(id), state = job.platforms[platform];
        if (!state.files[name]) throw new Error('El archivo todavia no esta listo.');
        if (type === 'download') {
          if (!job.approval || job.approval.digest !== approvalDigest(job, await studio.store.accounts())) throw new Error('Aprueba la pieza antes de descargar el paquete.');
          if (await hashFile(path.join(studio.store.dir(id), platform, name)) !== state.files[name]) throw new Error('El archivo cambio despues de la revision.');
        } else if (!['video.mp4', 'cover.jpg'].includes(name)) throw new Error('Vista previa no disponible.');
        await fileResponse(req, res, path.join(studio.store.dir(id), platform, name), type === 'download'); return;
      }
      const assets = { '/': path.join(HERE, 'public/index.html'), '/studio.js': path.join(HERE, 'public/studio.js'), '/studio.css': path.join(HERE, 'public/studio.css'), '/logo.png': path.join(ROOT, 'assets/icon-512.png'), '/font.woff2': path.join(ROOT, 'assets/fonts/space-grotesk-latin.woff2') };
      if (['GET', 'HEAD'].includes(req.method) && Object.hasOwn(assets, route)) { await fileResponse(req, res, assets[route]); return; }
      reply(res, 404, { error: 'Pagina no encontrada.' });
    } catch (e) {
      if (res.headersSent || res.destroyed) return;
      const safe = e.code ? (e.code === 'ENOENT' ? 'No se encontro la pieza o el archivo.' : 'No se pudo completar la operacion local.') : (e instanceof SyntaxError ? 'El formulario no es valido.' : e.message);
      reply(res, 400, { error: safe });
    }
  });
  server.requestTimeout = 300000; server.headersTimeout = 20000;
  return { server, studio };
}

async function main() {
  const root = path.join(ROOT, '.social-studio'); await fs.mkdir(root, { recursive: true });
  const lock = path.join(root, 'server.lock');
  try {
    const previous = JSON.parse(await fs.readFile(lock, 'utf8'));
    let running = true;
    try { process.kill(previous.pid, 0); } catch (e) { if (e.code === 'ESRCH') running = false; }
    if (running) throw new Error(`Ya hay un estudio abierto. Revisa http://127.0.0.1:${previous.port || 8147}/`);
    await fs.unlink(lock);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const port = Number(process.env.SOCIAL_PORT || 8147);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('El puerto debe estar entre 1024 y 65535.');
  await fs.writeFile(lock, JSON.stringify({ pid: process.pid, port }), { flag: 'wx', mode: 0o600 });
  try {
    const { server, studio } = await createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const close = async () => { if (studio.store.pending.size) console.log('Se cerrara al terminar la operacion actual.'); await Promise.allSettled([...studio.store.pending.values()]); server.close(); await fs.unlink(lock).catch(() => {}); process.exit(0); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    console.log(`Estudiemos Studio: http://127.0.0.1:${port}/\nProcesamiento local. Publicacion organica con revision previa. Ctrl+C para cerrar.`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const browser = spawn('explorer.exe', [`http://127.0.0.1:${port}/`], { windowsHide: true, detached: true, stdio: 'ignore' });
      browser.on('error', () => console.log('Abri el enlace del estudio en tu navegador.')); browser.unref();
    }
  } catch (e) { await fs.unlink(lock).catch(() => {}); throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
