const crypto = require('node:crypto');
const { adminRequest, authenticateBearer } = require('./supabase-admin');
const { isSameOriginRequest, requireJsonRequest, enforceRateLimit, rejectOversizedBody } = require('./request-security');

const configured = () => Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.MOBILE_PUSH_CRON_SECRET);
const rpc = (name, body = {}) => adminRequest(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const allowed = url.hostname === 'web.push.apple.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname)
      || url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com';
    if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || value.endpoint.length > 2048) return false;
    return /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || '');
  } catch (_) { return false; }
}
function validZone(zone) {
  if (typeof zone !== 'string' || zone.length > 80) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch (_) { return false; }
}
function cronAuthorized(header) {
  const expected = process.env.MOBILE_PUSH_CRON_SECRET;
  if (!expected || expected.length < 32) return false;
  const provided = String(header || '').replace(/^Bearer /, '');
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function send(subscription, payload) {
  if (!validSubscription(subscription)) throw new Error('Invalid push destination');
  const webpush = require('web-push');
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: 'https://estudiemos-app.vercel.app', publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY },
    TTL: 600, urgency: 'high', timeout: 5000
  });
}
async function dispatch() {
  const jobs = await rpc('claim_mobile_push_jobs');
  let sent = 0, failed = 0;
  for (const job of jobs || []) {
    try {
      await send(job.subscription, { title: job.title, body: 'Es hora de tu tarea.', tag: job.tag, owner: job.owner });
      await rpc('finish_mobile_push_job', { p_id: job.id, p_ok: true, p_expired: false });
      sent++;
    } catch (error) {
      await rpc('finish_mobile_push_job', { p_id: job.id, p_ok: false, p_expired: [404, 410].includes(error.statusCode) });
      failed++;
    }
  }
  return { sent, failed };
}

module.exports = async function mobilePush(req, res) {
  if (req.query.mobilePush === 'dispatch') {
    if (req.method !== 'POST' || !cronAuthorized(req.headers.authorization)) return res.status(401).json({ message: 'Unauthorized' });
    if (!configured()) return res.status(503).json({ enabled: false });
    try { return res.status(200).json(await dispatch()); }
    catch (_) { return res.status(503).json({ message: 'Delivery unavailable' }); }
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, { route: 'mobile-push', limit: 20, windowSeconds: 60 }))) return;
  if (req.method === 'GET') {
    let active = false;
    if (configured()) { try { active = await rpc('mobile_push_ready'); } catch (_) {} }
    return res.status(200).json({ enabled: active === true, publicKey: active === true ? process.env.WEB_PUSH_PUBLIC_KEY : null });
  }
  if (rejectOversizedBody(req, res, 4096) || !requireJsonRequest(req, res)) return;
  if (!isSameOriginRequest(req)) return res.status(403).json({ message: 'Origen no permitido.' });
  const user = await authenticateBearer(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ message: 'Ingresá a tu cuenta para recibir tus alarmas.' });
  if (!configured()) return res.status(503).json({ message: 'Las notificaciones del celular todavía no están activadas en el servidor.' });
  const { subscription, timezone, action } = req.body || {};
  if (!validSubscription(subscription) || !validZone(timezone)) return res.status(400).json({ message: 'La suscripción no es válida.' });
  if (action === 'test' && !(await enforceRateLimit(req, res, { route: `mobile-push-test:${user.id}`, limit: 3, windowSeconds: 300 }))) return;
  try {
    const result = await rpc('register_mobile_push', { p_user: user.id, p_subscription: subscription, p_timezone: timezone });
    if (action === 'test') {
      await send(subscription, { title: 'Estudiemos', body: 'Las notificaciones de este celular están conectadas.', tag: 'estudiemos-push-test', owner: user.id });
    }
    return res.status(200).json({ connected: true, expiresAt: result });
  } catch (_) { return res.status(503).json({ message: 'No pudimos conectar las notificaciones. Volvé a intentarlo.' }); }
};
module.exports.validSubscription = validSubscription;
module.exports.validZone = validZone;
module.exports.cronAuthorized = cronAuthorized;
