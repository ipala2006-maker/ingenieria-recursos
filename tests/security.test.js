const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require('node:vm');
const { requireJsonRequest } = require("../api/_lib/request-security");
const { enforceRateLimit, rejectOversizedBody, isSameOriginRequest } = require('../api/_lib/request-security');

test('rate limit actually rejects repeated requests and sets retry headers', async () => {
  const headers={}; let status;
  const response={setHeader:(key,value)=>{headers[key]=value;},status(code){status=code;return this;},json(){}};
  const request={headers:{},socket:{remoteAddress:'192.0.2.42'}};
  const options={route:'test-'+Date.now(),limit:2,windowSeconds:60,distributed:false};
  assert.equal(await enforceRateLimit(request,response,options),true);
  assert.equal(await enforceRateLimit(request,response,options),true);
  assert.equal(await enforceRateLimit(request,response,options),false);
  assert.equal(status,429); assert.ok(Number(headers['Retry-After'])>0);
});

test('API bodies are limited even when the caller lies about content length', () => {
  let status;
  const response={status(code){status=code;return this;},json(){}};
  assert.equal(rejectOversizedBody({headers:{'content-length':'1'},body:{text:'a'.repeat(3000)}},response,1024),true);
  assert.equal(status,413);
  assert.equal(rejectOversizedBody({headers:{},body:{text:'ok'}},response,1024),false);
});

test('cross-origin and malformed origins are rejected', () => {
  const req=origin=>({headers:{origin,host:'estudiemos-app.vercel.app'}});
  assert.equal(isSameOriginRequest(req('https://attacker.invalid')),false);
  assert.equal(isSameOriginRequest(req('null')),false);
  assert.equal(isSameOriginRequest(req('https://estudiemos-app.vercel.app.attacker.invalid')),false);
  assert.equal(isSameOriginRequest(req('https://estudiemos-app.vercel.app')),true);
});

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test('authentication fails closed on timeout and malformed responses, and always clears its timer', async () => {
  for (const outcome of ['timeout', 'invalid-json', 'unauthorized', 'valid']) {
    let expire; let cleared = false;
    const sandbox = {
      module: {exports:{}}, AbortController,
      process: {env:{SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'test-public-key'}},
      setTimeout(callback,delay){expire=callback;assert.equal(delay,12000);return 1;},
      clearTimeout(id){assert.equal(id,1);cleared=true;},
      fetch: async (_url,options) => {
        if(outcome === 'timeout') {
          expire(); assert.equal(options.signal.aborted,true);
          throw new Error('Aborted');
        }
        return {ok:outcome !== 'unauthorized',json:async()=>{
          assert.equal(cleared,false,'timeout must cover the response body too');
          if(outcome === 'invalid-json') throw new SyntaxError('Invalid JSON');
          return {id:'verified-user'};
        }};
      }
    };
    vm.runInNewContext(read('api/_lib/supabase-admin.js'),sandbox);
    const user = await sandbox.module.exports.authenticateBearer('Bearer example');
    assert.equal(user?.id || null,outcome === 'valid' ? 'verified-user' : null);
    assert.equal(cleared,true);
  }
});

test("JSON endpoints reject non-JSON content", () => {
  let status = 0;
  let payload = null;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; }
  };
  assert.equal(requireJsonRequest({ headers: { "content-type": "text/plain" } }, response), false);
  assert.equal(status, 415);
  assert.match(payload.message, /JSON/);
  assert.equal(requireJsonRequest({ headers: { "content-type": "application/json; charset=utf-8" } }, response), true);
});

test("database tables enforce RLS and workspace uploads are constrained", () => {
  for (const file of ["schema.sql", "plans.sql", "referrals.sql", "security.sql", "user-registry.sql", "whatsapp.sql", "workspace.sql"]) {
    assert.match(read(`supabase/${file}`), /force row level security/i, file);
  }
  const workspace = read("supabase/workspace.sql");
  assert.match(workspace, /file_size_limit[^;]+52428800/is);
  assert.match(workspace, /allowed_mime_types/i);
  assert.match(workspace, /IMMUTABLE_WORKSPACE_FIELDS/);
  assert.match(workspace, /workspace_storage_upload_allowed/);
});

