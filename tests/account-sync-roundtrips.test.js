const test = require('node:test'), assert = require('node:assert/strict');
const {harness, installCompact, deferred} = require('./helpers/account-sync-fixture.cjs');
const change = h => { h.advance(1000); h.local.set('bandeja_agenda', JSON.stringify([{id:'local',title:'Local change'}])); h.context.markLocalChange('bandeja_agenda'); };

test('a confirmed compact writer makes one atomic request, never a pre-read or full-state upsert', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  const calls=h.rpcCalls.length; change(h); assert.equal(await h.read('change'),true);
  assert.equal(h.rpcCalls.length-calls,1); assert.ok(h.rpcCalls.at(-1).p_patch);
  assert.equal(h.reads.length,0); assert.equal(h.writes.length,0); assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('quiet checks transfer only a user-scoped revision and do not re-render the tools', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  const calls=h.rpcCalls.length, bytes=h.context.getSyncUsage().days['2026-10-23'].receivedBytes, events=h.events.length;
  h.advance(120000); assert.equal(await h.read('poll'),true);
  assert.equal(h.rpcCalls.length,calls); assert.deepEqual(h.reads.at(-1),{table:'user_states',fields:'updated_at',owner:'alice',revision:undefined});
  assert.ok(h.context.getSyncUsage().days['2026-10-23'].receivedBytes-bytes<80); assert.equal(h.events.length,events);
});

test('a missed broadcast is recovered after the same backup interval', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  h.rows.get('alice').updated_at='2026-10-23T16:00:00Z'; h.rows.get('alice').state.values.bandeja_agenda[0].title='From another device';
  h.rows.get('alice').state.changedAt.bandeja_agenda=2;
  h.advance(120000); assert.equal(await h.read('poll'),true);
  assert.equal(JSON.parse(h.local.get('bandeja_agenda'))[0].title,'From another device'); assert.equal(h.reads.at(-1).fields,'updated_at');
});

test('a dirty edit arriving during the revision probe is neither dropped nor left marked clean', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  const pending=deferred(); h.context.readHook=()=>pending.promise; h.advance(120000);
  const reading=h.read('poll'); change(h); pending.resolve({data:{updated_at:h.context.cloudRevision}}); assert.equal(await reading,true);
  assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'Local change'); assert.equal(h.local.get('estudiemos_cloud_dirty'),'false');
});

test('removing the RPC after hydration cannot turn an optimistic write into an unchecked overwrite', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  h.context.client.rpc=async()=>({error:{code:'PGRST202'}}); change(h);
  assert.equal(await h.read('change'),false); assert.equal(h.writes.length,0); assert.equal(h.local.get('estudiemos_cloud_dirty'),'true');
  assert.equal(h.context.compactAvailable,false); await h.drain();
  assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'Local change'); assert.equal(h.reads.length,1);
});

test('an in-flight revision response cannot confirm a different account', async () => {
  const h=harness(); installCompact(h); await h.read('startup');
  const pending=deferred(); h.context.readHook=()=>pending.promise; h.advance(120000);
  const reading=h.read('poll'); h.context.session={user:{id:'bob'}}; h.context.clearLocalAccountData(); pending.resolve({data:{updated_at:'old'}});
  assert.equal(await reading,false); assert.equal(h.context.synchronizedUserId,''); assert.equal(h.local.get('bandeja_agenda'),'[]');
});

test('probe errors preserve local content, back off and never fall back to an unguarded write', async () => {
  const h=harness(); installCompact(h); await h.read('startup'); h.context.failure=true; h.advance(120000);
  const calls=h.rpcCalls.length; assert.equal(await h.read('poll'),false); assert.equal(h.rpcCalls.length,calls); assert.equal(h.writes.length,0);
  assert.equal(JSON.parse(h.local.get('bandeja_agenda'))[0].title,'Private title'); assert.ok(h.context.syncRetryAt>h.context.Date.now());
});

test('Pomodoro controls remain immediate and use the guarded write, not the quiet probe', async () => {
  const h=harness(); installCompact(h); await h.read('startup'); const calls=h.rpcCalls.length;
  h.local.set('estudiemos_pomodoro_sync',JSON.stringify({version:1,updatedAt:h.context.Date.now(),phase:'study',running:true})); h.context.markLocalChange('estudiemos_pomodoro_sync');
  assert.equal(await h.read('pomodoro'),true); assert.equal(h.rpcCalls.length-calls,1); assert.equal(h.reads.length,0);
});

test('launch terms explain student origin and future pricing without enabling a charge', () => {
  const fs=require('node:fs'), text=fs.readFileSync(require.resolve('../about.html'),'utf8');
  assert.match(text,/proyecto independiente desarrollado por un estudiante/); assert.match(text,/no se ofrece con carácter permanente/);
  assert.match(text,/Ningún cobro se realizará sin la aceptación expresa del usuario/);
  assert.match(fs.readFileSync(require.resolve('../scripts/account.js'),'utf8'),/COMMERCIAL_LAUNCH_ENABLED = false/);
});
