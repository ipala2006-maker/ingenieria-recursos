const { OAuth2Client } = require('google-auth-library');
const { adminRequest } = require('./supabase-admin');
const vault = require('./drive-vault');

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const failure = code => ({ ok: false, code });
const adapters = {
  readGrant: id => adminRequest('/rest/v1/drive_connections?select=credentials&user_id=eq.' + id + '&limit=1'),
  refresh: async ({ clientId, clientSecret, refreshToken }) => {
    const oauth = new OAuth2Client({ clientId, clientSecret, transporterOptions: { timeout: 12000, retry: false } });
    oauth.setCredentials({ refresh_token: refreshToken });
    return (await oauth.refreshAccessToken()).credentials;
  }
};

// Server-only check for one explicitly selected test grant. No HTTP route or writes.
async function verifyNextOAuthSecret(io = adapters, now = Date.now()) {
  const expires = Date.parse(process.env.DRIVE_OAUTH_CHECK_EXPIRES_AT || '');
  if (process.env.DRIVE_OAUTH_CHECK_ENABLED !== 'true' || !Number.isFinite(now) ||
      !Number.isFinite(expires) || expires <= now || expires - now > 3600000) return failure('CHECK_DISABLED');

  const id = process.env.DRIVE_OAUTH_CHECK_USER_ID || '';
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET_NEXT || '';
  if (!UUID.test(id) || !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(clientId) ||
      !clientSecret || clientSecret.length > 2048 || clientSecret.trim() !== clientSecret ||
      /[\x00-\x1f\x7f]/.test(clientSecret) || clientSecret === process.env.GOOGLE_DRIVE_CLIENT_SECRET) return failure('CHECK_NOT_CONFIGURED');

  let rows;
  try { rows = await io.readGrant(id); }
  catch { return failure('TEST_GRANT_READ_FAILED'); }
  if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.credentials !== 'string') return failure('TEST_GRANT_UNAVAILABLE');

  let saved;
  try { saved = vault.unseal(rows[0].credentials, 'user:' + id); }
  catch { return failure('TEST_GRANT_UNREADABLE'); }
  if (typeof saved?.refreshToken !== 'string' || !saved.refreshToken || saved.refreshToken.length > 16000) return failure('TEST_GRANT_UNAVAILABLE');

  try {
    const tokens = await io.refresh({ clientId, clientSecret, refreshToken: saved.refreshToken });
    if (typeof tokens?.access_token !== 'string' || !tokens.access_token ||
        !Number.isFinite(tokens.expiry_date) || tokens.expiry_date <= now ||
        (tokens.refresh_token !== undefined && (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token))) return failure('REFRESH_RESPONSE_INVALID');
    if (tokens.refresh_token && tokens.refresh_token !== saved.refreshToken) return failure('TEST_GRANT_ROTATED_REVIEW_REQUIRED');
    return { ok: true, code: 'OAUTH_REFRESH_VERIFIED' };
  } catch (error) {
    const code = error?.response?.data?.error;
    if (code === 'invalid_client' || code === 'unauthorized_client') return failure('NEXT_SECRET_REJECTED');
    if (code === 'invalid_grant') return failure('TEST_GRANT_REJECTED');
    return failure('OAUTH_PROVIDER_UNAVAILABLE');
  }
}

module.exports = { verifyNextOAuthSecret };
