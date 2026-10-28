const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { dispatchPush, limitsFor } = require('../api/_lib/push-dispatch');

function fixture(count, options = {}) {
  const pending = Array.from({ length: count }, (_,index) => ({ id: index+1, tag: 'inbox-'+(index+1) }));
  const calls = [], delivered = [], acknowledged = [];
  let active = 0, peak = 0;
  const rpc = async (name, body) => {
    calls.push({ name, body });
    if (name === 'claim_mobile_push_batch') {
      if (options.claimError) throw options.claimError;
      return options.claimResult || pending.splice(0,body.p_limit);
    }
    if (name === 'claim_mobile_push_jobs') return pending.splice(0,5);
    if (name === 'finish_mobile_push_jobs') {
      if (options.ackError) throw options.ackError;
      acknowledged.push(...body.p_results);
    } else if (name === 'finish_mobile_push_job') {
      if (body.p_id === options.legacyAckFailure) throw new Error('offline');
      acknowledged.push({ id: body.p_id, ok: body.p_ok, expired: body.p_expired });
    }
  };
  const send = async job => {
    active++; peak = Math.max(peak,active);
    await new Promise(resolve => setImmediate(resolve));
    active--; delivered.push(job.id);
    if (job.id === 3 && options.failSends) throw { statusCode: 410 };
    if (job.id === 4 && options.failSends) throw { statusCode: 503 };
  };
  return { pending, calls, delivered, acknowledged, rpc, send, get peak() { return peak; } };
}

test('platform profiles are explicit, immutable, and cannot be supplied as an unbounded object', async () => {
  assert.ok(Object.isFrozen(limitsFor('cloudflare-free')));
  assert.equal(limitsFor('cloudflare-free').batchSize,4);
  assert.throws(() => limitsFor('unknown'),/PROFILE/);
  assert.throws(() => limitsFor({ batchSize: 1000 }),/PROFILE/);
  await assert.rejects(dispatchPush({ rpc: () => assert.fail(), send: () => assert.fail() }),/PROFILE/);
});

test('Cloudflare reserves only four jobs and uses six logical subrequests with two concurrent sends', async () => {
  const h = fixture(100);
  const result = await dispatchPush({ profile:'cloudflare-free', rpc:h.rpc, send:h.send });
  assert.deepEqual(result,{ sent:4, failed:0, claimed:4, batches:1, subrequests:6 });
  assert.equal(h.pending.length,96); assert.equal(h.peak,2);
  assert.deepEqual(h.calls.map(call=>call.name),['claim_mobile_push_batch','finish_mobile_push_jobs']);
  assert.equal(h.calls[0].body.p_limit,4); assert.equal(h.acknowledged.length,4);
});

test('conservative Workers profile reserves two jobs with four logical subrequests', async () => {
  const h = fixture(3);
  const result = await dispatchPush({ profile:'cloudflare-free-small', rpc:h.rpc, send:h.send });
  assert.deepEqual(result, { sent:2, failed:0, claimed:2, batches:1, subrequests:4 });
  assert.equal(h.peak,2); assert.equal(h.pending.length,1);
  assert.equal(h.calls[0].body.p_limit,2); assert.equal(h.acknowledged.length,2);
  const empty = fixture(0);
  assert.equal((await dispatchPush({ profile:'cloudflare-free-small', rpc:empty.rpc, send:empty.send })).subrequests,1);
});

test('bounded small-worker fanout preserves 400 jobs without claiming the remainder', async () => {
  const h = fixture(401);
  const results = await Promise.all(Array.from({ length:200 },()=>dispatchPush({ profile:'cloudflare-free-small', rpc:h.rpc, send:h.send })));
  assert.equal(results.reduce((sum,result)=>sum+result.sent,0),400);
  assert.equal(new Set(h.delivered).size,400);
  assert.equal(h.acknowledged.length,400); assert.equal(h.pending.length,1);
});

