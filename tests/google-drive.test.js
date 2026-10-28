const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const file = path.join(__dirname,'../api/_lib/google-drive.js'), source = fs.readFileSync(file,'utf8'), localRequire = createRequire(file);
process.env.DRIVE_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const vault = require('../api/_lib/drive-vault');
const scope = 'https://www.googleapis.com/auth/drive.file', app = 'https://estudiemos-app.vercel.app';
function harness(options = {}) {
  const rows = new Map(), calls = [], grants = [];
  let tokens = {access_token:'pilot-access', refresh_token:'pilot-refresh', expiry_date:Date.now()+3600000, scope};
  class OAuth {
    constructor(config){calls.push(['client',config]);}
    async generateCodeVerifierAsync(){return {codeVerifier:'pilot-verifier',codeChallenge:'pilot-challenge'};}
    generateAuthUrl(params){grants.push(params);return 'https://accounts.google.com/o/oauth2/v2/auth?state='+params.state;}
    async getToken(params){calls.push(['exchange',params]);return {tokens};}
    setCredentials(value){calls.push(['credentials',value]);}
    async refreshAccessToken(){calls.push(['refresh']);return {credentials:{access_token:'pilot-refreshed',expiry_date:Date.now()+3600000}};}
    async revokeToken(value){calls.push(['revoke',value]);}
  }
  const environment = {...process.env,GOOGLE_DRIVE_CLIENT_ID:'12345-test.apps.googleusercontent.com',GOOGLE_DRIVE_CLIENT_SECRET:'test-client-secret',GOOGLE_DRIVE_APP_ORIGIN:app,...options.env};
  const sandbox = {module:{exports:{}},process:{env:environment},URL,Date,require(name){
    if(name==='google-auth-library')return {OAuth2Client:OAuth};
    if(name==='./supabase-admin')return {isConfigured:()=>true,authenticateBearer:async authorization=>authorization==='Bearer alice'?{id:'alice',email:'alice@example.test',email_confirmed_at:'2026-10-19T00:00:00Z'}:authorization==='Bearer bob'?{id:'bob',email:'bob@example.test',email_confirmed_at:'2026-10-19T00:00:00Z'}:authorization==='Bearer unverified'?{id:'new',email:'alice@example.test'}:null,adminRequest:async (url,request={})=>{
      calls.push(['db',url,request]);
      if(request.method==='POST'){const row=JSON.parse(request.body);rows.set(row.user_id,row);return null;}
      const uid=new URL('https://db.test'+url).searchParams.get('user_id').replace(/^eq\./,'');
      if(request.method==='DELETE'){rows.delete(uid);return null;}
      return rows.has(uid)?[rows.get(uid)]:[];
    }};
    if(name==='./request-security')return {...localRequire(name),enforceRateLimit:async()=>true};
    return localRequire(name);
  }};
  vm.runInNewContext(source,sandbox);
  async function request(action,extra={}){
    const result={headers:{}};const res={setHeader(k,v){result.headers[k]=v;},status(code){result.status=code;return this;},json(value){result.body=JSON.parse(JSON.stringify(value));return this;},end(){return this;}};
    await sandbox.module.exports({method:['config','status','callback'].includes(action)?'GET':'POST',query:{drive:action},headers:{host:'estudiemos-app.vercel.app',origin:app,authorization:'Bearer alice','content-type':'application/json'},body:{},...extra},res);
    return result;
  }
  return {request,rows,calls,grants,setTokens:value=>{tokens=value;}};
}
test('vault encrypts grants with user/purpose separation and detects tampering and malformed data',()=>{
  const secret={refreshToken:'not-for-the-browser'}, sealed=vault.seal(secret,'user:alice');
  assert.ok(!sealed.includes(secret.refreshToken));assert.deepEqual(vault.unseal(sealed,'user:alice'),secret);
  for(const purpose of ['user:bob','oauth'])assert.throws(()=>vault.unseal(sealed,purpose));
  const bytes=Buffer.from(sealed,'base64url');bytes[32]^=1;assert.throws(()=>vault.unseal(bytes.toString('base64url'),'user:alice'));
  for(const raw of ['',null,'!','x'.repeat(25000)])assert.throws(()=>vault.unseal(raw,'user:alice'));
});
test('configuration exposes no credentials and blocks missing or unsafe setup',async()=>{
  const h=harness(), response=await h.request('config');assert.deepEqual(response.body,{enabled:true});assert.equal(h.calls.length,0);
  for(const env of [{GOOGLE_DRIVE_CLIENT_ID:''},{DRIVE_TOKEN_ENCRYPTION_KEY:''},{GOOGLE_DRIVE_APP_ORIGIN:'https://attacker.test/redirect'},{GOOGLE_DRIVE_APP_ORIGIN:'http://estudiemos-app.vercel.app'}]){
    const app=harness({env});assert.equal((await app.request('config')).body.enabled,false);assert.equal((await app.request('start')).status,503);
  }
});

