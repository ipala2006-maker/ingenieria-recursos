const test=require('node:test'),assert=require('node:assert/strict');
const {harness,installCompact,deferred}=require('./helpers/account-sync-fixture.cjs');

test('focus checks only a conditional revision and coalesces repeated activation without rendering or downloads',async()=>{
  const h=harness();installCompact(h);await h.read('startup');const calls=h.rpcCalls.length,events=h.events.length;
  await h.read('resume');await h.read('resume');
  assert.equal(h.reads.length,1);assert.equal(h.reads[0].fields,'updated_at');assert.equal(h.reads[0].owner,'alice');
  assert.equal(h.reads[0].revision,h.context.cloudRevision);assert.equal(h.rpcCalls.length,calls);assert.equal(h.events.length,events);
  h.advance(2500);await h.read('resume');assert.equal(h.reads.length,2);assert.equal(h.writes.length,0);
});

test('a mobile alarm arrives on resume as a delta and notifies only when the agenda changed',async()=>{
  const h=harness();installCompact(h);await h.read('startup');
  const phone=harness(h.rows);installCompact(phone);await phone.read('startup');phone.advance(1000);
  const tasks=JSON.parse(phone.local.get('bandeja_agenda'));
  tasks.push({id:'phone',title:'Repasar',alarm:{date:'2026-10-24',time:'08:00',repeat:'none'}});
  phone.local.set('bandeja_agenda',JSON.stringify(tasks));phone.context.markLocalChange('bandeja_agenda');await phone.read('change');
  await h.read('resume');assert.equal(h.rpcCalls.length,2);assert.equal(h.writes.length,0);
  assert.equal(JSON.parse(h.local.get('bandeja_agenda')).find(x=>x.id==='phone').alarm.time,'08:00');
  assert.equal(h.events.filter(x=>x==='estudiemos:resume-synced').length,1);
  h.advance(2500);await h.read('resume');assert.equal(h.events.filter(x=>x==='estudiemos:resume-synced').length,1);
});

test('local edits, offline state and account switches remain protected during a resume check',async()=>{
  const h=harness();installCompact(h);await h.read('startup');
  h.local.set('bandeja_agenda',JSON.stringify([{id:'local',title:'Local draft'}]));h.context.markLocalChange('bandeja_agenda');
  await h.read('resume');assert.equal(h.reads.length,0);assert.equal(h.rows.get('alice').state.values.bandeja_agenda[0].title,'Local draft');
  assert.equal(h.events.includes('estudiemos:resume-synced'),false,'Saving only local edits never claims an update from another device');
  h.context.navigator.onLine=false;assert.equal(await h.read('resume'),false);h.context.navigator.onLine=true;h.advance(2500);
  const pending=deferred();h.context.readHook=()=>pending.promise;
  const read=h.read('resume');h.context.session={user:{id:'bob'}};h.context.clearLocalAccountData();pending.resolve({data:{updated_at:'2026-10-24T13:00:00Z'}});
  assert.equal(await read,false);assert.equal(h.local.get('bandeja_agenda'),'[]');assert.equal(h.events.includes('estudiemos:resume-synced'),false);
});
