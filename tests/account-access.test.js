const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/account.js'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf('  '+start),source.indexOf('  '+end));

test('account startup times out an SDK promise that does not honor cancellation',async()=>{
  let deadline,cleared=false,signal;
  const context={AbortController,window:{setTimeout(callback,ms){assert.equal(ms,10000);deadline=callback;return 1;},clearTimeout(id){cleared=id===1;}}};
  vm.runInNewContext(extract('async function authStartupDeadline(', 'function loadScript('),context);
  const pending=context.authStartupDeadline(value=>{signal=value;return new Promise(()=>{});});
  deadline();
  await assert.rejects(pending,/account-startup-timeout/);
  assert.equal(signal.aborted,true);
  assert.equal(cleared,true);
  assert.equal(await context.authStartupDeadline(async()=>42),42);
});

test('login errors distinguish retryable security and rate limits from wrong credentials',()=>{
  const context={};
  vm.runInNewContext(extract('function authErrorMessage(', 'function renderAccountState('),context);
  for(const [error,message] of [
    [{code:'invalid_credentials'},/correo o la contrase/],
    [{code:'captcha_failed'},/completarl/],
    [{code:'email_not_confirmed'},/confirm/],
    [{status:429},/demasiados intentos/i],
    [{status:503},/servicio de cuentas/]
  ])assert.match(context.authErrorMessage(error),message);
});

test('widget login returns to the origin that issued the signed handoff, not the redemption host',async()=>{
  const file=require.resolve('../api/widget-link.js');
  const localRequire=require('node:module').createRequire(file);
  const worker='https://estudiemos.estudiemos-services.workers.dev',official='https://estudiemos.ar';
  const user={id:'fixture',email:'fixture@example.test'};
  const redirects=[];
  const context={module:{exports:{}},Buffer,URL,Date,process:{env:{SUPABASE_SECRET_KEY:'fixture'}},require(name){
    if(name==='./_lib/supabase-admin')return {isConfigured:()=>true,authenticateBearer:async()=>user,adminRequest:async(path,options)=>{
      if(path.startsWith('/auth/v1/admin/users/'))return user;
      redirects.push(JSON.parse(options.body).redirect_to);
      return {action_link:'https://fixture.supabase.co/auth/v1/verify'};
    }};
    if(name==='./_lib/app-origin')return {appOrigin:()=>worker};
    if(name==='./_lib/request-security')return {...localRequire(name),enforceRateLimit:async()=>true};
    return localRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  for(const origin of [official,worker]){
    const issue={method:'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json'},body:{widget:'inbox'}};
    const response={headers:new Map(),status(code){this.statusCode=code;return this;},setHeader(key,value){this.headers.set(key,value);},json(value){this.body=value;},end(){}};
    await context.module.exports(issue,response);
    assert.equal(response.statusCode,200);
    await context.module.exports({method:'GET',headers:{host:new URL(worker).host},query:{token:response.body.token}},response);
    assert.equal(response.statusCode,302);
    assert.equal(redirects.at(-1),origin+'/widget.html?view=inbox&embed=rainmeter&linked=1');
  }
});
