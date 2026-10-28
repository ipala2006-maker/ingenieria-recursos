const LEGACY_ORIGIN = 'https://estudiemos-app.vercel.app';

function appOrigin() {
  const url = new URL(process.env.APP_ORIGIN || LEGACY_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('INVALID_APP_ORIGIN');
  }
  return url.origin;
}

module.exports = { appOrigin, LEGACY_ORIGIN };
