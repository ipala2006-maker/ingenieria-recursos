const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = file => fs.readFileSync(require.resolve(file),'utf8');
const part = (text, start, end) => text.slice(text.indexOf(start),text.indexOf(end));
const user = { user: { id:'test-user' } };
const network = () => { throw new TypeError('Private upstream error'); };

test('notifications never ask the browser to navigate an existing app window', async () => {
  const destination = 'https://fixture.test/?agenda=1';
  const messages=[];
  const editor = {url:'https://fixture.test/',focus:async()=>editor,postMessage:data=>messages.push(data),navigate:()=>assert.fail('Unsaved editor was replaced')};
  const target = {url:destination,focus:async()=>target,navigate:()=>assert.fail('The target does not need to reload')};
  let windows = [editor], opened = 0;
  const ctx = {URL,self:{registration:{scope:editor.url},clients:{matchAll:async()=>windows,openWindow:async url=>{assert.equal(url,destination);opened++;return {url};}}}};
  const sw = source('../service-worker.js');
  vm.runInNewContext(sw.slice(sw.indexOf('async function openAppWindow(')),ctx);
  assert.equal(await ctx.openAppWindow(destination),editor);
  assert.equal(opened,0);
  assert.equal(messages[0].tool,'agenda');
  windows = [editor,target];
  assert.equal(await ctx.openAppWindow(destination),target);
  assert.equal(messages.length,1);
  target.focus=async()=>{throw new Error('Window closed');};
  assert.equal(await ctx.openAppWindow(destination),editor);
  windows = [target];
  assert.equal(await ctx.openAppWindow(destination),undefined,'a window which still exists is not replaced');
  assert.equal(opened,0);
  windows = [];
  assert.equal((await ctx.openAppWindow(destination)).url,destination);
  assert.equal(opened,1);
  const manifest = JSON.parse(source('../site.webmanifest'));
  assert.equal(manifest.launch_handler.client_mode,'navigate-new');
});

test('a notification cannot dismiss an active editor or invoke an unknown tool', () => {
  const controller={}, data={type:'ESTUDIEMOS_OPEN_TOOL',tool:'agenda'};
  let openEditor=true, activeField=false, agenda=0, pomodoro=0;
  const ctx={workspaceHome:true,navigator:{serviceWorker:{controller,addEventListener(){}}},
    openAgenda:()=>agenda++,document:{body:{classList:{contains:()=>false}},
      activeElement:{closest:()=>activeField},
      querySelector:selector=>selector==='[data-pomodoro-open]'?{click:()=>pomodoro++}:
        selector==='.agenda-board'||openEditor}};
  const js=source('../scripts/dashboard.js');
  vm.runInNewContext(part(js,'  function openToolFromNotification(','  function renderDashboard('),ctx);
  ctx.openToolFromNotification({source:controller,data});
  openEditor=false; activeField=true;
  ctx.openToolFromNotification({source:controller,data});
  assert.equal(agenda,0);
  activeField=false;
  ctx.openToolFromNotification({source:{},data});
  ctx.openToolFromNotification({source:controller,data:{...data,tool:'settings'}});
  assert.equal(agenda,0);
  ctx.openToolFromNotification({source:controller,data});
  ctx.openToolFromNotification({source:controller,data:{...data,tool:'pomodoro'}});
  assert.equal(agenda,1);
  assert.equal(pomodoro,1);
});

function authHarness() {
  const statuses = [], busy = [], storage = new Map();
  let clear = 0, captcha = 0;
  const context = {
    authActionInFlight:false, session:null, client:{auth:{}}, URL, location:{href:'https://fixture.test/'},
    window:{}, AUTH_ONLY:false, COMMERCIAL_LAUNCH_ENABLED:false,
    LINKED_USER_KEY:'owner', DIRTY_KEY:'dirty', localStorage:{getItem:key=>storage.get(key)},
    getRootPath:()=> './', getCredentials:()=>({email:'user@example.test',password:'fixture-only'}),
    getCaptchaOptions:()=>({captchaToken:'fixture'}), resetCaptcha:()=>{captcha++;},
    setBusy:value=>busy.push(value), setStatus:(message,type)=>statuses.push({message,type}),
    authErrorMessage:()=> 'Auth error', renderAccountState(){}, prepareLocalAccountSwitch(){},
    startCloudPolling(){}, connectRealtime(){}, disconnectRealtime(){}, clearLocalAccountData(){clear++;},
    synchronize:async()=>false, referralStatusLoaded:false
  };
  const account = source('../scripts/account.js');
  vm.runInNewContext(part(account,'  async function signIn()','  function captureReferralFromUrl()') +
    part(account,'  async function signOut()','  async function synchronize('),context);
  return {context,statuses,busy,storage,cleared:()=>clear,captchaResets:()=>captcha};
}

