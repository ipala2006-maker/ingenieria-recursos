const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const goals=require('../shared/study-goal');
const root=path.resolve(__dirname,'..');
const today='2026-10-10';

test('goal is optional until selected, validated and completed at exactly its threshold',()=>{
  assert.equal(goals.read({}).configured,false);
  const state={days:{[today]:14}};goals.set(state,15,today,100);
  assert.equal(goals.summary(state,new Date(today+'T12:00:00')).todayActive,false);
  state.days[today]=15;assert.equal(goals.summary(state,new Date(today+'T12:00:00')).currentStreak,1);
  for(const n of [0,-1,721,15.5,'15',NaN])assert.throws(()=>goals.set(state,n,today));
  assert.throws(()=>goals.set(state,15,'2026-02-30'));
  assert.throws(()=>goals.set(state,15,today,NaN));
  assert.equal(goals.read({goal:{minutes:15,updatedAt:0}}).configured,false);
});

test('changing goals retains earned history and merges independently from progress timestamps',()=>{
  const state={days:{'2026-10-08':25,'2026-10-09':15,[today]:20},dailyGoals:{'2026-10-09':{minutes:15,updatedAt:1}}};
  goals.set(state,45,today,10);
  assert.equal(goals.summary(state,new Date(today+'T12:00:00')).currentStreak,2);
  const merged=goals.merge(state,{goal:{minutes:60,updatedAt:9},dailyGoals:{'2026-10-09':{minutes:25,updatedAt:0}}});
  assert.equal(merged.goal.minutes,45);assert.equal(merged.dailyGoals['2026-10-09'].minutes,15);
  state.days[today]=45;assert.equal(goals.summary(state,new Date(today+'T12:00:00')).currentStreak,3);
  assert.equal(goals.merge(state,{}).goal.minutes,45);
});

test('service-worker widget uses the same personal goal, not a fixed 25-minute rule',()=>{
  const context={URL,importScripts(){},EstudiemosStudyGoal:goals,self:{registration:{scope:'https://estudiemos-app.vercel.app/'},addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),context);
  const date=goals.dateKey(new Date()),state={days:{[date]:14},goal:{minutes:15,updatedAt:1}};
  assert.match(context.buildStreakWidgetData(state).todayProgress,/14\/15/);
  state.days[date]=15;
  assert.match(context.buildStreakWidgetData(state).todayProgress,/Completaste/);
  assert.match(context.buildStreakWidgetData(state).streakDays,/^1 /);
});

test('SQL projection is owner-filtered, server-only, bounded and matches custom streaks',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create table user_states(user_id uuid primary key,state jsonb);');
    const sql=fs.readFileSync(path.join(root,'supabase/study-goals.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    const date=(await db.query("select (now() at time zone 'UTC')::date::text as day")).rows[0].day;
    const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
    const state={days:{[date]:14},goal:{minutes:15,updatedAt:100}};
    await db.query('insert into user_states values($1,$2)',[id,{values:{estudiemos_pomodoro_streak:JSON.stringify(state),bandeja_agenda:[{title:'PRIVATE'}]}}]);
    await db.exec('set role service_role');
    const result=(await db.query('select get_windows_study_goal($1,$2) as data',[id,date])).rows[0].data;
    assert.deepEqual(result,{date,minutes:14,goalMinutes:15,configured:true});
    assert.equal((await db.query('select get_windows_study_goal($1,$2) as data',[other,date])).rows[0].data,null);
    assert.equal((await db.query('select get_windows_study_goal($1,$2) as data',[id,'2020-01-01'])).rows[0].data,null);
    await assert.rejects(db.query('select * from user_states'),/permission denied/);
    await db.exec('reset role;set role authenticated');
    await assert.rejects(db.query('select get_windows_study_goal($1,$2)',[id,date]),/permission denied/);
    await db.exec('reset role');
    state.days[date]=15;
    await db.query('update user_states set state=$2 where user_id=$1',[id,{values:{estudiemos_pomodoro_streak:state}}]);
    assert.equal((await db.query('select friend_streak($1,$2) as count',[id,'UTC'])).rows[0].count,1);
    state.goal.minutes='bad';
    await db.query('update user_states set state=$2 where user_id=$1',[id,{values:{estudiemos_pomodoro_streak:state}}]);
    assert.equal((await db.query('select get_windows_study_goal($1,$2) as data',[id,date])).rows[0].data.configured,false);
  } finally {await db.close();}
});

test('Windows reminders suppress completed, unknown, malformed and other-day goals without affecting Inbox', {skip:process.platform!=='win32'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-goal-test-'));
  try {
    const file=path.join(dir,'snapshot.json');
    for(const [study,expected] of [
      [{date:today,minutes:14,goalMinutes:15,configured:true},true],
      [{date:today,minutes:15,goalMinutes:15,configured:true},false],
      [{date:today,minutes:90,goalMinutes:45,configured:true},false],
      [{date:today,minutes:0,goalMinutes:15,configured:false},false],
      [{date:'2026-10-09',minutes:0,goalMinutes:15,configured:true},false],
      [null,false],[{date:today,minutes:'<script>',goalMinutes:15,configured:true},false]
    ]){
      fs.writeFileSync(file,JSON.stringify({study}));
      const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'windows-installer/StreakReminder.ps1'),'-DryRun','-InputPath',file,'-Now',today+'T14:30:00'],{encoding:'utf8',windowsHide:true});
      assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).wouldNotify,expected);
    }
    const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`. '${path.join(root,'windows-installer/StudyToast.ps1')}'; New-EstudiemosToastXml -Title 'A & B' -Body '<script>"Hello"</script>'`],{encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/A &amp; B/);assert.match(run.stdout,/&lt;script&gt;/);assert.doesNotMatch(run.stdout,/<script>/);
  }finally{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});}
});
