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
  assert.ok(config.publishableKey && !config.publishableKey.startsWith('sb_secret_'));
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
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
