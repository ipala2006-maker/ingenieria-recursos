const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8183/',out='tmp/ui-flow';
assert.equal(new URL(base).hostname,'127.0.0.1','This review uses local fixtures only');
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
  try {
    for(const [width,height,theme,reduced] of [[1440,900,'dark',false],[1024,768,'light',false],[768,1024,'dark',true],[390,844,'dark',false],[320,640,'light',true]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,isMobile:width<701,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      await context.addInitScript(theme=>{
        localStorage.setItem('estudiemos_theme',theme);localStorage.setItem('estudiemos_onboarding_v1','{"status":"completed"}');
        localStorage.setItem('estudiemos_pomodoro_streak','{"days":{},"goal":{"minutes":25,"updatedAt":1}}');
      },theme);
      await page.goto(base,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.EstudiemosStudy&&window.EstudiemosClasses&&window.EstudiemosAccount);
      async function fit(node){const r=await node.boundingBox();assert.ok(r&&r.x>=-1&&r.y>=-1&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify(r));}
      async function close(node,selector){await node.locator(selector).click();await node.waitFor({state:'hidden'});}
      async function screenshot(name){await page.waitForTimeout(reduced?30:230);await page.screenshot({path:`${out}/${process.env.TEST_WEBKIT?'webkit':'chrome'}-${width}-${name}.png`});}
      await page.locator('.topbar [data-quick-note-open]').click();const quick=page.locator('[data-quick-panel=note]');await quick.waitFor();await fit(quick.locator('.quick-panel'));
      await quick.locator('[name=title]').fill('Repasar integrales y preparar las dudas para la próxima clase');await screenshot('note');await quick.locator('[name=title]').press('Enter');await quick.waitFor({state:'hidden'});
      if(width<701)await page.locator('[data-home-view=calendar]').click();
      await page.locator('[data-calendar-expand]').click();const calendar=page.locator('[data-calendar-reader]');await calendar.waitFor();await screenshot('calendar');await fit(calendar);
      await calendar.press('Escape');await calendar.waitFor({state:'hidden'});
      if(width<701)await page.locator('[data-home-view=overview]').click();
      await page.locator('[data-home-session] summary').click();const session=page.locator('.study-session-dialog');await session.waitFor();await screenshot('session');await fit(session);await close(session,'[data-home-session-close]');
      await page.locator('[data-home-timer]').click();await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),true);await page.locator('[data-home-timer]').click();
      await page.locator('[data-friends-open]').click();const friends=page.locator('.friends-dialog');await friends.waitFor();await screenshot('friends');await fit(friends);await friends.press('Escape');await friends.waitFor({state:'hidden'});
      await page.locator('[data-classes-open]').click();const classes=page.locator('.classroom-dialog');await classes.waitFor();await screenshot('classes');await fit(classes);await classes.press('Escape');await classes.waitFor({state:'hidden'});
      await page.locator('[data-account-open]').click();const account=page.locator('.account-shell');await account.waitFor();await screenshot('account');await fit(account.locator('.account-panel'));await close(account,'[data-account-close]');
      await page.locator('[data-home-customize]').click();await screenshot('editing');
      const chrome=page.locator('[data-home-space=focus] .home-tool-editbar');await fit(chrome);
      for(const button of await chrome.locator('button:visible').all()){const r=await button.boundingBox();assert.ok(r.height>=(width<900?44:28));}
      await page.locator('.home-layout-done').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.goto(new URL('mi-espacio.html',base).href);await page.locator('[data-drive-connect]').waitFor();await screenshot('drive');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await page.goto(new URL('instalar.html?local=1',base).href);await page.locator('[data-install-pc]').waitFor();await screenshot('install');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(errors,[]);console.log(`PASS ${width} ${theme}${reduced?' reduced-motion':''}: note, calendar, session/timer, friends, courses, account, editing, Drive and install`);await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
