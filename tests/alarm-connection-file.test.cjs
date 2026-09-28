const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('native window interop compiles without opening a window', {skip:process.platform!=='win32'},()=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',String.raw`
    $ErrorActionPreference='Stop'
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($env:ALARM_TEST_SCRIPT,[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Invalid script syntax'}
    $definitions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.StringConstantExpressionAst] -and $node.Value.StartsWith('using System;')},$true))
    if($definitions.Count -ne 1){throw 'Expected one native type definition'}
    Add-Type -TypeDefinition $definitions[0].Value
    if(!('Estudiemos.AlarmWindow' -as [type])){throw 'Interop type missing'}
    Write-Output 'native-interop-compiled'
  `],{windowsHide:true,encoding:'utf8',timeout:30000,env:{...process.env,ALARM_TEST_SCRIPT:path.join(root,'windows-installer/InboxAlarm.ps1')}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/native-interop-compiled/);
});

test('connection and background refresh encrypt/decrypt with a restricted module search path', {skip:process.platform!=='win32'},()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-alarm-dpapi-'));
  for(const name of ['ConnectInboxAlarms.ps1','InboxAlarm.ps1']){
    fs.copyFileSync(path.join(root,'windows-installer',name),path.join(directory,name));
  }
  fs.writeFileSync(path.join(directory,'InstallInboxAlarm.ps1'),"$true | Out-Null");
  const script=String.raw`
    $ErrorActionPreference='Stop'
    Import-Module Microsoft.PowerShell.Utility
    Import-Module Microsoft.PowerShell.Management
    $env:PSModulePath=$env:ALARM_TEST_DIR
    function Invoke-RestMethod { @{feedToken='dummy-test-only';snapshot=@{version=1;items=@()};confirmation='dummy-confirmation';version=1;items=@()} }
    function Start-Process { Write-Output 'callback-requested' }
    & (Join-Path $env:ALARM_TEST_DIR 'ConnectInboxAlarms.ps1') -Token 'pilot.signature'
    $state=Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'
    $encrypted=Get-Content -LiteralPath (Join-Path $state 'feed.dpapi') -Raw
    if($encrypted -match 'dummy-test-only'){throw 'Credential was not encrypted'}
    Remove-Module Microsoft.PowerShell.Security -ErrorAction SilentlyContinue
    & (Join-Path $env:ALARM_TEST_DIR 'InboxAlarm.ps1') -StateDirectory $state -DryRun
    $result=Get-Content -LiteralPath (Join-Path $state 'connection.json') -Raw | ConvertFrom-Json
    if($result.status -ne 'connected'){throw 'Background refresh failed'}
    Write-Output 'encrypted-background-refresh-ok'
  `;
  try{
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
      windowsHide:true,encoding:'utf8',timeout:30000,
      env:{...process.env,ALARM_TEST_DIR:directory,LOCALAPPDATA:directory}
    });
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/callback-requested/);
    assert.match(result.stdout,/encrypted-background-refresh-ok/);
    const state=path.join(directory,'Estudiemos','Windows','InboxAlarms');
    for(const name of ['activation-status.json','sync-status.json']){
      const diagnostic=JSON.parse(fs.readFileSync(path.join(state,name),'utf8').replace(/^\uFEFF/,''));
      assert.equal(diagnostic.status,'connected');
      assert.ok(Object.keys(diagnostic).every(key=>['status','stage','checkedAt'].includes(key)));
      assert.doesNotMatch(JSON.stringify(diagnostic),/dummy-test-only|dummy-confirmation|feedToken|title/);
    }
  }finally{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});

test('fullscreen diagnostics verify foreground visibility without task contents or credentials',()=>{
  const source=fs.readFileSync(path.join(root,'windows-installer/InboxAlarm.ps1'),'utf8');
  const shown=source.slice(source.indexOf('$presentationTimer ='),source.indexOf("$soundFile ="));
  assert.match(shown,/IsWindowVisible\(\$form.Handle\)/);
  assert.match(shown,/GetForegroundWindow\(\) -eq \$form.Handle/);
  assert.match(shown,/ShowWindow\(\$form.Handle, 9\)/);
  assert.match(shown,/foreground-unconfirmed/);
  assert.match(shown,/\$inputDesktop -eq 1 -and \$cloaked -eq 0/);
  assert.match(shown,/InputDesktopStatus\(\)/);
  assert.match(shown,/CloakedStatus\(\$form.Handle\)/);
  assert.doesNotMatch(shown,/AttachThreadInput|SendKeys|SystemParametersInfo/);
  assert.match(shown,/fullScreen=\$form\.Bounds\.Equals/);
  assert.match(shown,/topMost=\$form\.TopMost/);
  assert.doesNotMatch(shown,/title|feedToken|credential|DueItems|Exception\.Message/);
});

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
      [['estudiemos-alarms://connect/?link=invalid;command'],2,'invalid-link'],
      [['estudiemos-alarms://connect?link=pilot.signature'],4,'missing-component'],
      [['estudiemos-alarms://connect/?link=pilot.signature'],4,'missing-component'],
      [['ESTUDIEMOS-ALARMS://CONNECT/?link=pilot.signature'],4,'missing-component'],
      [['estudiemos-alarms://connect/?link=pilot.signature&extra=1'],2,'invalid-link'],
      [['estudiemos-alarms://connect/other?link=pilot.signature'],3,'unsupported-action'],
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
