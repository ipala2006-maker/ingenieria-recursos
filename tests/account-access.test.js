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

test('widget handoffs always land on the official widget without relying on Supabase redirect settings',async()=>{
  const file=require.resolve('../api/widget-link.js');
  const localRequire=require('node:module').createRequire(file);
  const worker='https://estudiemos.estudiemos-services.workers.dev',official='https://estudiemos.ar';
  const user={id:'fixture',email:'fixture@example.test',email_confirmed_at:'2026-01-01'};
  const otp=require('node:crypto').createHash('sha224').update('fixture-widget-code').digest('hex'), issued=[];
  const context={module:{exports:{}},Buffer,URL,URLSearchParams,Date,process:{env:{SUPABASE_SECRET_KEY:'fixture'}},require(name){
    if(name==='./_lib/supabase-admin')return {isConfigured:()=>true,authenticateBearer:async()=>user,adminRequest:async(path,options)=>{
      if(path==='/auth/v1/admin/users/'+user.id)return user;
      assert.equal(path,'/auth/v1/admin/generate_link');
      issued.push(JSON.parse(options.body));
      return {id:user.id,hashed_token:otp,action_link:'https://legacy.example/auth'};
    }};
    if(name==='./_lib/request-security')return {...localRequire(name),enforceRateLimit:async()=>true};
    return localRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  for(const origin of [official,worker,'https://estudiemos-app.vercel.app']){
    const issue={method:'POST',headers:{host:new URL(origin).host,origin,'content-type':'application/json'},body:{widget:'inbox'}};
    const response={headers:new Map(),status(code){this.statusCode=code;return this;},setHeader(key,value){this.headers.set(key,value);},json(value){this.body=value;},send(){},end(){}};
    await context.module.exports(issue,response);
    assert.equal(response.statusCode,200);
    const token=response.body.token;
    for(const host of [new URL(worker).host,new URL(official).host]) {
      await context.module.exports({method:'GET',headers:{host},query:{token}},response);
      assert.equal(response.statusCode,302);
      const destination=new URL(response.headers.get('Location'));
      assert.equal(destination.origin,official);
      assert.equal(destination.pathname,'/widget.html');
      assert.equal(destination.search,'?view=inbox&embed=rainmeter&linked=1');
      assert.equal(destination.hash,'#widget_otp='+otp);
      assert.match(response.headers.get('Cache-Control'),/^no-store/);
    }
    await context.module.exports({method:'GET',headers:{host:'estudiemos.ar'},query:{token:token.replace(/^./,'!')}},response);
    assert.equal(response.statusCode,401);
  }
  assert.deepEqual(issued,Array(6).fill({type:'magiclink',email:user.email}));
});

test('a widget OTP is consumed only on the official embedded widget and removed before auth starts',()=>{
  for(const [origin,embed,host] of [
    ['https://estudiemos.ar','rainmeter',true],
    ['https://estudiemos-app.vercel.app','rainmeter',true],
    ['https://estudiemos.ar','other',true],
    ['https://estudiemos.ar','rainmeter',false]
  ]){
    const href=origin+'/widget.html?view=inbox&embed='+embed+'&linked=1#widget_otp='+'ab'.repeat(28);
    let clean;
    const ctx={URL,URLSearchParams,location:{origin,href},history:{replaceState(_a,_b,url){clean=url;}},document:{body:{hasAttribute:()=>host}}};
    vm.runInNewContext(extract('function takeDesktopWidgetOtp(', 'function finishReady('),ctx);
    const valid=origin==='https://estudiemos.ar'&&embed==='rainmeter'&&host;
    assert.equal(ctx.takeDesktopWidgetOtp(),valid?'ab'.repeat(28):null);
    assert.equal(clean?.href,valid?origin+'/widget.html?view=inbox&embed=rainmeter':undefined);
  }
});