test("referral benefits are server-owned and require verified identities", () => {
  const sql = read("supabase/referrals.sql");
  const endpoint = read("api/_lib/referrals.js");
  assert.match(sql, /phone_hash text unique/i);
  assert.match(sql, /invited_user_id uuid not null unique/i);
  assert.match(sql, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(sql, /from auth\.users where id = target_user and email_confirmed_at is not null/);
  assert.match(sql, /account\.email_confirmed_at is not null/);
  assert.match(sql, /where user_id = inviter_id for update/);
  assert.match(read("api/plan-status.js"), /emailVerified: Boolean\(referral\?\.emailVerified\)/);
  assert.match(sql, /values \(inviter_id, target_user, 'qualified', now\(\)\)/i);
  assert.match(sql, /perform private\.refresh_referral_benefit\(inviter_id\)/i);
  assert.match(sql, /America\/Argentina\/Buenos_Aires/);
  assert.match(sql, /discount_valid_until/i);
  assert.match(sql, /qualify_referral_after_first_payment/);
  assert.match(sql, /grant execute on function public\.qualify_referral_after_first_payment\(uuid, text\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.qualify_referral_after_first_payment\(uuid, text\) to authenticated/i);
  assert.match(endpoint, /phone_confirmed_at/);
  assert.match(endpoint, /createHmac\("sha256"/);
  assert.doesNotMatch(endpoint, /discountPercent\s*:\s*request\.body/);
});

test("Android widget credentials use the platform keystore", () => {
  const source = read("android-app/app/src/main/java/com/estudiemos/app/WidgetSyncManager.java");
  assert.match(source, /AndroidKeyStore/);
  assert.match(source, /AES\/GCM\/NoPadding/);
  assert.match(source, /encryptSecret\(accessToken\)/);
});

test("global web responses include the expected security policy", () => {
  const config = read("vercel.json");
  for (const header of [
    "Strict-Transport-Security",
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Cross-Origin-Resource-Policy",
    "Permissions-Policy"
  ]) assert.match(config, new RegExp(header));
});

test("the private user registry never exposes passwords or URL tokens", () => {
  const endpoint = read("api/user-registry.js");
  const adminAuth = read("api/_lib/admin-auth.js");
  const sheetSync = read("google-apps-script/user-registry.gs");
  assert.doesNotMatch(endpoint, /request\.query/);
  assert.match(endpoint, /hasValidAdminToken/);
  assert.match(adminAuth, /headers\?\.authorization/);
  assert.doesNotMatch(endpoint, /password/i);
  assert.match(sheetSync, /PropertiesService\.getScriptProperties/);
  assert.doesNotMatch(sheetSync, /\?token=/);
});

test("CAPTCHA is wired into every public password authentication flow", () => {
  const account = read("scripts/account.js");
  const config = read("api/account-config.js");
  const vercel = read("vercel.json");
  assert.match(account, /captchaToken/);
  assert.match(account, /signInWithPassword\(\{ \.\.\.credentials, options: captcha \}\)/);
  assert.match(account, /emailRedirectTo:.*\.\.\.captcha/);
  assert.match(account, /resetPasswordForEmail[\s\S]*\.\.\.captcha/);
  assert.match(config, /TURNSTILE_SITE_KEY/);
  assert.match(vercel, /challenges\.cloudflare\.com/);
});

test("administrative monitoring requires the same private header token", () => {
  const monitor = read("api/admin-monitoring.js");
  const adminAuth = read("api/_lib/admin-auth.js");
  assert.match(monitor, /hasValidAdminToken/);
  assert.doesNotMatch(monitor, /request\.query/);
  assert.match(adminAuth, /timingSafeEqual/);
});
