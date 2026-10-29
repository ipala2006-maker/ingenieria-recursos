const LEGACY_ORIGIN = 'https://estudiemos-app.vercel.app';
const CLOUDFLARE_ORIGIN = 'https://estudiemos.estudiemos-services.workers.dev';
const CLOUDFLARE_KEY_ID = 'cf_20261029';

function validateScope(scope) {
  if (!scope || scope.origin !== CLOUDFLARE_ORIGIN || scope.keyId !== CLOUDFLARE_KEY_ID) {
    throw new Error('INVALID_PUSH_SCOPE');
  }
  return { origin: CLOUDFLARE_ORIGIN, keyId: CLOUDFLARE_KEY_ID };
}

function scopeForEnvironment(env = process.env) {
  const origin = env.APP_ORIGIN || LEGACY_ORIGIN;
  if (origin === LEGACY_ORIGIN && (!env.WEB_PUSH_KEY_ID || env.WEB_PUSH_KEY_ID === 'legacy')) return null;
  return validateScope({ origin, keyId: env.WEB_PUSH_KEY_ID });
}

module.exports = { LEGACY_ORIGIN, CLOUDFLARE_ORIGIN, CLOUDFLARE_KEY_ID, validateScope, scopeForEnvironment };
