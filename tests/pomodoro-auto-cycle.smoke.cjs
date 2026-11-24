const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicRoot=process.argv.includes('--built')?path.join(root,'dist-cloudflare'):root;
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};

(async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(publicRoot+path.sep)||!types[path.extname(file)])return res.writeHead(404).end();
    try{
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',types[path.extname(file)]);res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=process.env.TEST_LIVE==='1'?'https://estudiemos.ar':'http://127.0.0.1:'+server.address().port;
    const mobile=process.env.TEST_WEBKIT==='1';
    browser=mobile?await webkit.launch():await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'chrome'});
    const context=await browser.newContext({viewport:{width:mobile?390:1280,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});
      return route.continue();
    });
    await context.addInitScript(origin=>{
      if(location.origin!==origin)return;
      let offset=0;const now=Date.now();
      Date.now=()=>now+offset;window.advancePomodoroClock=ms=>{offset+=ms;};
      localStorage.setItem('estudiemos_onboarding_v1','{"status":"completed"}');
      if(!localStorage.getItem('estudiemos_pomodoro')){
        localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{study:1,break:1,blocks:4},phase:'study',currentBlock:1,remaining:60,running:false,autoStart:false,updatedAt:now}));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:3,days:{}}));
      }
    },origin);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const snapshot=()=>page.evaluate(()=>window.EstudiemosStudy.snapshot());
    const advance=ms=>page.evaluate(ms=>window.advancePomodoroClock(ms),ms);
    await page.goto(origin+'/');
    await page.locator('.topbar [data-pomodoro-open]').click();
    assert.equal((await snapshot()).autoStart,true,'old default false is upgraded to automatic');
    let surface=page,prefix='pomodoro';
    if(!mobile){
      await page.locator('[data-pomodoro-popout]').click();
      await page.waitForFunction(()=>documentPictureInPicture.window?.document.querySelector('[data-pip-toggle]'));
      surface=context.pages().find(candidate=>candidate!==page);prefix='pip';
      surface.on('pageerror',error=>errors.push(error.message));
      await surface.setViewportSize({width:320,height:360});
    }
    await surface.locator(`[data-${prefix}-toggle]`).click();
    assert.equal((await snapshot()).running,true);
    await advance(61000);
    await page.waitForFunction(()=>window.EstudiemosStudy.snapshot().phase==='break');
    const rest=await snapshot();
    assert.equal(rest.running,true);assert.equal(rest.remaining,60);assert.equal(rest.alarm,false);
    assert.equal(rest.todayMinutes,1,'only completed study is credited');
    assert.match(await surface.locator(`[data-${prefix}-toggle]`).textContent(),/Pausar/,'first click must pause, not dismiss an obsolete alarm');
    await advance(10000);
    await page.waitForFunction(()=>window.EstudiemosStudy.snapshot().remaining===50);
    await surface.waitForFunction(prefix=>document.querySelector(`[data-${prefix}-time]`)?.textContent==='00:50',prefix);
    assert.equal((await snapshot()).todayMinutes,1,'rest countdown never earns study credit');
    const output=path.join(root,'tmp/pomodoro-auto-cycle');fs.mkdirSync(output,{recursive:true});
    await surface.screenshot({path:path.join(output,mobile?'rest-webkit-mobile.png':'rest-desktop-mini.png')});
    await advance(51000);
    await page.waitForFunction(()=>window.EstudiemosStudy.snapshot().phase==='study');
    const study=await snapshot();
    assert.equal(study.running,true);assert.equal(study.block,2);assert.equal(study.remaining,60);
    assert.equal(study.alarm,false);assert.equal(study.todayMinutes,1);
    await surface.locator(`[data-${prefix}-toggle]`).click();
    assert.equal((await snapshot()).running,false,'one click pauses the next study');
    await advance(120000);
    assert.equal((await snapshot()).phase,'study');assert.equal((await snapshot()).block,2);
    await surface.locator(mobile?'[data-pomodoro-config-toggle]':'[data-pip-settings-toggle]').click();
    await surface.locator(`[data-${prefix}-auto]`).uncheck();
    assert.equal((await snapshot()).autoStart,false);
    if(!mobile)await surface.locator('[data-pip-settings-toggle]').click();
    else await surface.locator('[data-pomodoro-config-toggle]').click();
    await surface.locator(`[data-${prefix}-toggle]`).click();await advance(61000);
    await page.waitForFunction(()=>window.EstudiemosStudy.snapshot().phase==='break');
    assert.equal((await snapshot()).running,false,'explicit manual continuation is respected');
    assert.equal((await snapshot()).alarm,true,'manual mode keeps its completion alarm');
    if(!mobile)await surface.locator('[data-pip-close]').click();
    await page.reload();
    await page.waitForFunction(()=>window.EstudiemosStudy?.snapshot());
    assert.equal((await snapshot()).autoStart,false,'manual setting persists after reload');
    assert.deepEqual(errors,[]);
    console.log('PASS '+(mobile?'WebKit mobile':'desktop '+(process.env.TEST_BROWSER_CHANNEL||'chrome'))+': automatic study/rest/study, ticking rest, one-shot sound state, pause, explicit opt-out, reload and honest study credit');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
