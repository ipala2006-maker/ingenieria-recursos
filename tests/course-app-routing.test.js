const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const links=require('../shared/course-app-links'),view=require('../shared/course-invite-view'),code='ABCDEFGHJK';

test('installed-app routes carry only a validated course, with a web landing fallback and no automatic download',()=>{
  const android=links.nativeUrl(code,'android');assert.match(android,/^intent:\/\/open\?materia=ABCDEFGHJK#Intent;scheme=estudiemos;package=com.estudiemos.app;/);
  const fallback=new URL(decodeURIComponent(android.match(/S.browser_fallback_url=([^;]+)/)[1]));
  assert.equal(fallback.pathname,'/materia/'+code);assert.equal(fallback.searchParams.get('abrir'),'web');
  assert.doesNotMatch(android,/\.apk|access_token|refresh_token/);
  assert.equal(links.nativeUrl(code,'windows'),'estudiemos-app://open?materia='+code);
  for(const value of ['BAD',code+'&command=cmd.exe',code+'\r\n'])assert.equal(links.nativeUrl(value,'windows'),'');
  assert.equal(links.nativeUrl(code,'android','javascript:alert(1)'), '');
});

test('the installed app is never launched recursively; web and unsupported platforms remain explicit',()=>{
  assert.equal(links.platform('Android'),'android');assert.equal(links.platform('Windows NT 10.0'),'windows');
  assert.equal(links.platform('Android',true),'');assert.equal(links.platform('Windows',true),'');
  assert.equal(links.platform('iPhone'),'ios');assert.equal(links.platform('Macintosh'),'');
  assert.equal(links.platform('Macintosh',false,true),'ios');assert.equal(links.platform('iPhone',true),'');
  assert.equal(links.nativeUrl(code,'ios'),'');
  const ios=view.content({title:'Física'},{code,joinUrl:'https://app.test/',platform:'ios'});
  assert.doesNotMatch(ios,/data-course-native|intent:|estudiemos-app:/);assert.match(ios,/En iPhone y iPad/);
  const native=view.content({title:'Física'},{code,joinUrl:'https://app.test/',nativeUrl:links.nativeUrl(code,'windows'),preferNative:true});
  assert.match(native,/data-course-native data-course-primary/);assert.match(native,/Unirme desde el navegador/);
  assert.ok(native.indexOf('data-course-native')<native.indexOf('data-course-join'));
  const web=view.content(null,{code,joinUrl:'https://app.test/',nativeUrl:links.nativeUrl(code,'android'),preferNative:false});
  assert.match(web,/data-course-join data-course-primary/);assert.ok(web.indexOf('data-course-join')<web.indexOf('data-course-native'));
});

test('Windows installer registers only its own app scheme and passes one quoted argument',()=>{
  const installer=fs.readFileSync(require.resolve('../windows-installer/Estudiemos-Windows.iss'),'utf8');
  assert.match(installer,/Software\\Classes\\estudiemos-app\\shell\\open\\command/);
  assert.match(installer,/ValueData: """\{sys\}\\wscript.exe"" ""\{app\}\\AppLauncher.vbs"" ""%1"""/);
  assert.doesNotMatch(installer,/Subkey: "Software\\Classes\\(?:https|http|web\+estudiemos)["\\]/);
});

test('real Windows Script Host validates deep links and opens an app-mode URL without forwarding input to a shell', {skip:process.platform!=='win32'},()=>{
  const source=fs.readFileSync(require.resolve('../windows-installer/AppLauncher.vbs'),'utf8');
  const fixture=source.replace('Set shell = CreateObject("WScript.Shell")','Set shell = New FakeShell').replace('Set files = CreateObject("Scripting.FileSystemObject")','Set files = New FakeFiles')+`
Class FakeShell
  Public Function ExpandEnvironmentStrings(value)
    ExpandEnvironmentStrings = "C:\\BrowserFixture"
  End Function
  Public Function Run(command, style, wait)
    WScript.Echo command
  End Function
End Class
Class FakeFiles
  Public Function FileExists(value)
    FileExists = InStr(value, "msedge.exe") > 0
  End Function
End Class
`;
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'estudiemos-app-link-')),file=path.join(folder,'launcher.vbs');
  fs.writeFileSync(file,fixture,'utf8');
  const run=(...args)=>spawnSync(path.join(process.env.SystemRoot,'System32/cscript.exe'),['//NoLogo',file,...args],{encoding:'utf8',windowsHide:true});
  try{
    for(const args of [[],['--setup'],[links.nativeUrl(code,'windows')],['estudiemos-app://open?materia=abcdefghjk']]){
      const result=run(...args);assert.equal(result.status,0,result.stderr);
      assert.match(result.stdout,/msedge\.exe" --app="https:\/\/estudiemos-app.vercel.app\/\?windows-bundle=1/);
      if(args[0]?.startsWith('estudiemos-app:'))assert.match(result.stdout,/&unirme=1&materia=ABCDEFGHJK/);
      assert.doesNotMatch(result.stdout,/--user-data-dir|--disable-web-security|cmd\.exe|powershell/);
    }
    for(const value of ['https://attacker.test/', 'estudiemos-app://other?materia='+code, 'estudiemos-app://open?materia='+code+'&materia=KLMNPQRSTU','estudiemos-app://open?materia='+code+'" & cmd.exe','estudiemos-app://open?materia=BAD']){
      const result=run(value);assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');
    }
    assert.equal(run(links.nativeUrl(code,'windows'),'extra').status,2);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
