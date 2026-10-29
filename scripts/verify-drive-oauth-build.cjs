const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://gxilgicgxhkdjmmyhrdd.supabase.co';
const CLIENT = '835849509868-nbidpe7k5of5a6dd69k2k60l1vsverai.apps.googleusercontent.com';
const CODES = new Set(['CHECK_DISABLED', 'CHECK_NOT_CONFIGURED', 'TEST_GRANT_READ_FAILED',
  'TEST_GRANT_UNAVAILABLE', 'TEST_GRANT_UNREADABLE', 'REFRESH_RESPONSE_INVALID',
  'TEST_GRANT_ROTATED_REVIEW_REQUIRED', 'NEXT_SECRET_REJECTED', 'TEST_GRANT_REJECTED',
  'OAUTH_PROVIDER_UNAVAILABLE', 'OAUTH_REFRESH_VERIFIED']);

function packageCheck(root = path.resolve(__dirname, '..'), kind = 'oauth') {
  if (!['oauth', 'audit'].includes(kind)) throw new Error('INVALID_PROBE_KIND');
  const destination = fs.mkdtempSync(path.join(root, 'tmp', 'drive-oauth-check-'));
  fs.mkdirSync(path.join(destination, 'scripts', 'lib'), { recursive: true });
  for (const name of [kind === 'audit' ? 'drive-cutover-audit.js' : 'drive-oauth-check.js', 'drive-vault.js', 'supabase-admin.js']) {
    fs.copyFileSync(path.join(root, 'api', '_lib', name), path.join(destination, 'scripts', 'lib', name));
  }
  fs.copyFileSync(__filename, path.join(destination, 'scripts', path.basename(__filename)));
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(destination, 'package-lock.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  manifest.scripts = { build: 'node scripts/verify-drive-oauth-build.cjs' };
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(destination, 'vercel.json'), JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    buildCommand: 'node scripts/verify-drive-oauth-build.cjs',
    installCommand: 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
    outputDirectory: 'public',
    headers: [{ source: '/(.*)', headers: [
      { key: 'Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, noarchive' },
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" }
    ] }]
  }, null, 2) + '\n', { flag: 'wx' });
  return destination;
}

// Runs only during the isolated Vercel build. No API, callback or token artifact.
async function run({ env = process.env, verify } = {}) {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' ||
      String(env.SUPABASE_URL || '').replace(/\/$/, '') !== ORIGIN || env.GOOGLE_DRIVE_CLIENT_ID !== CLIENT) {
    return { ok: false, code: 'BUILD_SCOPE_REJECTED' };
  }
  let result;
  const kind = env.DRIVE_PROBE_MODE || 'oauth';
  if (!['oauth', 'audit'].includes(kind)) return { ok: false, code: 'CHECK_FAILED' };
  try { result = await (verify || (kind === 'audit' ? require('./lib/drive-cutover-audit').auditDriveConnections : require('./lib/drive-oauth-check').verifyNextOAuthSecret))(); }
  catch { return { ok: false, code: 'CHECK_FAILED' }; }
  if (kind === 'audit') {
    if (result && result.ok === false && ['CHECK_DISABLED', 'DRIVE_AUDIT_READ_FAILED'].includes(result.code)) return { ok: false, code: result.code };
    const counts = ['checked', 'legacy', 'versioned', 'unreadable'];
    if (!result || typeof result.ok !== 'boolean' || !['DRIVE_AUDIT_COMPLETE', 'DRIVE_AUDIT_INCOMPLETE'].includes(result.code) ||
        counts.some(key => !Number.isSafeInteger(result[key]) || result[key] < 0 || result[key] > 1000) ||
        typeof result.complete !== 'boolean' || typeof result.schemaAvailable !== 'boolean' ||
        ![null, true, false].includes(result.casRegistered) || result.schemaAvailable !== (result.casRegistered !== null) ||
        result.unreadable > result.checked || result.legacy + result.versioned > result.checked ||
        result.ok !== (result.complete && result.unreadable === 0) ||
        (result.code === 'DRIVE_AUDIT_COMPLETE') !== result.ok) return { ok: false, code: 'CHECK_FAILED' };
    return Object.fromEntries(['ok', 'code', ...counts, 'complete', 'schemaAvailable', 'casRegistered'].map(key => [key, result[key]]));
  }
  if (!result || typeof result.ok !== 'boolean' || !CODES.has(result.code) ||
      result.ok !== (result.code === 'OAUTH_REFRESH_VERIFIED')) return { ok: false, code: 'CHECK_FAILED' };
  return { ok: result.ok, code: result.code };
}

if (require.main === module) {
  if (process.argv.length === 3 && ['--package', '--audit-package'].includes(process.argv[2])) console.log(packageCheck(undefined, process.argv[2] === '--audit-package' ? 'audit' : 'oauth'));
  else if (process.argv.length === 2) run().then(result => {
    console.log(JSON.stringify(result));
    // Even a successful check must not create a promotable deployment or backup.
    console.error(result.ok ? 'OAUTH_PROBE_VERIFIED_STOPPING_WITHOUT_RELEASE' : 'OAUTH_PROBE_NOT_VERIFIED');
    process.exitCode = 1;
  }).catch(() => { console.error('OAUTH_CHECK_BUILD_FAILED'); process.exitCode = 1; });
  else { console.error('OAUTH_CHECK_ARGUMENTS_INVALID'); process.exitCode = 1; }
}
module.exports = { packageCheck, run };