test('a versioned-only Workers vault exposes readiness without its keys or key IDs',async()=>{
  const key=crypto.randomBytes(32).toString('hex');
  const env={DRIVE_TOKEN_ENCRYPTION_KEY:'',DRIVE_TOKEN_KEYRING:JSON.stringify({cf202610:key}),DRIVE_TOKEN_ACTIVE_KEY_ID:'cf202610'};
  const h=harness({env}),result=await h.request('config');assert.deepEqual(result.body,{enabled:true});assert.equal(h.calls.length,0);
  assert.ok(!JSON.stringify(result).includes(key));assert.ok(!JSON.stringify(result).includes('cf202610'));
  const missing=harness({env:{...env,DRIVE_TOKEN_ACTIVE_KEY_ID:'missing'}});assert.deepEqual((await missing.request('config')).body,{enabled:false});
});

test('pilot rollout is server-owned, requires verified identity and never reveals its allowlist',async()=>{
  const h=harness({env:{GOOGLE_DRIVE_PILOT_EMAILS:' ALICE@example.test '}});
  assert.deepEqual((await h.request('config')).body,{enabled:true});
  for(const authorization of ['','Bearer bob','Bearer unverified']){
    const headers={host:'estudiemos-app.vercel.app',origin:app,'content-type':'application/json',authorization};
    assert.deepEqual((await h.request('config',{headers})).body,{enabled:false});
    const denied=await h.request('start',{headers,body:{email:'alice@example.test'}});
    assert.ok([401,403].includes(denied.status));assert.equal(h.grants.length,0);
    assert.ok(!JSON.stringify(denied).includes('alice@example.test'));
  }
  assert.ok(!h.calls.some(call=>call[0]==='db'));
  const start=await h.request('start'),grant=h.grants[0];
  const callback=await h.request('callback',{query:{drive:'callback',state:grant.state,code:'test'},headers:{cookie:start.headers['Set-Cookie'].split(';')[0]}});
  assert.equal(callback.headers.Location,app+'/mi-espacio.html?drive=connected');
  const outside=await h.request('disconnect',{headers:{host:'estudiemos-app.vercel.app',origin:app,'content-type':'application/json',authorization:'Bearer bob'}});
  assert.equal(outside.status,200,'Rollout restrictions never prevent a user from revoking their own grant');
  const forged='__Host-estudiemos-drive-oauth='+vault.seal({uid:'bob',email:'bob@example.test',email_confirmed_at:'confirmed',state:grant.state,verifier:'test',exp:Date.now()+60000},'oauth');
  const denied=await h.request('callback',{query:{drive:'callback',state:grant.state,code:'test'},headers:{cookie:forged}});
  assert.equal(denied.headers.Location,app+'/mi-espacio.html?drive=error');assert.ok(!h.rows.has('bob'));
});
test('OAuth uses minimal scope, PKCE, offline consent and an encrypted secure one-time browser state',async()=>{
  const h=harness(), start=await h.request('start'), grant=h.grants[0];
  assert.equal(start.status,200);assert.deepEqual(Array.from(grant.scope),[scope]);assert.equal(grant.include_granted_scopes,false);assert.equal(grant.access_type,'offline');assert.equal(grant.code_challenge_method,'S256');
  assert.equal(grant.prompt,'consent select_account');assert.ok(!Object.hasOwn(grant,'login_hint'),'Drive must be selectable independently from the Estudiemos email');
  assert.match(start.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Lax/);assert.match(start.headers['Set-Cookie'],/^__Host-/);assert.ok(!start.headers['Set-Cookie'].includes('alice'));
  const cookie=start.headers['Set-Cookie'].split(';')[0];
  const callback=await h.request('callback',{query:{drive:'callback',state:grant.state,code:'pilot-code'},headers:{cookie}});
  assert.equal(callback.status,303);assert.equal(callback.headers.Location,app+'/mi-espacio.html?drive=connected');assert.match(callback.headers['Set-Cookie'],/Max-Age=0/);
  assert.ok(!JSON.stringify(h.rows.get('alice')).includes('pilot-refresh'));
  assert.equal(vault.unseal(h.rows.get('alice').credentials,'user:alice').refreshToken,'pilot-refresh');
  assert.equal(h.calls.find(call=>call[0]==='exchange')[1].codeVerifier,'pilot-verifier');
});

