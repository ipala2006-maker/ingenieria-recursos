const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const headers=require('../vercel.json').headers.find(r=>r.source==='/(.*)').headers;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
(async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file)])return res.writeHead(404).end();
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',types[path.extname(file)]);res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  let browser;
  try{
    const live=process.env.TEST_BASE_URL;
    if(live)assert.equal(new URL(live).origin,'https://estudiemos-app.vercel.app');
    else await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=live||'http://127.0.0.1:'+server.address().port;
    const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';
    browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    const output=path.join(root,'tmp/study-goal',live?'live':'local');fs.mkdirSync(output,{recursive:true});
    for(const width of [1440,390,320]){
      const context=await browser.newContext({viewport:{width,height:width<500?844:900},timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});
        return route.continue();
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/?version='+(process.env.RELEASE_VERSION||'daily-goal'));
      const dialog=page.locator('[data-study-goal-dialog]');
      await dialog.waitFor({state:'visible'});
      await dialog.locator('[data-study-goal-preset="15"]').click();
      assert.equal(await dialog.locator('input').inputValue(),'15');
      assert.equal(await dialog.locator('[data-study-goal-preset="15"]').getAttribute('aria-pressed'),'true');
      await page.screenshot({path:path.join(output,`${engine}-${width}-goal.png`)});
      await dialog.locator('[type=submit]').click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('estudiemos_pomodoro_streak')).goal.minutes),15);
      assert.match(await page.locator('[data-home-presence]').innerText(),/15 min/);
      await page.reload();await page.waitForFunction(()=>Boolean(window.EstudiemosStudy&&window.EstudiemosAccount));
      await page.locator('[data-home-presence]').filter({hasText:'15 min'}).waitFor({state:'attached'});
      assert.equal(await dialog.isVisible(),false,'saved objective is not asked again');
      await page.locator('[data-streak-open]').click();
      await page.locator('[data-streak-goal-open]').click();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos:cloud-restored')));
      assert.equal(await dialog.isVisible(),true,'background progress sync does not interrupt manual edits');
      await dialog.locator('input').fill('45');await dialog.locator('[type=submit]').click();
      assert.match(await page.locator('[data-streak-goal-label]').textContent(),/45/);
      await page.evaluate(()=>{
        const date=window.EstudiemosStudyGoal.dateKey(new Date());
        const state=JSON.parse(localStorage.getItem('estudiemos_pomodoro_streak'));
        state.days[date]=45;localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('estudiemos:cloud-restored'));
      });
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().todayActive),true);
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().currentStreak),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
      await page.goto(base+'/widget.html?view=streak');
      await page.locator('.widget-streak').waitFor({state:'visible'});
      assert.match(await page.locator('.widget-streak').innerText(),/45 min/);
      assert.deepEqual(errors,[],`${engine} ${width}: no page errors`);
      console.log(`PASS ${engine} ${width}: onboarding, persistence, edit, completion, widget`);
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
