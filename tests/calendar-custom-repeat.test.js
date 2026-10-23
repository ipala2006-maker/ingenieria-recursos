const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const rules=require('../shared/timetable');
const schedule=(extra={})=>({id:'custom-1',title:'Repasar',days:[1,2,3,4,5,6,0],start:'08:00',end:'09:00',color:'teal',startDate:'2026-10-23',recurrence:{unit:'days',interval:13},...extra});
const dates=(entry,from,until)=>rules.occurrences([entry],from,until).map(item=>item.date);

for(const file of ['scripts/dashboard.js','scripts/bandeja.js','scripts/desktop-widgets.js']){
  test(file+' rejects nonexistent dates instead of rolling into a different month',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const start=source.indexOf('  function parseDateValue('),end=source.indexOf('\n  function ',start+1);
    const context={};vm.runInNewContext(source.slice(start,end),context);
    for(const invalid of ['2026-02-29','2026-04-31','2026-06-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','2026-1-01','2026-01-01x','2026-01-01T10:00:00','1900-02-29','2100-02-29',{},null]){
      assert.equal(context.parseDateValue(invalid),null,JSON.stringify(invalid));
      assert.equal(rules.date(invalid),null,JSON.stringify(invalid));
    }
    for(const value of ['2026-04-30','2028-02-29','2000-02-29','2026-12-31']){
      assert.equal(rules.dateKey(context.parseDateValue(value)),value);
      assert.ok(rules.date(value));
    }
  });
}

test('every 13 days crosses months without expanding or changing its saved schedule',()=>{
  const entry=schedule(),before=JSON.stringify(entry);
  assert.deepEqual(dates(entry,'2026-10-23','2026-12-15'),['2026-10-23','2026-11-05','2026-11-18','2026-12-01','2026-12-14']);
  assert.deepEqual(dates(entry,'2026-11-01','2026-11-30'),['2026-11-05','2026-11-18']);
  assert.equal(JSON.stringify(entry),before);assert.equal(rules.describe(entry),'Cada 13 días');
  const occurrence=rules.occurrences([entry],'2026-11-05')[0];
  assert.equal(occurrence.type,'Cada 13 días');assert.equal(occurrence.scheduleId,entry.id);assert.equal(occurrence.color,'teal');
  assert.equal(occurrence.alarm,undefined);
});

test('custom recurrence requires a real anchor and a bounded integer interval',()=>{
  for(const interval of [0,-1,1.5,1000,Infinity,'13',NaN])assert.equal(rules.normalize(schedule({recurrence:{unit:'days',interval}})),null);
  for(const extra of [{startDate:''},{startDate:'2026-02-30'},{endDate:'2026-13-01'},{endDate:'2026-10-01'},{recurrence:{unit:'hours',interval:13}},{recurrence:true}])assert.equal(rules.normalize(schedule(extra)),null);
  assert.ok(rules.normalize(schedule({recurrence:{unit:'days',interval:999}})));
  assert.equal(rules.describe(schedule({recurrence:{unit:'days',interval:1}})),'Cada día');
  assert.deepEqual(dates(schedule({endDate:'2026-11-05'}),'2026-10-01','2026-11-30'),['2026-10-23','2026-11-05']);
});

test('every two weeks keeps selected weekdays and Monday-aligned weeks',()=>{
  const entry=schedule({days:[1,3,5],recurrence:{unit:'weeks',interval:2}});
  assert.deepEqual(dates(entry,'2026-10-19','2026-11-22'),['2026-10-23','2026-11-02','2026-11-04','2026-11-06','2026-11-16','2026-11-18','2026-11-20']);
  assert.equal(rules.normalize(schedule({days:[],recurrence:{unit:'weeks',interval:2}})),null);
});

test('monthly day 31 and yearly leap day skip nonexistent dates instead of inventing replacements',()=>{
  const monthly=schedule({startDate:'2026-01-31',recurrence:{unit:'months',interval:1}});
  assert.deepEqual(dates(monthly,'2026-01-01','2026-03-03'),['2026-01-31']);
  assert.deepEqual(dates(monthly,'2026-03-01','2026-04-30'),['2026-03-31']);
  assert.deepEqual(dates({...monthly,recurrence:{unit:'months',interval:2}},'2026-02-01','2026-04-01'),['2026-03-31']);
  const yearly=schedule({startDate:'2028-02-29',recurrence:{unit:'years',interval:1}});
  assert.deepEqual(dates(yearly,'2028-02-01','2028-03-01'),['2028-02-29']);
  assert.deepEqual(dates(yearly,'2029-02-01','2029-03-01'),[]);
  assert.deepEqual(dates(yearly,'2032-02-01','2032-03-01'),['2032-02-29']);
});

test('day intervals use calendar days through daylight-saving changes',()=>{
  const previous=process.env.TZ;process.env.TZ='America/New_York';
  try{
    assert.deepEqual(dates(schedule({startDate:'2026-03-01'}),'2026-03-01','2026-03-31'),['2026-03-01','2026-03-14','2026-03-27']);
    assert.deepEqual(dates(schedule({startDate:'2026-10-23'}),'2026-10-23','2026-11-30'),['2026-10-23','2026-11-05','2026-11-18']);
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('overlap hints respect actual custom dates instead of every weekday',()=>{
  const a=schedule();
  assert.deepEqual(rules.overlaps([a],schedule({id:'different',startDate:'2026-10-24'})),[]);
  assert.equal(rules.overlaps([a],schedule({id:'same',startDate:'2026-10-23'})).length,1);
});