test('thrown Auth errors release controls and do not expose upstream errors', async () => {
  const h = authHarness();
  Object.assign(h.context.client.auth,{signInWithPassword:network,signUp:network,signOut:network});
  for (const operation of ['signIn','signUp','signOut']) {
    await h.context[operation]();
    assert.equal(h.busy.at(-1),false);
    assert.equal(h.context.authActionInFlight,false);
    assert.equal(h.statuses.at(-1).type,'error');
    assert.match(h.statuses.at(-1).message,/conexión/);
    assert.doesNotMatch(h.statuses.at(-1).message,/Private upstream error/);
  }
  assert.equal(h.cleared(),0);
  assert.equal(h.captchaResets(),2);
});

test('repeat submissions do not duplicate sign-in, and failed sync is not reported as saved', async () => {
  const h = authHarness();
  let finish, calls = 0;
  h.context.client.auth.signInWithPassword = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const initial = h.context.signIn();
  await h.context.signIn();
  assert.equal(calls,1);
  finish({data:{session:user}});
  await initial;
  assert.equal(h.context.session,user);
  assert.equal(h.statuses.at(-1).type,'info');
  assert.match(h.statuses.at(-1).message,/sincronización está pendiente/);
  assert.equal(h.busy.at(-1),false);
});

test('sign-out waits for pending local edits instead of clearing them after a sync failure', async () => {
  const h = authHarness();
  let signedOut = 0;
  h.context.session = user;
  h.context.client.auth.signOut = async () => { signedOut++; return {}; };
  h.storage.set('dirty','true');
  await h.context.signOut();
  assert.equal(h.context.session,user);
  assert.equal(signedOut,0);
  assert.equal(h.cleared(),0);
  assert.match(h.statuses.at(-1).message,/cambios pendientes/);
  h.context.synchronize = async () => { h.storage.set('dirty','false'); return true; };
  await h.context.signOut();
  assert.equal(h.context.session,null);
  assert.equal(signedOut,1);
  assert.equal(h.cleared(),1);
});

test('quick notes keep the draft when the account snapshot is not ready or storage is full', () => {
  const status = {textContent:''}, submit = {}, title = {value:'Private fixture'};
  let allowed = false, stored = 0, closed = 0;
  const form = {dataset:{},elements:{title},querySelector:key=>key==='[type="submit"]'?submit:status,reset(){title.value='';}};
  const context = {
    window:{EstudiemosAccount:{canSaveLocalNotes:()=>allowed}}, readAgenda:()=>[], randomId:()=> 'test',
    writeAgenda:()=>{stored++; if(stored===1)throw Error('Storage quota');},
    closeActivePanel:()=>{closed++;}, MAX_AGENDA_ITEMS:500
  };
  vm.runInNewContext(part(source('../scripts/dashboard.js'),'  function saveQuickNote(','  async function routeGeneralAssistant('),context);
  const save = () => context.saveQuickNote({currentTarget:form,preventDefault(){}});
  save();
  assert.equal(stored,0);
  assert.match(status.textContent,/todavía no se sincronizó/);
  allowed = true;
  save();
  assert.equal(title.value,'Private fixture');
  assert.equal(closed,0);
  assert.match(status.textContent,/borrador sigue acá/);
  save();
  assert.equal(title.value,'');
  assert.equal(closed,1);
});

test('Web Audio waits for a user gesture and can unlock again after a suspension', async () => {
  let created = 0, resumed = 0;
  class AudioContext {
    state = 'running';
    constructor() { created++; }
    async resume() { resumed++; this.state = 'running'; }
  }
  const activation = {hasBeenActive:false};
  const context = {navigator:{userActivation:activation},window:{AudioContext},audioContext:null,audioUnlockPromise:null};
  vm.runInNewContext(part(source('../scripts/pomodoro.js'),'  function prepareAudio(','  function primeAudioOutput('),context);
  assert.equal(await context.prepareAudio(),null);
  assert.equal(created,0);
  activation.hasBeenActive = true;
  const audio = await context.prepareAudio();
  audio.state = 'suspended';
  await context.prepareAudio();
  assert.equal(created,1);
  assert.equal(resumed,1);
  assert.equal(audio.state,'running');
});
