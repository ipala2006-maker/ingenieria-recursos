const crypto = require('node:crypto');
const { adminRequest, authenticateBearer } = require('./supabase-admin');
const { isSameOriginRequest, requireJsonRequest, enforceRateLimit, rejectOversizedBody } = require('./request-security');
const { dispatchPush } = require('./push-dispatch');
const { validSubscription, validZone, cronAuthorized } = require('./push-credentials');
const { scopeForEnvironment, LEGACY_ORIGIN } = require('./push-scope');

const configured = () => {
  try {
    const scope = scopeForEnvironment();
    return Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.MOBILE_PUSH_CRON_SECRET
      && (!scope || process.env.PUSH_DISPATCH_ENABLED === 'true'));
  } catch { return false; }
};
const rpc = (name, body = {}) => adminRequest(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
const ready = () => {
  const scope = scopeForEnvironment();
  return rpc(scope ? 'mobile_push_ready_for_origin' : 'mobile_push_ready', scope ? { p_origin: scope.origin, p_key_id: scope.keyId } : {});
};
async function send(subscription, payload) {
  if (!validSubscription(subscription)) throw new Error('Invalid push destination');
  const webpush = require('web-push');
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { subject: scopeForEnvironment()?.origin || LEGACY_ORIGIN, publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY },
    TTL: 600, urgency: 'high', timeout: 5000
  });
}
async function dispatch() {
  // Spread the bounded cron workers, not the user's alarm occurrence.
  await new Promise(resolve => setTimeout(resolve, crypto.randomInt(0, 751)));
  const { sent, failed } = await dispatchPush({
    profile: 'vercel',
    scope: scopeForEnvironment(),
    rpc: (name, body) => adminRequest(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body), redirect: 'error' }),
    send: job => send(job.subscription, { title: job.title, body: 'Es hora de tu tarea.', tag: job.tag, owner: job.owner })
  });
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
    if (configured()) { try { active = await ready(); } catch (_) {} }
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
    if (await ready() !== true) return res.status(503).json({ message: 'El servicio de alarmas todavía no está activo. Volvé a intentarlo más tarde.' });
    const scope = scopeForEnvironment();
    const result = await rpc(scope ? 'register_mobile_push_for_origin' : 'register_mobile_push', {
      p_user: user.id, p_subscription: subscription, p_timezone: timezone,
      ...(scope ? { p_origin: scope.origin, p_key_id: scope.keyId } : {})
    });
    if (action === 'test') {
      await (req.sendPush || send)(subscription, { title: 'Estudiemos', body: 'Las notificaciones de este celular están conectadas.', tag: 'estudiemos-push-test', owner: user.id });
    }
    return res.status(200).json({ connected: true, expiresAt: result });
  } catch (_) { return res.status(503).json({ message: 'No pudimos conectar las notificaciones. Volvé a intentarlo.' }); }
};
module.exports.validSubscription = validSubscription;
module.exports.validZone = validZone;
module.exports.cronAuthorized = cronAuthorized;
