const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/friends.js'),'utf8');

function harness(){
  const saved=new Map(),nodes=new Map(),calls=[];
  const q=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,focus(){calls.push('focus');}});return nodes.get(selector);};
  const context={installSuggested:true,busy:false,model:{},owner:'alice',user:'alice',navigator:{},window:{},root:new URL('https://estudiemos-app.vercel.app/'),URL,
    account:()=>({getUser:()=>context.user?{id:context.user}:null}),q,
    localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},
    document:{referrer:'',documentElement:{classList:{contains:()=>false}},querySelector:()=>context.installer},
    matchMedia:()=>({matches:false}),dialog:{close(){calls.push('close');}},location:{assign:url=>calls.push(url)}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function updateInstallSuggestion()'),source.indexOf('  const status=')),context);
  vm.runInContext(source.slice(source.indexOf("  q('[data-friend-install-later]').onclick="),source.indexOf("  window.addEventListener('appinstalled'")),context);
  return {context,q,saved,calls};
}
test('installation is offered only after a new successful invitation in a browser',()=>{
  const h=harness();h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,false);
  h.context.installSuggested=false;h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,true);
  h.context.installSuggested=true;h.context.user='';h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,true);
  for(const configure of [c=>c.document.documentElement.classList.contains=()=>true,c=>c.navigator.standalone=true,c=>c.window.EstudiemosAndroid={postMessage(){}},c=>c.document.referrer='android-app://com.estudiemos.app',c=>c.matchMedia=()=>({matches:true})]){
    const installed=harness();configure(installed.context);installed.context.updateInstallSuggestion();assert.equal(installed.q('[data-install-suggestion]').hidden,true);
  }
});
test('arriving from WhatsApp or another Android app is not proof that Estudiemos is installed',()=>{
  const install=fs.readFileSync(path.join(__dirname,'../scripts/install-app.js'),'utf8');
  for(const referrer of ['android-app://com.whatsapp','android-app://org.telegram.messenger','android-app://com.estudiemos.app.malicious']){
    const h=harness();h.context.document.referrer=referrer;h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,false);
    const context={isNativeAndroidApp:()=>false,window:{navigator:{},matchMedia:()=>({matches:false})},document:{referrer}};vm.createContext(context);
    vm.runInContext(install.slice(install.indexOf('  function isInstalledContext()'),install.indexOf('  function isIOS()')),context);
    assert.equal(context.isInstalledContext(),false);
    context.document.referrer='android-app://com.estudiemos.app/';assert.equal(context.isInstalledContext(),true);
  }
});
test('Ahora no is scoped to this account and device and never starts installation',()=>{
  const h=harness();h.context.updateInstallSuggestion();h.q('[data-friend-install-later]').onclick();
  assert.equal(h.q('[data-install-suggestion]').hidden,true);assert.deepEqual(h.calls,['focus']);
  assert.equal(h.saved.get('estudiemos_friend_install_v1:alice'),'dismissed');
  h.context.installSuggested=true;h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,true);
  h.context.user='bob';h.context.updateInstallSuggestion();assert.equal(h.q('[data-install-suggestion]').hidden,false);
  const otherDevice=harness();otherDevice.context.updateInstallSuggestion();assert.equal(otherDevice.q('[data-install-suggestion]').hidden,false);
});
test('only an explicit click reuses the platform installer, or opens the installation page',()=>{
  const h=harness();h.context.installer={disabled:false,click(){h.calls.push('install');}};
  h.context.updateInstallSuggestion();assert.deepEqual(h.calls,[]);h.q('[data-friend-install]').onclick();assert.deepEqual(h.calls,['close','install']);
  h.q('[data-friend-install]').onclick();assert.equal(h.calls.length,2,'hidden controls cannot start another download');
  const fallback=harness();fallback.context.updateInstallSuggestion();fallback.q('[data-friend-install]').onclick();
  assert.deepEqual(fallback.calls,['close','https://estudiemos-app.vercel.app/instalar.html']);
  for(const configure of [c=>c.busy=true,c=>c.model=null,c=>c.user='bob']){
    const rejected=harness();rejected.context.updateInstallSuggestion();configure(rejected.context);rejected.q('[data-friend-install]').onclick();assert.deepEqual(rejected.calls,[]);
  }
});
test('the existing installer routes Android explicitly and iPhone to its Safari guide',async()=>{
  const install=fs.readFileSync(path.join(__dirname,'../scripts/install-app.js'),'utf8');
  const content={},classes=new Set();
  const context={android:true,ios:false,ANDROID_OPEN_URL:'intent://open#Intent;scheme=estudiemos;end',location:{},navigator:{userAgent:'Android'},installPrompt:null,
    sheet:{hidden:true,setAttribute(){},querySelector:()=>content},document:{body:{classList:{add:val=>classes.add(val)}}},
    icon:()=>'',browserGuide:()=> 'Browser guide'};
  vm.createContext(context);
  vm.runInContext(install.slice(install.indexOf('  async function handleInstall()'),install.indexOf('  function closeGuide()')),context);
  vm.runInContext(install.slice(install.indexOf('  function iosGuide()'),install.indexOf('  function browserGuide()')),context);
  assert.equal(context.location.href,undefined);await context.handleInstall();assert.equal(context.location.href,context.ANDROID_OPEN_URL);assert.equal(context.sheet.hidden,true);
  context.android=false;context.ios=true;context.navigator.userAgent='iPhone';await context.handleInstall();
  assert.equal(context.sheet.hidden,false);assert.match(content.innerHTML,/Safari/);assert.match(content.innerHTML,/Agregar a pantalla de inicio/);assert.ok(classes.has('app-install-open'));
});
