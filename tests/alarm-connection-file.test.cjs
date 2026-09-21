const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('connection files are data only, bounded and read literally', {skip:process.platform!=='win32'},()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-alarm-file-'));
  const file=path.join(directory,'connection [pilot].estudiemos-alarmas');
  const reader=path.join(root,'windows-installer/ReadAlarmConnection.ps1');
  function read(value,filename=file){
    fs.writeFileSync(filename,typeof value==='string'?value:JSON.stringify(value));
    return spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; . $env:ALARM_TEST_READER; $token=Read-AlarmConnectionToken -Path $env:ALARM_TEST_FILE; if($token -ne 'pilot.signature'){exit 2}; Write-Output 'valid'"],{
      windowsHide:true,encoding:'utf8',env:{...process.env,ALARM_TEST_READER:reader,ALARM_TEST_FILE:filename}
    });
  }
  try{
    const valid=read({version:1,token:'pilot.signature'});
    assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/valid/);
    for(const value of [null,[],{version:2,token:'pilot.signature'},{version:1,token:42},{version:1,token:'a;b'}, {version:1,token:'pilot.signature',url:'https://foreign.invalid'}, 'not json','x'.repeat(8193)]){
      assert.notEqual(read(value).status,0,'rejects invalid data');
    }
    assert.notEqual(read({version:1,token:'pilot.signature'},path.join(directory,'connection.ps1')).status,0,'rejects executable extensions');
    const source=fs.readFileSync(reader,'utf8');assert.doesNotMatch(source,/Invoke-Expression|Invoke-WebRequest|Invoke-RestMethod/);
  }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});

test('both installers register the data-file association with the installed helper',()=>{
  for(const name of ['Estudiemos-Alarms.iss','Estudiemos-Windows.iss']){
    const source=fs.readFileSync(path.join(root,'windows-installer',name),'utf8');
    assert.match(source,/ChangesAssociations=yes/);
    assert.match(source,/ReadAlarmConnection\.ps1/);
    assert.match(source,/Classes\\\.estudiemos-alarmas/);
    assert.match(source,/Estudiemos\.AlarmConnection\\shell\\open\\command/);
  }
});

test('launcher diagnoses rejected input without logging tokens or executing it', {skip:process.platform!=='win32'},()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-alarm-launch-'));
  const launcher=path.join(directory,'AlarmLauncher.vbs');
  const state=path.join(directory,'Estudiemos','Windows','InboxAlarms');
  fs.mkdirSync(path.dirname(state),{recursive:true});
  fs.copyFileSync(path.join(root,'windows-installer/AlarmLauncher.vbs'),launcher);
  try{
    for(const [args,code,stage] of [
      [[],1,'invalid-arguments'],
      [['estudiemos-alarms://connect?link=invalid;command'],2,'invalid-link'],
      [['estudiemos-alarms://unknown'],3,'unsupported-action'],
      [[path.join(directory,'pilot.estudiemos-alarmas')],4,'missing-component']
    ]){
      const result=spawnSync('cscript.exe',['//nologo',launcher,...args],{windowsHide:true,encoding:'utf8',env:{...process.env,LOCALAPPDATA:directory}});
      assert.equal(result.status,code,result.stderr);
      assert.ok(fs.existsSync(path.join(state,'launcher-status.json')),result.stdout+result.stderr);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(state,'launcher-status.json'),'utf8')),{stage,code});
    }
  }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});
