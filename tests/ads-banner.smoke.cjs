const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/ads-banner');
(async()=>{
  let browser;const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end('{"enabled":false}');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
    async function fixture({width=1440,height=900,enabled=true,consent='granted',pro=false,mode='filled',pagePath='/',delayProvider=false}={}){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,isMobile:width<500,serviceWorkers:'block'}),page=await context.newPage();
      const requests=[],errors=[];let unblock;
      const hold=delayProvider?new Promise(resolve=>unblock=resolve):Promise.resolve();
      page.on('pageerror',error=>errors.push(error.message));
      await context.addInitScript(({consent,pro,teacher})=>{
        window.__adUser={id:'pilot',app_metadata:{estudiemos:pro?{status:'active',planId:'pro'}:{status:'active',planId:'initial'}}};
        window.__consent=consent;window.__mounts=0;window.__destroyed=0;
        window.EstudiemosAdConsent={getStatus:()=>window.__consent};
        localStorage.setItem('estudiemos_onboarding_v1',JSON.stringify({status:'completed'}));
        localStorage.setItem('estudiemos_home_layout',JSON.stringify({version:5,preset:'custom',visible:{focus:true,progress:true,workspace:false,classes:false}}));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        localStorage.setItem('estudiemos_course_role:pilot',teacher?'teacher':'student');
      },{consent,pro,teacher:pagePath==='/materias.html'});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());requests.push(url.pathname);
        if(url.origin!==base)return route.abort();
        if(url.pathname==='/shared/release.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'shared/release.js'),'utf8').replace(/ads: (true|false)/,'ads: '+enabled)});
        if(url.pathname==='/scripts/account.js')return route.fulfill({contentType:'text/javascript',body:`window.EstudiemosAccount={getUser:()=>window.__adUser,getSession:()=>window.__adUser?{access_token:'fixture',user:window.__adUser}:null,getClient:()=>null,whenReady:async()=>({}),isSynchronized:()=>true,sync(){},refresh:async()=>{},open(){}};window.dispatchEvent(new Event('estudiemos:account-ready'));`});
        if(url.pathname==='/scripts/ad-provider.js'){
          await hold;
          return route.fulfill({contentType:'text/javascript',body:`export const configured=true; export async function mount({slot,signal}){window.__mounts++;window.__adapterFields=Object.keys(arguments[0]);if(${JSON.stringify(mode)}==='empty')return null;if(${JSON.stringify(mode)}==='error')throw Error('fixture');const banner=document.createElement('div');banner.textContent='ESTUDIEMOS / BANNER DE PRUEBA';banner.style.cssText='height:100%;width:100%;display:grid;place-items:center;background:#e3edf8;color:#20334b;font:12px system-ui';slot.append(banner);const handle={destroy(){window.__destroyed++;banner.remove();}};if(${JSON.stringify(mode)}==='late')return new Promise(resolve=>window.__finishAd=()=>resolve(handle));signal.addEventListener('abort',()=>banner.remove(),{once:true});return handle;}`});
        }
        if(url.pathname==='/scripts/ad-banner.js'&&mode==='late')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'scripts/ad-banner.js'),'utf8').replace(',12000);',',150);')});
        return route.continue();
      });
      await page.goto(base+pagePath,{waitUntil:'networkidle'});
      return {context,page,requests,errors,unblock};
    }
    const disabled=await fixture({enabled:false});
    assert.equal(await disabled.page.locator('.ad-banner').count(),0);assert.ok(!disabled.requests.includes('/scripts/ad-provider.js'));assert.ok(!disabled.requests.includes('/styles/ad-banner.css'));
    await disabled.context.close();
    for(const [width,height]of [[1440,900],[1024,600],[768,1024],[390,844],[320,640]]){
      const f=await fixture({width,height}),{page}=f;await page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='visible');
      assert.deepEqual(await page.evaluate(()=>window.__adapterFields),['slot','signal']);
      const banner=page.locator('.ad-banner'),box=await banner.boundingBox(),main=await page.locator('.workspace-page').boundingBox();
      assert.ok(box.x>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
      assert.ok(main.y+main.height<=box.y+1,'workspace is resized above the banner');
      if(width>900)for(const tool of await page.locator('[data-home-space]:visible').all()){const r=await tool.boundingBox();assert.ok(r.y+r.height<=box.y+2,'desktop tools fit above ads');}
      const nav=page.locator('[data-home-navigation]');if(await nav.isVisible()){const r=await nav.boundingBox();assert.ok(r.y+r.height<=box.y+1,'mobile navigation is not covered');}
      for(let n=0;n<4;n++)await page.evaluate(()=>window.dispatchEvent(new Event('estudiemos:account-change')));
      assert.equal(await page.evaluate(()=>window.__mounts),1,'no refresh loop on account events');
      await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${width}-banner.png`)});
      await page.locator('.topbar [data-quick-note-open]').click();
      assert.equal(await banner.evaluate(node=>getComputedStyle(node).visibility),'hidden','modal hides the creative but keeps its reserved space');
      await page.locator('[data-quick-panel=note]').press('Escape');
      await page.evaluate(()=>{window.__adUser.app_metadata.estudiemos={status:'active',planId:'pro'};window.dispatchEvent(new Event('estudiemos:account-change'));});
      assert.equal(await banner.count(),0);assert.equal(await page.locator('body.ad-banner-active').count(),0);assert.equal(await page.evaluate(()=>window.__destroyed),1);
      assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS banner layout, modal, one mount and Pro removal: '+width);
    }
    for(const options of [{pro:true},{consent:'unknown'},{consent:'denied'}]){
      const f=await fixture(options);assert.equal(await f.page.locator('.ad-banner').count(),0);assert.ok(!f.requests.includes('/scripts/ad-provider.js'));await f.context.close();
    }
    for(const pagePath of ['/mi-espacio.html','/materias.html']){
      const f=await fixture({pagePath,width:390,height:844});await f.page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='visible');
      const banner=await f.page.locator('.ad-banner').boundingBox();
      if(pagePath==='/materias.html'){const main=await f.page.locator('#teacherWorkspace').boundingBox();assert.ok(main.y+main.height<=banner.y+1,'teacher content ends above ads');}
      else assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(f.errors,[]);await f.context.close();
    }
    const native=await fixture({consent:'unknown'});
    await native.page.evaluate(()=>{window.EstudiemosAndroid={};window.__consent='granted';window.dispatchEvent(new Event('estudiemos:ads-consent-change'));});
    assert.equal(await native.page.locator('.ad-banner').count(),0);assert.ok(!native.requests.includes('/scripts/ad-provider.js'));await native.context.close();
    const consent=await fixture({consent:'unknown'});
    await consent.page.evaluate(()=>{window.__consent='granted';window.dispatchEvent(new Event('estudiemos:ads-consent-change'));});
    await consent.page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='visible');
    await consent.page.evaluate(()=>{window.__consent='denied';window.dispatchEvent(new Event('estudiemos:ads-consent-change'));});
    assert.equal(await consent.page.locator('.ad-banner').count(),0);assert.equal(await consent.page.evaluate(()=>__destroyed),1);await consent.context.close();
    for(const mode of ['empty','error','late']){
      const f=await fixture({mode});await f.page.waitForFunction(()=>window.EstudiemosAdBanner?.status()==='empty');
      assert.equal(await f.page.locator('.ad-banner').count(),0);assert.equal(await f.page.locator('body.ad-banner-active').count(),0);
      if(mode==='late'){await f.page.evaluate(()=>window.__finishAd());await f.page.waitForFunction(()=>window.__destroyed===1);}
      assert.deepEqual(f.errors,[]);await f.context.close();
    }
    const race=await fixture({delayProvider:true,consent:'unknown'});
    const providerRequest=race.page.waitForRequest('**/scripts/ad-provider.js');
    await race.page.evaluate(()=>{window.__consent='granted';window.dispatchEvent(new Event('estudiemos:ads-consent-change'));});
    await providerRequest;
    await race.page.evaluate(()=>{window.__adUser=null;window.dispatchEvent(new Event('estudiemos:account-change'));});race.unblock();
    await race.page.waitForLoadState('networkidle');assert.equal(await race.page.locator('.ad-banner').count(),0);assert.equal(await race.page.evaluate(()=>__mounts),0);await race.context.close();
    console.log('PASS disabled, Pro, consent, no-fill, error, late result and sign-out during loading; no real ads or impressions');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
