const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packageCheck, run } = require('../scripts/verify-drive-oauth-build.cjs');

const ROOT = path.resolve(__dirname, '..');
const valid = { VERCEL: '1', VERCEL_ENV: 'production', SUPABASE_URL: 'https://gxilgicgxhkdjmmyhrdd.supabase.co',
  GOOGLE_DRIVE_CLIENT_ID: '835849509868-nbidpe7k5of5a6dd69k2k60l1vsverai.apps.googleusercontent.com' };
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'estudiemos-oauth-build-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)).map(name => entry.name + '/' + name) : [entry.name]).sort();
}

test('isolated OAuth package contains only reviewed modules and locked dependencies, no API or application files', t => {
  const root = temporary(t); fs.mkdirSync(path.join(root, 'tmp')); fs.mkdirSync(path.join(root, 'api', '_lib'), { recursive: true });
  for (const name of ['drive-oauth-check.js', 'drive-vault.js', 'supabase-admin.js']) fs.copyFileSync(path.join(ROOT, 'api', '_lib', name), path.join(root, 'api', '_lib', name));
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  fs.writeFileSync(path.join(root, '.env'), 'fixture-private=never-package');
  fs.writeFileSync(path.join(root, 'api', 'account-config.js'), 'never-package');
  const output = packageCheck(root);
  assert.deepEqual(files(output), ['package-lock.json', 'package.json', 'scripts/lib/drive-oauth-check.js',
    'scripts/lib/drive-vault.js', 'scripts/lib/supabase-admin.js', 'scripts/verify-drive-oauth-build.cjs', 'vercel.json']);
  for (const name of ['drive-oauth-check.js', 'drive-vault.js', 'supabase-admin.js']) assert.equal(fs.readFileSync(path.join(output, 'scripts', 'lib', name), 'utf8'), fs.readFileSync(path.join(ROOT, 'api', '_lib', name), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(output, 'vercel.json'), 'utf8'));
  assert.equal(config.outputDirectory, 'public'); assert.match(config.installCommand, /--ignore-scripts/);
  assert.equal(config.functions, undefined); assert.equal(config.crons, undefined); assert.equal(config.alias, undefined);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.scripts), ['build']);
  assert.equal(fs.readFileSync(path.join(output, 'package-lock.json'), 'utf8'), fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.notEqual(packageCheck(root), output, 'Packaging never overwrites a previous result');
});

test('isolated build rejects local, preview, other projects and clients before calling the checker', async t => {
  const root = temporary(t); let calls = 0;
  const verify = async () => { calls++; return { ok: true, code: 'OAUTH_REFRESH_VERIFIED' }; };
  for (const env of [{}, { ...valid, VERCEL: '0' }, { ...valid, VERCEL_ENV: 'preview' },
    { ...valid, SUPABASE_URL: 'https://foreign.supabase.co' }, { ...valid, SUPABASE_URL: valid.SUPABASE_URL + '/unexpected' },
    { ...valid, GOOGLE_DRIVE_CLIENT_ID: 'another-client.apps.googleusercontent.com' }]) {
    assert.deepEqual(await run({ env, verify, root }), { ok: false, code: 'BUILD_SCOPE_REJECTED' });
  }
  assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(root, 'public')), false);
});

test('successful isolated check returns only a fixed safe status and never writes a public artifact', async t => {
  const root = temporary(t);
  const result = await run({ env: valid, root, verify: async () => ({ ok: true, code: 'OAUTH_REFRESH_VERIFIED', token: 'fixture-private' }) });
  assert.deepEqual(result, { ok: true, code: 'OAUTH_REFRESH_VERIFIED' });
  assert.deepEqual(files(root), []);
  assert.doesNotMatch(JSON.stringify(result), /token|fixture/);
});

test('failed or malformed results and raw exceptions cannot publish an artifact or leak details', async t => {
  const root = temporary(t);
  for (const value of [null, { ok: true, code: 'fixture-secret' }, { ok: true, code: 'CHECK_DISABLED' }, { ok: false, code: 'OAUTH_REFRESH_VERIFIED' }]) {
    assert.deepEqual(await run({ env: valid, root, verify: async () => value }), { ok: false, code: 'CHECK_FAILED' });
  }
  assert.deepEqual(await run({ env: valid, root, verify: async () => { throw new Error('fixture-private'); } }), { ok: false, code: 'CHECK_FAILED' });
  assert.deepEqual(await run({ env: valid, root, verify: async () => ({ ok: false, code: 'NEXT_SECRET_REJECTED', detail: 'fixture-private' }) }), { ok: false, code: 'NEXT_SECRET_REJECTED' });
  assert.equal(fs.existsSync(path.join(root, 'public')), false);
});

test('local command cannot accidentally execute a real OAuth request even with unrelated secrets present', t => {
  const cwd = temporary(t);
  const env = { ...process.env, VERCEL: '0', GOOGLE_DRIVE_CLIENT_SECRET_NEXT: 'fixture-never-print' };
  let output;
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-drive-oauth-build.cjs')], { env, cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { assert.equal(error.status, 1); output = error.stdout; }
  assert.equal(output.trim(), '{"ok":false,"code":"BUILD_SCOPE_REJECTED"}');
  assert.doesNotMatch(output, /fixture-never-print/);
});

test('successful build command intentionally exits nonzero so the probe can never become a ready deployment or backup', t => {
  const root = temporary(t); fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
  const script = path.join(root, 'scripts', 'verify-drive-oauth-build.cjs');
  fs.copyFileSync(path.join(ROOT, 'scripts', 'verify-drive-oauth-build.cjs'), script);
  fs.writeFileSync(path.join(root, 'scripts', 'lib', 'drive-oauth-check.js'), "exports.verifyNextOAuthSecret=async()=>({ok:true,code:'OAUTH_REFRESH_VERIFIED',token:'fixture-never-print'});");
  let result;
  try { execFileSync(process.execPath, [script], { env: { ...process.env, ...valid }, cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { result = error; }
  assert.equal(result?.status, 1);
  assert.equal(result.stdout.trim(), '{"ok":true,"code":"OAUTH_REFRESH_VERIFIED"}');
  assert.equal(result.stderr.trim(), 'OAUTH_PROBE_VERIFIED_STOPPING_WITHOUT_RELEASE');
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-never-print/);
  assert.equal(fs.existsSync(path.join(root, 'public')), false);
});
