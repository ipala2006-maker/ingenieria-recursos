const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/account.js'),'utf8');
const code=source.slice(source.indexOf('  async function updateApplication()'),source.indexOf('  function cleanUpdateMarker()'));
function fixture({legacy=false,broken=false}={}){
  const button={disabled:false},label={textContent:''},fallback={hidden:true},messages=[],statuses=[],listeners=new Map(),timers=new Map();let id=0;
  const c={document:{querySelector:selector=>selector==='[data-account-update]'?button:selector==='[data-account-update-label]'?label:fallback},setStatus:(...s)=>statuses.push(s)};
  c.window={EstudiemosAndroidUpdater:!legacy,EstudiemosAndroid:{postMessage:m=>{if(broken)throw Error('bridge unavailable');messages.push(JSON.parse(m));}},
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
    setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(c);vm.runInContext(code,c);
  return {c,button,label,fallback,messages,statuses,listeners,timers,
    emit:(state,percent=-1)=>listeners.get('estudiemos-android-update-status')?.({detail:{state,percent}}),
    timeout:()=>{const pending=[...timers.values()][0];assert.ok(pending);pending.fn();}};
}

test('Android update follows native progress and installer without navigating out of the app',async()=>{
  const f=fixture();await f.c.updateApplication();await f.c.updateApplication();
  assert.equal(f.messages.length,1,'Double tap cannot enqueue duplicate APKs');
  assert.equal(f.messages[0].type,'app-update');
  assert.equal(f.fallback.hidden,false);assert.equal(f.button.disabled,true);
  f.emit('permission');assert.match(f.statuses.at(-1)[0],/Permití/);
  assert.equal([...f.timers.values()][0].delay,120000);
  f.emit('downloading',42);assert.match(f.label.textContent,/42%/);
  f.emit('waiting');assert.match(f.statuses.at(-1)[0],/conexión/);
  f.emit('installer',100);assert.match(f.statuses.at(-1)[0],/Confirmá/);
  assert.equal(f.button.disabled,false);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});

test('Legacy acknowledgement cannot suppress recovery indefinitely or force a browser redirect',async()=>{
  const f=fixture({legacy:true});await f.c.updateApplication();
  f.listeners.get('estudiemos-android-update-started')();
  assert.equal([...f.timers.values()][0].delay,15000);
  f.timeout();assert.equal(f.button.disabled,false);
  assert.match(f.statuses.at(-1)[0],/descarga alternativa/);
  assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
  await f.c.updateApplication();assert.equal(f.messages.length,2);
});

test('Rejected permission, errors, silence and broken bridge all leave an explicit fallback and a usable retry',async()=>{
  for(const failure of ['denied','error','silence','bridge']){
    const f=fixture({broken:failure==='bridge'});await f.c.updateApplication();
    if(failure==='silence')f.timeout();else if(failure!=='bridge')f.emit(failure);
    assert.equal(f.fallback.hidden,false,failure);
    assert.equal(f.button.disabled,false,failure);
    assert.equal(f.listeners.size,0,failure);
    assert.equal(f.timers.size,0,failure);
    assert.match(f.statuses.at(-1)[0],/alternativa/);
  }
});

test('Unexpected native events do not inject messages or complete installation',async()=>{
  const f=fixture();await f.c.updateApplication();
  f.emit('<script>bad</script>',100);assert.equal(f.button.disabled,true);
  f.emit('downloading',900);assert.ok(!f.label.textContent.includes('900'));
  f.emit('error');assert.ok(!f.statuses.some(s=>s[0].includes('<script>')));
});

test('Native update recovers its own persisted download and checks success before opening Android installer',()=>{
  const native=fs.readFileSync(path.join(__dirname,'../android-app/app/src/main/java/com/estudiemos/app/MainActivity.java'),'utf8');
  assert.match(native,/getLong\("download_id", -1L\)/);
  assert.match(native,/putLong\("download_id", updateDownloadId\)/);
  assert.match(native,/new DownloadManager.Query\(\).setFilterById\(updateDownloadId\)/);
  assert.match(native,/status == DownloadManager.STATUS_SUCCESSFUL\) \{\s*openDownloadedUpdate/);
  assert.match(native,/status == DownloadManager.STATUS_FAILED/);
  assert.match(native,/if \(!updateVisible \|\| updateDownloadId <= 0\) return/);
  assert.match(native,/protected void onStop\(\) \{\s*updateVisible = false;\s*updateHandler.removeCallbacks/);
  assert.match(native,/notifyWebUpdateStatus\("denied", -1\)/);
  assert.ok(!native.includes('registerUpdateDownloadReceiver'),'No dependence on a potentially missed broadcast');
  assert.ok(!native.includes('getStringExtra("update_url")'),'Download source stays fixed to the official APK');
  const link=source.match(/<a[^>]+data-account-update-manual[^>]+>/)[0];
  assert.ok(link.includes('https://github.com/ipala2006-maker/ingenieria-recursos/releases/download/android-latest/Estudiemos-Android.apk'));
  assert.ok(link.includes('target="_self"'),'Uses the existing external-URL handler, not an unsupported WebView popup');
});
