const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../api/_lib/request-security'),'utf8');
function harness(){
  const buckets=new Map(),calls=[];
  const context={globalThis:{},Symbol,Date,Buffer,URL,Map,process:{env:{RATE_LIMIT_SECRET:'fixture-only'}},module:{exports:{}},require:name=>{
    if(name==='crypto')return require('node:crypto');
    if(name==='./supabase-admin')return {isConfigured:()=>true,adminRequest:async(_url,options)=>{
      const data=JSON.parse(options.body);calls.push(data);const key=data.target_route+data.target_key;
      const count=(buckets.get(key)||0)+1;buckets.set(key,count);return {allowed:count<=data.target_limit,count,remaining:Math.max(0,data.target_limit-count),resetAt:new Date(Date.now()+60000).toISOString()};
    }};throw Error(name);
  }};
  vm.runInNewContext(source,context);
  const request=(token='x')=>({headers:{authorization:'Bearer '+token},socket:{remoteAddress:'192.0.2.1'}});
  const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  return {limit:context.module.exports.enforceRateLimit,request,response,calls};
}

test('400 students sharing one Wi-Fi keep independent authenticated classroom budgets',async()=>{
  const h=harness();
  for(let id=0;id<400;id++)for(let action=0;action<2;action++)assert.equal(await h.limit(h.request('token-'+id),h.response(),{route:'classrooms',limit:120,ipLimit:1000,principal:'verified-'+id}),true);
  assert.equal(new Set(h.calls.map(call=>call.target_key)).size,400);
  assert.ok(h.calls.every(call=>call.target_key.startsWith('user:')));
  assert.doesNotMatch(JSON.stringify(h.calls),/verified-|token-/);
});

test('rotating bearer tokens cannot reset a verified user budget; other students still work',async()=>{
  const h=harness(),options={route:'classrooms',limit:3,ipLimit:1000,principal:'same-verified-user'};
  for(let i=0;i<3;i++)assert.equal(await h.limit(h.request(String(i)),h.response(),options),true);
  const denied=h.response();assert.equal(await h.limit(h.request('rotated'),denied,options),false);assert.equal(denied.code,429);assert.ok(Number(denied.headers['Retry-After'])>0);
  assert.equal(await h.limit(h.request('other'),h.response(),{...options,principal:'other-user'}),true);
});

test('public invitations still reject abuse and unverified identity headers do not change their bucket',async()=>{
  const h=harness();
  for(let i=0;i<600;i++)assert.equal(await h.limit(h.request(String(i)),h.response(),{route:'course-invitation',limit:600}),true);
  const request=h.request('new');request.headers['x-user-id']='different';request.body={principal:'not-trusted'};
  const denied=h.response();assert.equal(await h.limit(request,denied,{route:'course-invitation',limit:600}),false);assert.equal(denied.code,429);
});

test('only authenticated route code supplies the principal and public previews do not inherit the old shared cap',()=>{
  const code=fs.readFileSync(require.resolve('../api/_lib/classrooms'),'utf8');
  assert.ok(code.indexOf('authenticateBearer(req.headers.authorization)')<code.indexOf('principal:user.id'));
  assert.ok(code.indexOf("req.query.invite")<code.indexOf("route:'classrooms'"));
  assert.match(code,/route:'classroom-preview',limit:600/);
});
