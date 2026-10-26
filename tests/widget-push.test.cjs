const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./helpers/account-sync-fixture.cjs');
const file=require.resolve('../api/widget-push');
function backend({devices=[],configured=true,authorized=true}={}) {
  const reads=[],sent=[];
  const context={module:{exports:{}},URLSearchParams,process:{env:{SUPABASE_URL:'https://supabase.example',SUPABASE_PUBLISHABLE_KEY:'public-fixture'}},
    require:name=>{
      if(name==='./_lib/supabase-admin')return {authenticateBearer:async()=>authorized?{id:'alice'}:null};
      if(name==='./_lib/firebase-push')return {isConfigured:()=>configured,sendWidgetSync:async tokens=>{sent.push(tokens);return {enabled:true,sent:tokens.length};}};
      if(name==='./_lib/request-security')return {enforceRateLimit:async()=>true,isSameOriginRequest:()=>true,rejectOversizedBody:()=>false,setSecurityHeaders(){}};
      throw Error(name);
    },fetch:async(url,options)=>{reads.push({url,options});return {ok:true,json:async()=>[{devices}]};}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  return {reads,sent,request:async(body)=>{
    const response={statusCode:0,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
    await context.module.exports({method:'POST',query:{},headers:{authorization:'Bearer fixture-only'},body},response);return response;
  }};
}
test('real synchronization never invokes widget-push for accounts without Android devices',async()=>{
  const h=harness();assert.equal(await h.read('startup'),true);
  for(let i=0;i<20;i++){
    h.advance(60000);h.local.set('estudiemos_pomodoro_streak',JSON.stringify({days:{'2026-10-23':i+1}}));
    h.context.markLocalChange('estudiemos_pomodoro_streak');assert.equal(await h.read('change'),true);
  }
  assert.equal(h.pushRequests.length,0);
});
test('real notifier supports registered and legacy tokens but never trusts another local account cache',async()=>{
  const h=harness();
  h.local.set('estudiemos_android_devices',JSON.stringify([{token:'wrong-account-token'}]));
  for(const devices of [undefined,[],null,'invalid',[{}, {token:5},{token:' '},{token:'x'.repeat(4097)}]]){
    await h.context.notifyAndroidWidgets({values:{estudiemos_android_devices:devices}});
  }
  assert.equal(h.pushRequests.length,0);
  for(const devices of [[{token:'fixture-token'}],['legacy-token'],JSON.stringify([{token:'fixture-token'}])]){
    await h.context.notifyAndroidWidgets({values:{estudiemos_android_devices:devices}});
  }
  assert.equal(h.pushRequests.length,3);
  assert.ok(h.pushRequests.every(r=>r.url.endsWith('/api/widget-push')&&!r.options.body));
  h.context.session=null;await h.context.notifyAndroidWidgets({values:{estudiemos_android_devices:['x']}});
  assert.equal(h.pushRequests.length,3);
});
test('widget route requests only authenticated account tokens, never the full profile',async()=>{
  const b=backend({devices:[{token:'fixture-token'}]});const result=await b.request();
  assert.equal(result.statusCode,200);assert.equal(b.sent.length,1);assert.deepEqual(Array.from(b.sent[0]),['fixture-token']);
  const url=new URL(b.reads[0].url);
  assert.equal(url.searchParams.get('select'),'devices:state->values->estudiemos_android_devices');
  assert.equal(url.searchParams.get('user_id'),'eq.alice');
  assert.equal(b.reads[0].options.headers.Authorization,'Bearer fixture-only');
});
test('Android does not wake itself but still notifies other linked Android devices',async()=>{
  const h=harness();h.context.hasAndroidBridge=()=>true;h.context.androidPushToken='this-device';
  await h.context.notifyAndroidWidgets({values:{estudiemos_android_devices:[{token:'this-device'}]}});
  assert.equal(h.pushRequests.length,0);
  await h.context.notifyAndroidWidgets({values:{estudiemos_android_devices:[{token:'this-device'},{token:'other-device'}]}});
  assert.equal(h.pushRequests.length,1);assert.deepEqual(JSON.parse(h.pushRequests[0].options.body),{excludeToken:'this-device'});
  const b=backend({devices:['this-device','other-device']});await b.request({excludeToken:'this-device'});
  assert.deepEqual(Array.from(b.sent[0]),['other-device']);
});
test('widget route neither reads data when disabled/unauthenticated nor sends to invalid tokens',async()=>{
  for(const options of [{configured:false},{authorized:false}]){
    const b=backend(options);await b.request();assert.equal(b.reads.length,0);assert.equal(b.sent.length,0);
  }
  const b=backend({devices:JSON.stringify([{}, {token:27},{token:' '},'legacy-token'])});
  await b.request();assert.deepEqual(Array.from(b.sent[0]),['legacy-token']);
});
