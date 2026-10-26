const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const rules=require('../shared/windows-alarm-snapshot'),root=path.resolve(__dirname,'..');
const owner='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002';
const alarm={date:'2026-11-02',time:'08:00',repeat:'weekly',windows:true};
const source=fs.readFileSync(path.join(root,'scripts/windows-local-alarms.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('local projection is bounded and contains only alarms and the current daily goal',()=>{
 const value=rules.create(owner,device,[{id:'a',title:'Parcial',alarm,secret:'never'},{id:'done',done:true,alarm},{id:'plain',title:'Private note'}],{days:{'2026-11-02':35,'2026-11-01':90},goal:{minutes:30,updatedAt:1}},new Date('2026-11-02T10:00:00'));
 assert.equal(value.items.length,1);assert.equal(value.study.minutes,35);assert.equal(value.study.goalMinutes,30);assert.equal(value.study.configured,true);
 assert.doesNotMatch(JSON.stringify(value),/secret|Private note|2026-11-01/);assert.equal(rules.validate(value,owner),value);
 assert.throws(()=>rules.validate(value,device));assert.throws(()=>rules.create(owner,device,Array.from({length:501},(_,i)=>({id:i,alarm}))));
});
function harness(){
 let user=owner,savedRecord=null,permission='granted',writes=0,file=rules.create(owner,device,[]),blockedClose;
 const listeners=new Map(),storage=new Map([['bandeja_agenda',JSON.stringify([{id:'a',title:'Parcial',alarm}])]]),timers=new Map();let timer=0;
 const handle={getFile:async()=>({name:'Alarmas.estudiemos-local',size:100,text:async()=>JSON.stringify(file)}),queryPermission:async()=>permission,requestPermission:async()=>permission,createWritable:async()=>{let text;return{write:async value=>{text=value;},close:async()=>{if(blockedClose)await blockedClose;file=JSON.parse(text);writes++;},abort:async()=>{}};}};
 const database={transaction(_store,mode){const tx={objectStore(){return{get(){const request={};queueMicrotask(()=>{request.result=savedRecord;request.onsuccess();tx.oncomplete();});return request;},put(value){const request={};queueMicrotask(()=>{savedRecord=value;request.onsuccess();tx.oncomplete();});return request;}};}};return tx;}};
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result=database;request.onsuccess();});return request;}};
 const window={indexedDB,EstudiemosWindowsAlarmSnapshot:rules,EstudiemosAccount:{getUser:()=>user?{id:user}:null,isSynchronized:()=>true,whenReady:()=>Promise.resolve()},showOpenFilePicker:async()=>[handle],addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);}};
 vm.runInNewContext(source,{window,indexedDB,JSON,Date,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),fetch:()=>assert.fail('Local bridge must never fetch'),setInterval:()=>assert.fail('Local bridge must never poll')});
 return {api:window.EstudiemosWindowsLocalAlarms,window,storage,holdClose(){let release;blockedClose=new Promise(resolve=>release=resolve);return release;},get writes(){return writes;},get file(){return file;},set permission(v){permission=v;},async changeUser(v){user=v;window.dispatchEvent({type:'estudiemos:account-change'});await tick();await tick();},async flush(){for(const fn of timers.values()){timers.clear();await fn();}await tick();}};
}
test('one explicit local-file grant enables writes, unchanged data is skipped, and revoked permission never reports ready',async()=>{
 const h=harness();await tick();assert.equal(h.api.ready(),false);await h.api.connectFile();assert.equal(h.api.ready(),true);assert.equal(h.file.items.length,1);
 const writes=h.writes;await h.api.sync();assert.equal(h.writes,writes);h.storage.set('bandeja_agenda','[]');await h.api.sync();assert.equal(h.file.items.length,0);
 h.permission='prompt';await h.api.sync();assert.equal(h.api.ready(),false);h.permission='granted';await h.api.sync();assert.equal(h.api.ready(),true);
 await h.changeUser('');assert.equal(h.api.ready(),false);assert.equal(h.file.disabled,true);assert.deepEqual(h.file.items,[]);
});
test('foreign accounts and cancelled pickers do not write or claim a connection',async()=>{
 const h=harness();await tick();await h.changeUser(device);await assert.rejects(h.api.connectFile(),/archivo local/);assert.equal(h.writes,0);assert.equal(h.api.ready(),false);
 h.window.showOpenFilePicker=async()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});};await assert.rejects(h.api.connectFile(),{name:'AbortError'});assert.equal(h.writes,0);
});
test('logout cannot be undone by an older file close finishing late',async()=>{
 const h=harness();await tick();await h.api.connectFile();const release=h.holdClose();h.storage.set('bandeja_agenda',JSON.stringify([{id:'late',title:'Old account',alarm}]));
 const old=h.api.sync();await tick();await h.changeUser('');release();await old;await tick();await tick();assert.equal(h.api.ready(),false);assert.equal(h.file.disabled,true);assert.deepEqual(h.file.items,[]);
});
test('native local schedule supports edits, completion, deletion and wrong-account rejection without network or real tasks',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-local-alarm-')),file=path.join(dir,'Alarmas.estudiemos-local');
 const snapshot=rules.create(owner,device,[{id:'a',title:'Parcial',alarm}],{},new Date('2026-11-02T07:00:00'));
 fs.writeFileSync(path.join(dir,'local-config.json'),JSON.stringify({path:file,owner,deviceId:device}));
 const run=()=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"function Invoke-RestMethod {throw 'Network forbidden'}; function Invoke-WebRequest {throw 'Network forbidden'}; & $env:LOCAL_ALARM_SCRIPT -StateDirectory $env:LOCAL_ALARM_DIR -Now '2026-11-02T08:00:00' -DryRun"],{encoding:'utf8',windowsHide:true,env:{...process.env,LOCAL_ALARM_SCRIPT:path.join(root,'windows-installer/InboxAlarm.ps1'),LOCAL_ALARM_DIR:dir}});
 try{
  fs.writeFileSync(file,JSON.stringify(snapshot));let result=run();assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout)[0].title,'Parcial');
  snapshot.items[0].title='Nuevo titulo';fs.writeFileSync(file,JSON.stringify(snapshot));assert.equal(JSON.parse(run().stdout)[0].title,'Nuevo titulo');
  snapshot.items[0].done=true;fs.writeFileSync(file,JSON.stringify(snapshot));assert.deepEqual(JSON.parse(run().stdout),[]);
  snapshot.items=[];fs.writeFileSync(file,JSON.stringify(snapshot));assert.deepEqual(JSON.parse(run().stdout),[]);
  snapshot.owner=device;fs.writeFileSync(file,JSON.stringify(snapshot));assert.notEqual(run().status,0);assert.equal(fs.existsSync(path.join(dir,'delivered.json')),false);
  for(const name of ['InboxAlarm.ps1','StreakReminder.ps1','ReadLocalAlarms.ps1'])assert.doesNotMatch(fs.readFileSync(path.join(root,'windows-installer',name),'utf8'),/Invoke-RestMethod|Invoke-WebRequest|WebClient|feed\.dpapi/);
 }finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});

