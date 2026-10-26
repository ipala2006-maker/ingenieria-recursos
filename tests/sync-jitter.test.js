const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/account-sync-fixture.cjs');

test('background checks are distributed but foreground edits, verification and Realtime keep their latency',async()=>{
  const intervals=[];
  for(let i=0;i<100;i++){
    const h=harness();await h.read('startup');h.context.startCloudPolling();
    const interval=h.intervals[0].delay;assert.ok(interval>=5000&&interval<=10000);intervals.push(interval);
    assert.equal(h.context.cloudCheckInterval(),120000);
    h.context.scheduleSync();assert.equal([...h.timers.values()][0].delay,600);
    const before=h.reads.length;await h.read('verify');assert.equal(h.reads.length,before+1);
    h.context.scheduleRemoteRefresh('realtime');assert.equal([...h.timers.values()].at(-1).delay,150);
  }
  assert.ok(new Set(intervals).size>80,'Timers must not align every device to the same second');
});
