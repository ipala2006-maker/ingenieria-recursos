const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/onboarding');
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser,lastPage;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  try{
    fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const width of process.env.TEST_WIDTHS?process.env.TEST_WIDTHS.split(',').map(Number):[1440,1024,390,320]){
      const context=await browser.newContext({viewport:{width,height:width===320?568:900},hasTouch:width<500,isMobile:width<500,serviceWorkers:'block'});
      const apiRequests=[],errors=[],dialogs=[];
      if(width===1440)await context.addInitScript(()=>localStorage.setItem('estudiemos_home_layout','{}'));
      await context.addInitScript(()=>{window.__permissionRequests=0;window.__tourInputFocus=0;document.addEventListener('focusin',event=>{if(window.EstudiemosOnboarding?.isActive()&&event.target.matches('input,textarea,select'))window.__tourInputFocus++;});if(window.Notification)Notification.requestPermission=async()=>{window.__permissionRequests++;return 'denied';};});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
        if(url.pathname.startsWith('/api/')){apiRequests.push(url.pathname+url.search);return route.fulfill({json:{enabled:false}});}
        return route.continue();
      });
      const page=await context.newPage();lastPage=page;page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
      await page.goto(base);
      const layer=page.locator('.onboarding-layer'),popover=layer.locator('.driver-popover');
      await layer.waitFor({state:'visible'});await popover.waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('[data-study-goal-dialog]').open);
      const before=await page.evaluate(()=>({history:history.length,agenda:localStorage.getItem('bandeja_agenda'),schedules:localStorage.getItem('bandeja_horarios'),layout:localStorage.getItem('estudiemos_home_layout_local'),config:EstudiemosStudy.snapshot().config}));
      const visited=[];
      for(let i=0;i<20;i++){
        const step=await layer.getAttribute('data-step')||'welcome';visited.push(step);
        await popover.waitFor({state:'visible'});await page.waitForTimeout(450);
        const rect=await popover.boundingBox();assert.ok(rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=width+1&&rect.y+rect.height<=(width===320?568:900)+1,`${width} ${step}: ${JSON.stringify(rect)}`);
        const focus=await layer.locator('.onboarding-focus').boundingBox();
        if(focus)assert.ok(Math.min(rect.x+rect.width,focus.x+focus.width)-Math.max(rect.x,focus.x)<=2||Math.min(rect.y+rect.height,focus.y+focus.height)-Math.max(rect.y,focus.y)<=2,`${width} ${step}: popover must not cover highlighted controls`);
        assert.equal(await popover.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
        assert.equal(await page.evaluate(()=>document.querySelectorAll('.onboarding-layer[open]').length),1);
        if(step!=='welcome'&&step!=='done')assert.equal(await page.evaluate(()=>document.querySelector('.driver-active-element')?.id!=='driver-dummy-element'),true,step+' must highlight a real tool');
        if(['welcome','alarms','program','session','drive','done'].includes(step))await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${width}-${step}.png`)});
        if(step==='program')assert.equal(await page.locator('[data-calendar-reader]').evaluate(el=>el.open),true);
        if(step==='session')assert.equal(await page.locator('.study-session-dialog').evaluate(el=>el.open),true);
        if(step==='done'){await page.mouse.click(width-4,80);break;}
        await page.mouse.click(width-4,80);
        await page.waitForFunction(previous=>document.querySelector('.onboarding-layer')?.dataset.step!==previous,step);
      }
      assert.ok(visited.includes('done'),visited.join(','));
      for(const step of ['note','alarms','calendar','program','friends','layout','account',...(width===1440?['pomodoro','session','progress','drive']:[])])assert.ok(visited.includes(step),step+': '+visited.join(','));
      await layer.waitFor({state:'hidden'});await page.locator('[data-study-goal-dialog]').waitFor({state:'visible'});
      const after=await page.evaluate(()=>({history:history.length,agenda:localStorage.getItem('bandeja_agenda'),schedules:localStorage.getItem('bandeja_horarios'),layout:localStorage.getItem('estudiemos_home_layout_local'),config:EstudiemosStudy.snapshot().config}));
      assert.deepEqual(after,before,'The tour must not change tasks, schedules, configuration, layout or history length');
      assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),false);assert.equal(await page.evaluate(()=>window.__permissionRequests),0);assert.equal(await page.evaluate(()=>window.__tourInputFocus),0,'Do not summon a phone keyboard during previews');assert.deepEqual(dialogs,[]);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.estudiemos_onboarding_v1).status),'completed');
      await page.locator('[data-study-goal-close]').click();
      await page.reload();await page.waitForFunction(()=>window.EstudiemosOnboarding&&window.EstudiemosStudy);
      assert.equal(await layer.count(),0,'No repeat on next launch');
      if(await page.locator('[data-study-goal-dialog]').isVisible())await page.locator('[data-study-goal-close]').click();
      await page.locator('[data-account-open]').click();await page.locator('[data-onboarding-replay]').click();await layer.waitFor({state:'visible'});
      await popover.waitFor({state:'visible'});await page.waitForTimeout(230);await page.mouse.click(width-4,80);
      await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='note');await page.waitForTimeout(250);
      await page.mouse.click(4,80);await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='welcome');await page.waitForTimeout(250);
      await page.mouse.click(width-4,80);await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='note');await page.waitForTimeout(250);
      await popover.locator('.driver-popover-close-btn').click();await layer.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>history.length),before.history,'Omitting from a note must not navigate back');assert.equal(await page.locator('[data-quick-panel=note]').isVisible(),false);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.estudiemos_onboarding_v1).status),'skipped');
      assert.deepEqual(errors,[]);assert.ok(apiRequests.every(url=>!url.includes('friends=')&&!url.includes('dispatch')),JSON.stringify(apiRequests));
      console.log('PASS tour '+width+': real previews, all steps, no writes/permissions/history changes, goal ordering, reload, replay, back and skip');
      await context.close();
    }
    const extra=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await extra.addInitScript(()=>{localStorage.setItem('estudiemos_theme','light');localStorage.setItem('estudiemos_onboarding_v1',JSON.stringify({status:'completed'}));});
    await extra.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});return route.continue();});
    const page=await extra.newPage();lastPage=page;
    await page.goto(base+'/?tutorial=1');const layer=page.locator('.onboarding-layer');await layer.waitFor({state:'visible'});await page.waitForTimeout(450);
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('theme-light')),true);
    assert.equal(await page.evaluate(()=>location.search.includes('tutorial=')),false);
    await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-light-reduced.png`)});
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='note');await page.waitForTimeout(100);
    await page.mouse.click(386,4);await page.waitForFunction(()=>document.querySelector('.onboarding-layer')?.dataset.step==='alarms');await page.waitForTimeout(100);
    await page.keyboard.press('Escape');await layer.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.estudiemos_onboarding_v1).status),'skipped');
    assert.equal(await page.locator('[data-quick-panel=note]').isVisible(),false);
    if(await page.locator('[data-study-goal-dialog]').isVisible())await page.locator('[data-study-goal-close]').click();
    await page.evaluate(()=>EstudiemosOnboarding.start());await layer.waitFor({state:'visible'});await page.waitForTimeout(100);
    await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.className='inbox-alarm-notice';document.body.append(dialog);dialog.showModal();});
    await layer.waitFor({state:'hidden'});assert.equal(await page.locator('.inbox-alarm-notice[open]').evaluate(el=>el.open),true,'A real task alarm must interrupt the tour');
    await extra.close();
    const failed=await browser.newContext({serviceWorkers:'block'});await failed.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base||url.pathname.includes('/vendor/driver/'))return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});return route.continue();});
    const failedPage=await failed.newPage();lastPage=failedPage;await failedPage.goto(base);await failedPage.waitForFunction(()=>window.EstudiemosStudy&&window.EstudiemosOnboarding&&!EstudiemosOnboarding.pending());
    assert.equal(await failedPage.locator('.onboarding-layer').count(),0);await failedPage.locator('[data-study-goal-dialog]').waitFor({state:'visible'});await failed.close();
    const interrupted=await browser.newContext({serviceWorkers:'block'});await interrupted.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});return route.continue();});
    const alarmPage=await interrupted.newPage();lastPage=alarmPage;await alarmPage.goto(base);await alarmPage.locator('.onboarding-layer').waitFor({state:'visible'});await alarmPage.waitForTimeout(450);
    await alarmPage.evaluate(()=>{const dialog=document.createElement('dialog');dialog.className='inbox-alarm-notice';document.body.append(dialog);dialog.showModal();});
    await alarmPage.locator('.onboarding-layer').waitFor({state:'hidden'});assert.equal(await alarmPage.locator('[data-study-goal-dialog]').evaluate(el=>el.open),false,'First-use goal must not cover a real alarm');
    assert.equal(await alarmPage.evaluate(()=>localStorage.getItem('estudiemos_onboarding_v1')),null,'Interrupted tours can retry later');await interrupted.close();
    console.log('PASS light theme, reduced motion, direct replay, keyboard, background tap, real alarm priority and blocked optional assets');
  }catch(error){if(lastPage&&!lastPage.isClosed()){
    console.error(await lastPage.evaluate(()=>{const layer=document.querySelector('.onboarding-layer'),target=document.querySelector('.driver-active-element'),pop=document.querySelector('.driver-popover');return {step:layer?.dataset.step,layer:layer?.getBoundingClientRect().toJSON(),inset:layer&&getComputedStyle(layer).inset,margin:layer&&getComputedStyle(layer).margin,transform:layer&&getComputedStyle(layer).transform,target:target?.getBoundingClientRect().toJSON(),pop:pop?.getBoundingClientRect().toJSON()};}));
    await lastPage.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-failure.png`)});
  }throw error;}
  finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
