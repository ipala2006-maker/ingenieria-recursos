const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),webpush=require('web-push');
test('isolated provider probe expires, authenticates, enforces origin and does not touch production',async()=>{
  const handler=(await import('../cloudflare/provider-probe.mjs')).default,base='https://probe.test',token='a'.repeat(64);
  const env={PROBE_ENABLED:'true',PROBE_EXPIRES_AT:String(Date.now()+60000),PROBE_TOKEN:token};
  for(const overrides of [{PROBE_ENABLED:'false'},{PROBE_EXPIRES_AT:'0'},{PROBE_EXPIRES_AT:'invalid'}])assert.equal((await handler.fetch(new Request(base),{...env,...overrides})).status,410);
  assert.equal((await handler.fetch(new Request(base+'/send',{method:'POST'}),env)).status,401);
  assert.equal((await handler.fetch(new Request(base+'/send',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://other.test'}}),env)).status,403);
  const pair=webpush.generateVAPIDKeys(),receiver=crypto.createECDH('prime256v1');receiver.generateKeys();
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/fixture-only',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')}};
  const original=global.fetch,calls=[];
  global.fetch=async(url,options)=>{calls.push({url,options});return new Response('',{status:201});};
  try{
    const request=body=>new Request(base+'/send',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:base,'Content-Type':'application/json'},body});
    assert.equal((await handler.fetch(request('x'.repeat(5000)),env)).status,413);assert.equal(calls.length,0);
    const result=await handler.fetch(request(JSON.stringify(sub)),{...env,PROBE_VAPID_PUBLIC_KEY:pair.publicKey,PROBE_VAPID_PRIVATE_KEY:pair.privateKey,PROBE_RECEIPT_NONCE:'test-nonce'});
    assert.deepEqual(await result.json(),{accepted:true,status:201,nonce:'test-nonce'});assert.equal(calls.length,1);assert.equal(calls[0].url,sub.endpoint);assert.equal(calls[0].options.redirect,'manual');
    assert.equal(result.headers.get('cache-control'),'no-store');
  }finally{global.fetch=original;}
});
