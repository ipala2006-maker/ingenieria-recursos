const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),owner='11111111-1111-4111-8111-111111111111';
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser;const pages=[],rows=new Map(),writes=[];
  rows.set(owner,{state:{values:{estudiemos_pomodoro_streak:JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}})},changedAt:{}},updated_at:new Date().toISOString()});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
      res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome'});
    for(const width of [1440,412]){
      const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
      await context.addInitScript(({owner})=>{
        window.__user={id:owner,email:'fixture@example.test'};
        localStorage.setItem('estudiemos_cloud_user',owner);
        const session=()=>window.__user?{user:window.__user,access_token:'fixture-only',refresh_token:'fixture-only',expires_at:9999999999}:null;
        window.__channels={};
        const client={
          auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange:cb=>{window.__authChange=cb;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{window.__user=null;window.__authChange('SIGNED_OUT',null);return {};}},
          from:table=>({select(){return this;},eq(_key,value){this.owner=value;return this;},maybeSingle:async function(){return {data:await fetch('/__fixture/state?owner='+encodeURIComponent(this.owner)).then(r=>r.json()),error:null};},
            upsert:async value=>{await fetch('/__fixture/state',{method:'POST',body:JSON.stringify(value)});return {};}}),
          channel:name=>{const c={on(_type,_filter,cb){window.__channels[name]=cb;return c;},subscribe(){return c;},send:async value=>{await fetch('/__fixture/broadcast',{method:'POST',body:JSON.stringify({name,...value})});}};return c;},
          removeChannel:async()=>{},rpc:async()=>({data:[],error:null})
        };
        window.supabase={createClient:()=>client};
      },{owner});
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.origin!==base)return route.abort();
        if(url.pathname==='/__fixture/state'){
          if(req.method()==='POST'){const row=JSON.parse(req.postData());rows.set(row.user_id,{state:row.state,updated_at:row.updated_at});writes.push(row);return route.fulfill({json:{}});}
          return route.fulfill({json:rows.get(url.searchParams.get('owner'))||null});
        }
        if(url.pathname==='/__fixture/broadcast'){
          const message=JSON.parse(req.postData());
          await route.fulfill({json:{}});
          for(const p of pages)if(!p.isClosed())await p.evaluate(m=>window.__channels?.[m.name]?.({payload:m.payload}),message).catch(error=>{if(!/context was destroyed|closed/.test(error.message))throw error;});
          return;
        }
        if(url.pathname.startsWith('/api/')){
          if(url.pathname==='/api/account-config'&&!url.search)return route.fulfill({json:{enabled:true,url:'https://fixture.supabase.co',publishableKey:'fixture-public'}});
          return route.fulfill({json:{enabled:false}});
        }
        return route.continue();
      });
      const page=await context.newPage();pages.push(page);page.on('pageerror',e=>{console.error('PAGE',e.message);});
      await page.goto(base);
      await page.waitForFunction(()=>window.EstudiemosStudy&&window.EstudiemosAccount?.isSynchronized());
    }
    const [pc,phone]=pages;
    await pc.evaluate(()=>{EstudiemosStudy.configure('study',27);EstudiemosStudy.configure('break',7);EstudiemosStudy.configure('blocks',5);EstudiemosStudy.toggle();});
    await phone.waitForFunction(()=>EstudiemosStudy.snapshot().running&&EstudiemosStudy.snapshot().config.study===27);
    const endPc=await pc.evaluate(()=>JSON.parse(localStorage.getItem('estudiemos_pomodoro_sync')).endAt);
    assert.equal(await phone.evaluate(()=>JSON.parse(localStorage.getItem('estudiemos_pomodoro_sync')).endAt),endPc);
    assert.ok(Math.abs((await pc.evaluate(()=>EstudiemosStudy.snapshot().remaining))-(await phone.evaluate(()=>EstudiemosStudy.snapshot().remaining)))<=1);
    const writesBefore=writes.length;await phone.waitForTimeout(1200);
    assert.ok(writes.length-writesBefore<4,'No per-second cloud publishing');
    await phone.evaluate(()=>EstudiemosStudy.toggle());
    await pc.waitForFunction(()=>!EstudiemosStudy.snapshot().running);
    await pc.evaluate(()=>EstudiemosStudy.skip());
    await phone.waitForFunction(()=>EstudiemosStudy.snapshot().phase==='break');
    await phone.evaluate(()=>{EstudiemosStudy.seek(180);EstudiemosStudy.toggle();});
    await pc.waitForFunction(()=>EstudiemosStudy.snapshot().running&&EstudiemosStudy.snapshot().phase==='break'&&EstudiemosStudy.snapshot().remaining<=180);
    await pc.evaluate(()=>{EstudiemosStudy.skip();EstudiemosStudy.alarm('volume',0.9);});
    await phone.waitForFunction(()=>EstudiemosStudy.snapshot().phase==='study'&&EstudiemosStudy.snapshot().block===2);
    assert.notEqual(await phone.evaluate(()=>EstudiemosStudy.snapshot().alarmVolume),0.9,'Sound volume stays local');
    await phone.reload();await phone.waitForFunction(()=>EstudiemosAccount?.isSynchronized()&&EstudiemosStudy?.snapshot().running&&EstudiemosStudy.snapshot().block===2);
    await phone.evaluate(()=>EstudiemosStudy.toggle());await pc.waitForFunction(()=>!EstudiemosStudy.snapshot().running);
    await phone.evaluate(()=>{
      const writer=localStorage.getItem('estudiemos_pomodoro_device');
      const old=JSON.parse(localStorage.getItem('estudiemos_pomodoro'));
      const endAt=Date.now()-5000;
      Object.assign(old,{running:true,endAt,phase:'study',studyCreditAt:endAt-3540000,pendingStudySeconds:0,pendingStudyDays:{},sharedUpdatedAt:1,sharedWriter:writer,updatedAt:1});
      localStorage.setItem('estudiemos_pomodoro',JSON.stringify(old));
      localStorage.setItem('estudiemos_pomodoro_sync',JSON.stringify({...old,writer,updatedAt:1}));
    });
    await phone.reload();
    await phone.waitForFunction(()=>EstudiemosAccount?.isSynchronized()&&EstudiemosStudy&&!EstudiemosStudy.snapshot().running);
    assert.ok((await phone.evaluate(()=>EstudiemosStudy.snapshot().todayMinutes))<1,'Stale expired cache cannot mint an hour before account hydration');
    await pc.evaluate(()=>EstudiemosStudy.toggle());await phone.waitForFunction(()=>EstudiemosStudy.snapshot().running);
    await pc.evaluate(()=>{window.__user={id:'22222222-2222-4222-8222-222222222222',email:'other@example.test'};window.__authChange('SIGNED_IN',{user:window.__user,access_token:'fixture-only'});});
    await pc.waitForFunction(()=>EstudiemosAccount?.isSynchronized()&&EstudiemosAccount.getUser().id.startsWith('2222'));
    assert.equal(await pc.evaluate(()=>EstudiemosStudy.snapshot().running),false,'Switching accounts clears private timer');
    assert.equal(await phone.evaluate(()=>EstudiemosStudy.snapshot().running),true,'Another account cannot pause the original user');
    await phone.evaluate(()=>EstudiemosAccount.getClient().auth.signOut());
    await phone.waitForFunction(()=>!EstudiemosAccount.getUser());
    assert.equal(await phone.evaluate(()=>EstudiemosStudy.snapshot().running),false,'Signout stops the private timer');
    console.log('PASS two isolated devices: start, pause, seek, skip, config, shared deadline, no tick publishing, local sound, reload and account isolation');
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