test('course OAuth callbacks resume only fixed same-origin pages, never an arbitrary return URL',async()=>{
  const classId='00000000-0000-4000-8000-000000000001';
  for(const [context,target]of [['teacher','/materias.html'],['student-course','/'],['https://attacker.test','/mi-espacio.html']]){
    const h=harness(),start=await h.request('start',{body:{context,classId,returnUrl:'https://attacker.test'}});
    const callback=await h.request('callback',{query:{drive:'callback',state:h.grants[0].state,code:'fixture'},headers:{cookie:start.headers['Set-Cookie'].split(';')[0]}}),url=new URL(callback.headers.Location);
    assert.equal(url.origin,app);assert.equal(url.pathname,target);assert.equal(url.searchParams.get('drive'),'connected');assert.equal(url.searchParams.get('uploadClass'),context.startsWith('https:')?null:classId);
  }
});
test('callback rejects absent, forged or expired state and broader-than-requested scopes',async()=>{
  for(const scenario of ['absent','forged','expired','broad','incomplete']){
    const h=harness(),start=await h.request('start'),grant=h.grants[0];let cookie=start.headers['Set-Cookie'].split(';')[0];
    if(scenario==='absent')cookie='';
    if(scenario==='forged')cookie+='x';
    if(scenario==='expired')cookie='__Host-estudiemos-drive-oauth='+vault.seal({uid:'alice',state:grant.state,verifier:'test',exp:0},'oauth');
    if(scenario==='broad')h.setTokens({access_token:'test',refresh_token:'test',scope:scope+' https://www.googleapis.com/auth/drive'});
    if(scenario==='incomplete')h.setTokens({access_token:'test',scope});
    const result=await h.request('callback',{query:{drive:'callback',state:grant.state,code:'test'},headers:{cookie}});
    assert.equal(result.headers.Location,app+'/mi-espacio.html?drive=error');assert.equal(h.rows.size,0,scenario);
  }
});

test('Mi unidad requires an explicit incremental request, server enablement and exactly the granted metadata scope',async()=>{
  const metadata='https://www.googleapis.com/auth/drive.metadata.readonly';
  const disabled=harness();await disabled.request('start',{body:{browse:true}});assert.deepEqual(Array.from(disabled.grants[0].scope),[scope]);
  const h=harness({env:{GOOGLE_DRIVE_BROWSE_ENABLED:'true'}});
  assert.deepEqual((await h.request('config')).body,{enabled:true,browseEnabled:true});
  const start=await h.request('start',{body:{browse:true}}),grant=h.grants[0];
  assert.deepEqual(Array.from(grant.scope),[scope,metadata]);
  h.setTokens({access_token:'limited-access',refresh_token:'limited-refresh',expiry_date:Date.now()+3600000,scope:metadata+' '+scope});
  const result=await h.request('callback',{query:{drive:'callback',state:grant.state,code:'test'},headers:{cookie:start.headers['Set-Cookie'].split(';')[0]}});
  assert.equal(result.headers.Location,app+'/mi-espacio.html?drive=connected');assert.equal((await h.request('status')).body.browse,true);
  for(const extra of ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/drive.readonly']){
    const denied=harness({env:{GOOGLE_DRIVE_BROWSE_ENABLED:'true'}}),s=await denied.request('start',{body:{browse:true}});
    denied.setTokens({access_token:'x',refresh_token:'y',scope:scope+' '+metadata+' '+extra});
    const response=await denied.request('callback',{query:{drive:'callback',state:denied.grants[0].state,code:'test'},headers:{cookie:s.headers['Set-Cookie'].split(';')[0]}});
    assert.equal(response.headers.Location,app+'/mi-espacio.html?drive=error');assert.equal(denied.rows.size,0);
  }
  const legacy=harness();legacy.rows.set('alice',{credentials:vault.seal({refreshToken:'old'},'user:alice')});
  assert.deepEqual((await legacy.request('status')).body,{connected:true,browse:false});
});
test('authentication and exact mutation origin are enforced before consulting any grant',async()=>{
  for(const headers of [{authorization:''},{authorization:'Bearer bob',origin:'https://attacker.test'},{authorization:'Bearer alice',origin:''}]){
    const h=harness(),result=await h.request('token',{headers:{host:'estudiemos-app.vercel.app','content-type':'application/json',origin:app,...headers}});
    assert.ok([401,403].includes(result.status));assert.equal(h.rows.size,0);assert.ok(!h.calls.some(call=>call[0]==='db'));
  }
});
test('status, token refresh and disconnect stay bound to the authenticated account, never a body user ID',async()=>{
  const h=harness();h.rows.set('alice',{credentials:vault.seal({refreshToken:'pilot-refresh',accessToken:'pilot-access',expiresAt:Date.now()+3600000},'user:alice')});
  const bobHeaders={host:'estudiemos-app.vercel.app',origin:app,'content-type':'application/json',authorization:'Bearer bob'};
  assert.equal((await h.request('status',{headers:bobHeaders})).body.connected,false);
  assert.equal((await h.request('token',{headers:bobHeaders,body:{userId:'alice'}})).status,409);
  const token=await h.request('token',{body:{userId:'bob'}});assert.equal(token.body.accessToken,'pilot-access');assert.ok(!JSON.stringify(token).includes('pilot-refresh'));
  const refreshed=await h.request('token',{body:{force:true}});assert.equal(refreshed.body.accessToken,'pilot-refreshed');assert.equal(h.calls.filter(call=>call[0]==='refresh').length,1);
  await h.request('disconnect',{headers:bobHeaders,body:{userId:'alice'}});assert.ok(h.rows.has('alice'));
  await h.request('disconnect');assert.equal(h.rows.size,0);assert.ok(h.calls.some(call=>call[0]==='revoke'));assert.ok(!h.calls.some(call=>typeof call[1]==='string' && call[1].includes('workspace_items')));
});