test('newer visible-widget snapshots update alarms locally but never cross accounts or override logout',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-local-widget-')),file=path.join(dir,'Alarmas.estudiemos-local');
 for(const name of['InboxAlarm.ps1','ReadLocalAlarms.ps1'])fs.copyFileSync(path.join(root,'windows-installer',name),path.join(dir,name));
 const value=rules.create(owner,device,[{id:'a',title:'App',alarm}],{},new Date('2026-11-02T07:00:00'));
 fs.writeFileSync(file,JSON.stringify(value));fs.utimesSync(file,new Date('2026-01-01'),new Date('2026-01-01'));
 fs.writeFileSync(path.join(dir,'local-config.json'),JSON.stringify({path:file,owner,deviceId:device}));fs.writeFileSync(path.join(dir,'InboxAlarmConfig.json'),JSON.stringify({resourceDirectory:dir}));
 const write=who=>fs.writeFileSync(path.join(dir,'InboxAlarms.inc'),'[Alarms]\nCount=1\nChunk0='+Buffer.from(JSON.stringify({version:1,owner:who,items:[{id:'a',title:'Widget',alarm}]})).toString('base64')+'\n');
 const run=()=>{const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(dir,'InboxAlarm.ps1'),'-StateDirectory',dir,'-Now','2026-11-02T08:00:00','-DryRun'],{windowsHide:true,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
 try{write(owner);assert.equal(run()[0].title,'Widget');write(device);assert.equal(run()[0].title,'App');value.disabled=true;fs.writeFileSync(file,JSON.stringify(value));write(owner);assert.deepEqual(run(),[]);}
 finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