test('single-job Workers profile retains 400-message tick capacity through bounded fanout', async () => {
  const h = fixture(401);
  const results = await Promise.all(Array.from({ length:400 },()=>dispatchPush({ profile:'cloudflare-free-single', rpc:h.rpc, send:h.send })));
  assert.ok(results.every(result=>result.sent===1 && result.subrequests===3));
  assert.ok(h.calls.filter(call=>call.name==='claim_mobile_push_batch').every(call=>call.body.p_limit===1));
  assert.equal(new Set(h.delivered).size,400); assert.equal(h.acknowledged.length,400); assert.equal(h.pending.length,1);
});

test('Vercel keeps its 100-job capacity in five small batches and does not lease the remaining queue', async () => {
  const h = fixture(101,{ failSends:true });
  const result = await dispatchPush({ profile:'vercel', rpc:h.rpc, send:h.send });
  assert.deepEqual(result,{ sent:98, failed:2, claimed:100, batches:5, subrequests:110 });
  assert.equal(h.peak,10); assert.equal(h.pending.length,1); assert.equal(h.acknowledged.length,100);
  assert.equal(h.calls.filter(call=>call.name==='finish_mobile_push_jobs').length,5);
  assert.ok(h.calls.filter(call=>call.name==='claim_mobile_push_batch').every(call=>call.body.p_limit===20));
  assert.deepEqual(h.acknowledged.find(result=>result.id===3),{ id:3, ok:false, expired:true });
  assert.deepEqual(h.acknowledged.find(result=>result.id===4),{ id:4, ok:false, expired:false });
});

test('four Vercel workers retain the previous 400-notification tick capacity without duplicate claims', async () => {
  const h = fixture(401);
  const results = await Promise.all(Array.from({ length:4 },()=>dispatchPush({ profile:'vercel', rpc:h.rpc, send:h.send })));
  assert.equal(results.reduce((sum,result)=>sum+result.sent,0),400); assert.equal(new Set(h.delivered).size,400);
  assert.equal(h.pending.length,1); assert.equal(h.acknowledged.length,400);
});

test('partial and empty queues stop without unnecessary claims or acknowledgements', async () => {
  for (const profile of ['vercel','cloudflare-free']) {
    const empty = fixture(0), result = await dispatchPush({ profile, rpc:empty.rpc, send:empty.send });
    assert.equal(result.subrequests,1); assert.equal(result.claimed,0); assert.equal(empty.calls.length,1);
    const partial = fixture(3), sent = await dispatchPush({ profile, rpc:partial.rpc, send:partial.send });
    assert.equal(sent.batches,1); assert.equal(sent.subrequests,5);
  }
});

test('only the current Vercel adapter may use the bounded legacy fallback; Workers fails closed', async () => {
  const error = { status:404, data:{ code:'PGRST202' } };
  const old = fixture(100,{ claimError:error });
  const result = await dispatchPush({ profile:'vercel', rpc:old.rpc, send:old.send });
  assert.equal(result.claimed,5); assert.equal(result.subrequests,12); assert.equal(old.pending.length,95);
  const worker = fixture(100,{ claimError:error });
  await assert.rejects(dispatchPush({ profile:'cloudflare-free', rpc:worker.rpc, send:worker.send }));
  assert.equal(worker.calls.length,1); assert.equal(worker.delivered.length,0); assert.equal(worker.pending.length,100);
});

test('claim failures do not use a legacy query, and failed acknowledgements stop new claims', async () => {
  for (const error of [{ status:503 },{ status:404, data:{ code:'OTHER' } }]) {
    const h = fixture(100,{ claimError:error });
    await assert.rejects(dispatchPush({ profile:'vercel', rpc:h.rpc, send:h.send }));
    assert.equal(h.calls.length,1); assert.equal(h.pending.length,100);
  }
  const h = fixture(100,{ ackError:new Error('offline') });
  await assert.rejects(dispatchPush({ profile:'vercel', rpc:h.rpc, send:h.send }),/offline/);
  assert.equal(h.delivered.length,20); assert.equal(h.pending.length,80); assert.equal(h.calls.length,2);
  const legacy = fixture(100,{ claimError:{ status:404, data:{ code:'PGRST202' } }, legacyAckFailure:3 });
  await assert.rejects(dispatchPush({ profile:'vercel', rpc:legacy.rpc, send:legacy.send }),/ACK/);
  assert.equal(legacy.calls.length,7); assert.equal(legacy.acknowledged.length,4); assert.equal(legacy.pending.length,95);
});

