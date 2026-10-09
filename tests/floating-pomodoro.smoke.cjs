const { chromium } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/floating-pomodoro');
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type','application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      for (const {key,value} of headers) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
      res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    fs.mkdirSync(output, {recursive:true});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({channel:'chrome'});
    const context = await browser.newContext({viewport:{width:1280,height:720},timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(() => {
      if (location.hostname !== '127.0.0.1') return;
      localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{blocks:5,study:59,break:5},currentBlock:4,phase:'study',remaining:3300,running:false,autoStart:true,updatedAt:Date.now()}));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/');
    await page.locator('[data-home-skip] svg').waitFor();
    await page.locator('[data-home-open="pomodoro"]').click();
    await page.locator('[data-pomodoro-popout]').click();
    await page.waitForFunction(()=>window.documentPictureInPicture?.window?.document.querySelector('[data-pip-dial]')?.getAttribute('aria-valuenow')==='55');
    const pip = context.pages().find(candidate => candidate !== page && candidate.url()==='about:blank');
    assert.ok(pip,'Chrome must open a real Document Picture-in-Picture page');
    pip.on('pageerror',error=>errors.push(error.message));
    for (const [width,height] of [[360,450],[320,360],[240,300],[180,180],[160,140],[460,220],[700,200],[360,640]]) {
      await pip.setViewportSize({width,height});
      await pip.waitForTimeout(120);
      const failures = await pip.evaluate(()=>{
        const problems=[],clock=document.querySelector('[data-pip-dial]').getBoundingClientRect();
        for(const node of document.querySelectorAll('header strong,header small,[data-pip-time],[data-pip-label],button,[data-pip-remaining]')) {
          if(!node.getClientRects().length)continue;
          const r=node.getBoundingClientRect();
          if(r.left<0 || r.top<0 || r.right>innerWidth+1 || r.bottom>innerHeight+1 || node.scrollWidth>node.clientWidth+1)problems.push('clipped '+node.outerHTML.slice(0,100));
          if(node.matches('[data-pip-time],[data-pip-label]') && (r.left<clock.left+4 || r.right>clock.right-4 || r.top<clock.top || r.bottom>clock.bottom))problems.push('clock overlap '+node.textContent);
          if(node.matches('button') && getComputedStyle(node).boxShadow!=='none')problems.push('raised button');
        }
        if(document.documentElement.scrollHeight>innerHeight+1 || document.documentElement.scrollWidth>innerWidth+1)problems.push('window scrollbar');
        return problems;
      });
      assert.deepEqual(failures,[],`floating timer must fit at ${width}x${height}`);
      for(const selector of ['[data-pip-reset]','[data-pip-toggle]','[data-pip-skip]','[data-pip-settings-toggle]'])assert.ok(await pip.locator(selector).isVisible(),selector+' stays accessible');
      for(const theme of ['dark','light']) {
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
        await pip.waitForTimeout(180);
        assert.equal(await pip.locator('html').getAttribute('data-theme'),theme);
        await pip.screenshot({path:path.join(output,`floating-${width}x${height}-${theme}.png`)});
      }
      await pip.locator('[data-pip-settings-toggle]').click();
      assert.equal(await pip.evaluate(()=>innerWidth),width,'settings must not resize the window');
      assert.equal(await pip.evaluate(()=>innerHeight),height);
      assert.equal(await pip.locator('[data-pip-value="study"]').inputValue(),'59');
      await pip.locator('[data-pip-value="study"]').fill('58');
      await pip.locator('[data-pip-value="study"]').press('Tab');
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().config.study),58);
      await pip.locator('[data-pip-value="study"]').fill('59');
      await pip.locator('[data-pip-value="study"]').press('Tab');
      await pip.screenshot({path:path.join(output,`settings-${width}x${height}.png`)});
      await pip.locator('[data-pip-value="study"]').press('Escape');
      assert.equal(await pip.locator('[data-pip-settings-panel]').isVisible(),false);
      assert.equal(await pip.evaluate(()=>document.activeElement.hasAttribute('data-pip-settings-toggle')),true);
      console.log(`PASS real floating window ${width}x${height}: all controls, adaptive clock, both themes and configuration without resizing`);
    }
    await pip.setViewportSize({width:320,height:360});
    const dial=pip.locator('[data-pip-dial]');
    await dial.focus();await dial.press('Home');
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),60);
    await dial.press('PageUp');
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),360);
    const box=await dial.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,r=box.width*.44;
    await pip.mouse.move(cx+r,cy);await pip.mouse.down();
    await pip.mouse.move(cx,cy+r,{steps:12});
    assert.equal(await pip.locator('[data-pip-time]').textContent(),'30:00','drag preview follows the pointer');
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),360,'preview does not mutate the shared timer');
    await pip.mouse.up();
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),1800);
    await pip.mouse.move(cx+r,cy);await pip.mouse.down();await pip.mouse.move(cx-r,cy,{steps:12});
    await dial.press('Escape');await pip.mouse.up();
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),1800,'Escape cancels the drag');
    await pip.locator('[data-pip-adjust="-1"]').click();
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),1740);
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().todayMinutes),0,'adjustment never creates study credit');
    await pip.locator('[data-pip-toggle]').click();
    const deadline=await page.evaluate(()=>JSON.parse(localStorage.estudiemos_pomodoro).endAt);
    await pip.evaluate(()=>{window.savedPlayIcon=document.querySelector('[data-pip-toggle] svg');});
    await page.evaluate(()=>window.EstudiemosTheme.set('dark'));
    await pip.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),true);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.estudiemos_pomodoro).endAt),deadline);
    assert.equal(await pip.evaluate(()=>window.savedPlayIcon===document.querySelector('[data-pip-toggle] svg')),true,'renders must not replace a stable control');
    await pip.locator('[data-pip-skip]').click();
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'break');
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),true);
    assert.equal(await pip.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--phase').trim()),'#fbbc04');
    await pip.setViewportSize({width:240,height:300});
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),true,'resizing must not pause a running timer');
    await pip.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await pip.locator('.progress').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await pip.waitForTimeout(200);
    await pip.screenshot({path:path.join(output,'floating-rest-240x300.png')});
    await pip.locator('[data-pip-toggle]').click();
    await pip.locator('[data-pip-skip]').click();
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'study');
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().block),5);
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),false);
    const beforeClose=await page.evaluate(()=>window.EstudiemosStudy.snapshot());
    await pip.locator('[data-pip-close]').click();
    await page.waitForFunction(()=>!documentPictureInPicture.window || documentPictureInPicture.window.closed);
    await page.locator('[data-home-open="pomodoro"]').click();await page.locator('[data-pomodoro-popout]').click();
    await page.waitForFunction(()=>documentPictureInPicture.window && !documentPictureInPicture.window.closed && documentPictureInPicture.window.document.querySelector('[data-pip-time]'));
    const reopened=await page.evaluate(()=>({time:documentPictureInPicture.window.document.querySelector('[data-pip-time]').textContent,snapshot:window.EstudiemosStudy.snapshot()}));
    assert.equal(reopened.time,`${String(Math.floor(reopened.snapshot.remaining/60)).padStart(2,'0')}:${String(reopened.snapshot.remaining%60).padStart(2,'0')}`,'reopening shows the shared time');
    assert.equal(reopened.snapshot.remaining,beforeClose.remaining);
    assert.equal(reopened.snapshot.block,beforeClose.block);
    assert.deepEqual(reopened.snapshot.config,beforeClose.config);
    assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),false,'closing and reopening must preserve pause and shared time');
    await page.evaluate(()=>documentPictureInPicture.window.close());
    await page.goto(base+'/pages/bandeja.html');
    await page.locator('[data-pomodoro-open]').click();await page.locator('[data-pomodoro-popout]').click();
    await page.waitForFunction(()=>documentPictureInPicture.window?.document.querySelector('[data-pip-settings-toggle]'));
    assert.equal(await page.evaluate(()=>documentPictureInPicture.window.document.querySelectorAll('[data-pip-adjust]').length),2,'direct Inbox entry loads the same new floating controls');
    await page.evaluate(()=>documentPictureInPicture.window.close());
    console.log('PASS native controls: keyboard/pointer dial, cancellation, minute adjustment, running/paused skip, yellow rest, stable deadline, close/reopen and zero fake credit');
    assert.deepEqual(errors,[]);
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
