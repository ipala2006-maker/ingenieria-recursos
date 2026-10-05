// Read-only public checks. No real accounts, AI calls, SMS or payments.
const assert = require('node:assert/strict');
const origin='https://estudiemos-app.vercel.app';
(async()=>{
  const results=[];
  const page=await fetch(origin,{signal:AbortSignal.timeout(20000)});
  for(const name of ['strict-transport-security','content-security-policy','x-content-type-options','x-frame-options']) {
    assert.ok(page.headers.get(name),'Missing '+name);
    results.push({check:name,pass:true});
  }
  for(const [url,method,body] of [
    ['/api/plan-status','GET'],['/api/user-registry','GET'],['/api/admin-monitoring','GET'],
    ['/api/widget-link','POST',{widget:'inbox'}],['/api/widget-push','POST',{}]
  ]) {
    const response=await fetch(origin+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,401,url+' should reject unauthenticated access');
    assert.match(response.headers.get('cache-control')||'',/no-store/);
    results.push({check:url,status:response.status});
  }
  const config=await (await fetch(origin+'/api/account-config')).json();
  assert.equal(config.enabled,true);
  assert.ok(config.captchaSiteKey,'CAPTCHA not configured');
  assert.equal(require('../api/_lib/public-config').isPublicSupabaseKey(config.publishableKey),true);
  assert.equal(Object.keys(config).some(key=>/secret|password|accessToken/i.test(key)),false);
  results.push({check:'public configuration and CAPTCHA',pass:true});
  const database=new URL(config.url);
  assert.equal(database.protocol,'https:');
  assert.ok(database.hostname.endsWith('.supabase.co'));
  for(const table of ['user_states','workspace_items','user_registry']) {
    const response=await fetch(database.origin+`/rest/v1/${table}?select=*&limit=1`,{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(20000)});
    const payload=await response.json();
    const denied=[401,403].includes(response.status) || (response.ok && Array.isArray(payload) && payload.length===0);
    assert.ok(denied,table+' exposed rows without authentication');
    results.push({check:'anonymous DB '+table,pass:denied,status:response.status});
  }
  for(const [rpc,body] of [
    ['friends_action',{p_user:'00000000-0000-4000-8000-000000000001',p_action:'list',p_data:{}}],
    ['get_windows_alarm_snapshot',{p_user_id:'00000000-0000-4000-8000-000000000001'}],
    ['consume_api_rate_limit',{target_key:'audit',target_route:'audit',target_limit:1,target_window_seconds:60}],
    ['mobile_push_ready',{}]
  ]) {
    const response=await fetch(database.origin+`/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const error=await response.json();
    const unavailable=response.status===404 && error.code==='PGRST202';
    assert.ok([401,403].includes(response.status)||unavailable,rpc+' must not expose private data');
    results.push({check:'anonymous privileged RPC '+rpc,status:response.status,unavailable});
  }
  // One deliberately invalid login checks server enforcement, without email or SMS.
  const captcha=await fetch(database.origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:'launch-audit@example.invalid',password:'not-a-real-password'}),signal:AbortSignal.timeout(20000)});
  const captchaError=await captcha.json();
  assert.ok(!captcha.ok && /captcha/i.test(captchaError.error_code||captchaError.code||captchaError.msg||captchaError.message||''),'Supabase must enforce CAPTCHA server-side');
  results.push({check:'server rejects password login without CAPTCHA',status:captcha.status});
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