test('oversized or duplicate claims are rejected instead of dropping leased notifications or sending duplicates', async () => {
  for (const claimResult of [[...Array(5)].map((_,i)=>({ id:i+1 })),[{ id:1 },{ id:'1' }],[{}],null]) {
    const h = fixture(0,{ claimResult });
    const rpc = claimResult===null ? async()=>null : h.rpc;
    await assert.rejects(dispatchPush({ profile:'cloudflare-free', rpc, send:h.send }),/INVALID_PUSH_CLAIM/);
    assert.equal(h.delivered.length,0); assert.equal(h.acknowledged.length,0);
  }
  const h = fixture(20,{ claimResult:Array.from({ length:20 },(_,i)=>({ id:i+1 })) });
  await assert.rejects(dispatchPush({ profile:'vercel', rpc:h.rpc, send:h.send }),/INVALID_PUSH_CLAIM/);
  assert.equal(h.delivered.length,20);
});

test('a slow Vercel batch leaves later jobs unclaimed before its function deadline', async () => {
  const h = fixture(100); let time = 0;
  const result = await dispatchPush({ profile:'vercel', rpc:async(name,body)=>{
    const value=await h.rpc(name,body); if(name==='finish_mobile_push_jobs')time+=45000; return value;
  }, send:h.send, now:()=>time });
  assert.equal(result.claimed,20); assert.equal(h.pending.length,80); assert.equal(h.acknowledged.length,20);
});

test('the shared dispatcher imports no Node APIs, environment credentials or network transport', () => {
  const source = fs.readFileSync(require.resolve('../api/_lib/push-dispatch'),'utf8');
  assert.doesNotMatch(source,/\brequire\s*\(|\bprocess\.|\bBuffer\b|\bfetch\s*\(/);
});

test('cron authorization and generic errors remain in the current HTTP adapter; request input cannot select Workers', async () => {
  const calls = [], secret = 'fixture-only-'.repeat(4);
  let rpcError = false;
  const context = { module:{ exports:{} }, URL, Intl, Buffer, setTimeout:fn=>fn(),
    process:{ env:{ WEB_PUSH_PUBLIC_KEY:'fixture', WEB_PUSH_PRIVATE_KEY:'fixture', MOBILE_PUSH_CRON_SECRET:secret } },
    require:name=>{
      if(name==='node:crypto')return require(name);
      if(name==='./push-dispatch')return require('../api/_lib/push-dispatch');
      if(name==='./push-credentials'){
        const scoped={...context,module:{exports:{}}};
        vm.runInNewContext(fs.readFileSync(require.resolve('../api/_lib/push-credentials'),'utf8'),scoped);
        return scoped.module.exports;
      }
      if(name==='./request-security')return {};
      if(name==='./supabase-admin')return { adminRequest:async(url,options)=>{
        calls.push({url,options}); if(rpcError)throw new Error('private-backend-details'); return [];
      } };
      throw new Error('Unexpected dependency '+name);
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/_lib/mobile-push'),'utf8'),context);
  const call = async authorization=>{
    const response = { status(code){ this.code=code; return this; }, json(body){ this.body=body; return this; } };
    await context.module.exports({ method:'POST', query:{ mobilePush:'dispatch', profile:'cloudflare-free' }, body:{ batchSize:10000 }, headers:{authorization} },response);
    return response;
  };
  assert.equal((await call('Bearer wrong')).code,401); assert.equal(calls.length,0);
  assert.equal((await call('Bearer '+secret)).code,200);
  assert.equal(JSON.parse(calls[0].options.body).p_limit,20); assert.equal(calls[0].options.redirect,'error');
  rpcError=true;
  const failure=await call('Bearer '+secret);
  assert.equal(failure.code,503); assert.equal(failure.body.message,'Delivery unavailable');
  assert.doesNotMatch(JSON.stringify(failure.body),/private-backend-details|fixture-only/);
});
