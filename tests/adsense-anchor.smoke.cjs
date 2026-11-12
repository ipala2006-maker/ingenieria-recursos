const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const installMockTcf=require('./fixtures/ad-tcf.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/adsense-anchor');
const client='ca-pub-9605920128105982';
const policy=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).headers.find(x=>x.source==='/(.*)').headers.find(x=>x.key==='Content-Security-Policy').value;
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
  try{
    async function fixture({width=1440,height=900,pro=false,consent='granted',origin='https://estudiemos.ar',mode='filled',cmp=true}={}){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,isMobile:width<500,serviceWorkers:'block'}),page=await context.newPage();
      const errors=[],external=[];let loads=0;
      page.on('pageerror',error=>errors.push(error.message));
      if(cmp)await context.addInitScript(installMockTcf);
      await context.addInitScript(({pro,consent})=>{
        if(!localStorage.getItem('fixture-ad-state'))localStorage.setItem('fixture-ad-state',JSON.stringify({pro,consent,signedIn:true}));
        window.__state=JSON.parse(localStorage.getItem('fixture-ad-state'));
        window.__adUser=window.__state.signedIn?{id:'pilot',app_metadata:{estudiemos:window.__state.pro?{status:'active',planId:'pro'}:{status:'active',planId:'initial'}}}:null;
        localStorage.setItem('estudiemos_onboarding_v1','{"status":"completed"}');
        localStorage.setItem('estudiemos_home_layout','{"version":5,"preset":"custom","visible":{"focus":true,"progress":true,"workspace":false,"classes":false}}');
        localStorage.setItem('estudiemos_pomodoro_streak','{"days":{},"goal":{"minutes":25,"updatedAt":1}}');
        localStorage.setItem('fixture-saved-agenda','keep-this-note');
      },{pro,consent});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin){
          external.push(url.href);
          if(url.href==='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+client){
            loads++;
            if(mode==='error')return route.abort();
            return route.fulfill({contentType:'text/javascript',body:mode==='empty'?'window.__fakeSDK=true;':`window.__fakeSDK=true;document.body.style.paddingBottom='82px';const anchor=document.createElement('div');anchor.id='fake-google-anchor';anchor.textContent='SIMULACION / ANCLA INFERIOR';anchor.style.cssText='position:fixed;bottom:0;left:0;right:0;height:82px;z-index:2147483647;background:#e3edf8;color:#20334b;display:grid;place-items:center;font:12px system-ui';document.body.append(anchor);`});
          }
          return route.abort();
        }
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
        if(url.pathname==='/scripts/inmobi-choice-tag.js')return route.fulfill({contentType:'text/javascript',body:''});
        if(url.pathname==='/shared/release.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'shared/release.js'),'utf8').replace(/ads: (true|false)/,'ads: true')});
        if(url.pathname==='/scripts/account.js')return route.fulfill({contentType:'text/javascript',body:`window.EstudiemosAccount={getUser:()=>window.__adUser,getSession:()=>window.__adUser?{access_token:'fixture',user:window.__adUser}:null,getClient:()=>null,whenReady:async()=>({}),isSynchronized:()=>true,sync(){},refresh:async()=>{},open(){}};window.dispatchEvent(new Event('estudiemos:account-ready'));`});
        const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
        if(!file.startsWith(root+path.sep))return route.abort();
        try{return route.fulfill({headers:{'Content-Security-Policy':policy},contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}catch(_){return route.fulfill({status:404,body:''});}
      });
      await page.goto(origin,{waitUntil:'networkidle'});
      return {page,context,errors,external,loads:()=>loads};
    }
    for(const [width,height] of [[1440,900],[768,1024],[390,844],[320,640]]){
      const f=await fixture({width,height}),{page}=f;
      await page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='ready');
      const script=page.locator('script[data-estudiemos-adsense]');
      assert.equal(await script.getAttribute('data-overlays'),'collapsed-bottom');
      assert.equal(await script.evaluate(x=>x.async),true);assert.equal(await script.getAttribute('crossorigin'),'anonymous');
      assert.equal(await page.locator('.ad-banner').count(),0,'no publisher-created fixed ad unit');
      const anchor=await page.locator('#fake-google-anchor').boundingBox();
      await page.waitForFunction(()=>document.querySelector('.workspace-page').getBoundingClientRect().bottom<=innerHeight-81);
      const main=await page.locator('.workspace-page').boundingBox();assert.ok(main.y+main.height<=anchor.y+1);
      const nav=page.locator('[data-home-navigation]');if(await nav.isVisible()){const box=await nav.boundingBox();assert.ok(box.y+box.height<=anchor.y+1);}
      for(let i=0;i<4;i++)await page.evaluate(()=>window.dispatchEvent(new Event('estudiemos:account-change')));
      assert.equal(f.loads(),1);
      await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${width}-anchor.png`)});
      await page.locator('.topbar [data-quick-note-open]').click();
      const dialog=page.locator('[data-quick-panel=note]');await dialog.waitFor();
      assert.equal(await dialog.evaluate(x=>x.matches(':modal')),true);
      assert.equal(await dialog.evaluate(x=>x.contains(document.elementFromPoint(innerWidth/2,innerHeight-20))),true,'native dialog is above the simulated anchor');
      await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
      const next=page.waitForEvent('domcontentloaded');
      await page.evaluate(()=>{window.__state.pro=true;localStorage.setItem('fixture-ad-state',JSON.stringify(window.__state));window.__adUser.app_metadata.estudiemos={status:'active',planId:'pro'};window.dispatchEvent(new Event('estudiemos:account-change'));});
      await next;await page.waitForLoadState('networkidle');
      assert.equal(f.loads(),1,'Pro reload never imports Google a second time');assert.equal(await page.locator('#fake-google-anchor').count(),0);
      assert.equal(await page.evaluate(()=>document.body.style.paddingBottom),'');
      assert.equal(await page.evaluate(()=>localStorage.getItem('fixture-saved-agenda')),'keep-this-note');
      assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS official adapter, inset, native modal and clean Pro navigation: '+width);
    }
    for(const options of [{pro:true},{cmp:false},{consent:'unknown'},{consent:'denied'},{origin:'https://estudiemos.estudiemos-services.workers.dev'}]){
      const f=await fixture(options);assert.equal(f.loads(),0);assert.equal(await f.page.locator('body.ad-banner-managed').count(),0);assert.deepEqual(f.errors,[]);await f.context.close();
    }
    for(const change of ['consent','signout']){
      const f=await fixture();await f.page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='ready');
      const next=f.page.waitForEvent('domcontentloaded');
      await f.page.evaluate(change=>{if(change==='consent')window.__state.consent='denied';else{window.__state.signedIn=false;window.__adUser=null;}localStorage.setItem('fixture-ad-state',JSON.stringify(window.__state));if(change==='consent')window.__emitTcf('denied');else window.dispatchEvent(new Event('estudiemos:account-change'));},change);
      await next;await f.page.waitForLoadState('networkidle');assert.equal(f.loads(),1);assert.equal(await f.page.locator('#fake-google-anchor').count(),0);await f.context.close();
    }
    for(const mode of ['empty','error']){
      const f=await fixture({mode});await f.page.waitForFunction(()=>['ready','empty'].includes(window.EstudiemosAdBanner?.status()));
      assert.equal(await f.page.locator('#fake-google-anchor,.ad-banner').count(),0);assert.equal(await f.page.evaluate(()=>document.body.style.paddingBottom),'');
      assert.deepEqual(f.errors,[]);await f.context.close();
    }
    console.log('PASS Pro, missing/denied/revoked consent, signout, unsupported origin, empty SDK and failed SDK; all Google requests mocked, no impressions');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
