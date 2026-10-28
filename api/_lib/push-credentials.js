const crypto = require('node:crypto');

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

module.exports = { validSubscription, validZone, cronAuthorized };
