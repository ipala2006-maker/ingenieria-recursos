const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8135/';
const output=path.join(__dirname,'../tmp/ui-check');
const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';
const image=page=>page.locator('[data-organizer-scene]').evaluate(canvas=>canvas.toDataURL());
const state=page=>page.evaluate(()=>window.EstudiemosStudy.snapshot());
async function fixture(page) {
  await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
  await page.addInitScript(()=>{
    localStorage.setItem('estudiemos_theme','dark');
    const query={select(){return this},eq(){return this},order:async()=>({data:[]})};
    window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>({from:()=>query}),getUser:()=>({id:'test-user'}),getSession:()=>null,open:()=>{}};
  });
}
async function tap(page,locator,touch) {
  if(touch)await locator.tap();else await locator.click();
}
async function fits(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),'no page overflow');
}
(async()=>{
  const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try {
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]) {
      const touch=viewport.width<500,context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await fixture(page);await page.goto(base,{waitUntil:'networkidle'});
      const canvas=page.locator('[data-organizer-scene]');await canvas.waitFor();await page.waitForTimeout(800);
      assert.equal(await page.locator('[data-organizer-scene]').count(),1);
      const pixels=await canvas.evaluate(c=>{
        const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let visible=0,blue=0;
        for(let i=0;i<data.length;i+=4)if(data[i+3]>100){visible++;if(data[i+2]>data[i]+10)blue++;}
        return {visible,blue,width:c.width,height:c.height};
      });
      assert.ok(pixels.visible>300&&pixels.blue>100,`real model renders: ${JSON.stringify(pixels)}`);
      const frame=await image(page);await page.waitForTimeout(600);
      assert.notEqual(await image(page),frame,'model moves without interaction');
      await tap(page,page.locator('[data-home-motion]'),touch);
      assert.equal(await page.locator('[data-home-motion]').getAttribute('aria-pressed'),'false');
      await page.waitForTimeout(1100);const paused=await image(page);await page.waitForTimeout(350);
      assert.equal(await image(page),paused,'pause must stop automatic animation');
      const box=await canvas.boundingBox();
      await page.mouse.move(box.x+box.width*.45,box.y+box.height*.6);await page.mouse.down();
      await page.mouse.move(box.x+box.width*.75,box.y+box.height*.2,{steps:12});await page.mouse.up();await page.waitForTimeout(700);
      assert.notEqual(await image(page),paused,'drag rotates the actual model while paused');
      await canvas.focus();const rotated=await image(page);await page.keyboard.press('Enter');await page.waitForTimeout(600);
      assert.notEqual(await image(page),rotated,'keyboard changes depth');
      await page.keyboard.press('Home');await page.waitForTimeout(600);
      await page.screenshot({path:path.join(output,`motion-${engine}-${viewport.width}.png`)});
      await page.evaluate(()=>window.addEventListener('estudiemos:home-navigate',event=>{window.testModelDestination=event.detail.view;},{once:true}));
      if(touch)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
      else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      assert.ok(['inbox','calendar','space'].includes(await page.evaluate(()=>window.testModelDestination)),'clicking the model opens its real tool');
      if(touch)await page.locator('[data-home-view="overview"]').tap();
      await tap(page,page.locator('[data-home-session]>summary'),touch);
      await tap(page,page.locator('[data-home-preset="25,5,4"]'),touch);
      const plus=page.locator('[data-home-config-step="1"][data-config-key="study"]');
      await tap(page,plus,touch);assert.equal((await state(page)).config.study,26);
      const buttonBox=await plus.boundingBox();await page.mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);
      await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();await page.waitForTimeout(120);
      const held=(await state(page)).config.study;assert.ok(held>=29&&held<=34,`hold changes continuously, got ${held}`);
      await page.waitForTimeout(300);assert.equal((await state(page)).config.study,held,'release stops repeat');
      await plus.focus();await page.keyboard.press('Enter');assert.equal((await state(page)).config.study,held+1,'keyboard activation works after a hold');
      assert.equal((await state(page)).todayMinutes,0,'configuration never earns study credit');
      await page.locator('[data-home-config="study"]').fill('59');await page.keyboard.press('Tab');
      assert.equal(await plus.isDisabled(),true);
      await page.locator('[data-home-config="break"]').fill('0');await page.keyboard.press('Tab');
      assert.equal(await page.locator('[data-home-config-step="-1"][data-config-key="break"]').isDisabled(),true);
      await tap(page,page.locator('[data-home-preset="25,5,4"]'),touch);
      await page.locator('[data-home-config="study"]').fill('32');await page.waitForTimeout(1200);
      assert.equal(await page.locator('[data-home-config="study"]').inputValue(),'32','render does not overwrite editing');
      await page.keyboard.press('Tab');assert.equal((await state(page)).config.study,32);
      await tap(page,page.locator('[data-home-preset="25,5,4"]'),touch);
      await page.screenshot({path:path.join(output,`session-${engine}-${viewport.width}.png`)});
      await tap(page,page.locator('.study-session__sound>summary'),touch);
      await page.locator('[data-home-alarm]').selectOption('bell');assert.equal((await state(page)).alarmMode,'bell');
      await page.locator('[data-home-auto]').uncheck();assert.equal((await state(page)).autoStart,false);
      await page.locator('[data-home-volume]').fill('0.4');await page.locator('[data-home-volume]').dispatchEvent('change');
      assert.equal((await state(page)).alarmVolume,.4);
      await page.screenshot({path:path.join(output,`session-sound-${engine}-${viewport.width}.png`)});
      await tap(page,page.locator('[data-home-session-done]'),touch);await page.locator('.study-session-dialog').waitFor({state:'hidden'});
      await fits(page);
      await tap(page,page.locator('[data-home-timer]'),touch);assert.equal((await state(page)).running,true);
      await page.waitForTimeout(1300);assert.ok((await state(page)).remaining<1500);
      await tap(page,page.locator('[data-home-timer]'),touch);assert.equal((await state(page)).running,false);
      await tap(page,page.locator('[data-home-reset]'),touch);assert.equal((await state(page)).remaining,1500);
      assert.ok((await state(page)).todayMinutes<1,'reset did not invent completed study blocks');
      if(!touch) {
        await page.locator('[data-home-adjust="1"]').click();assert.equal((await state(page)).remaining,1560);
        await page.locator('[data-home-adjust="-1"]').click();assert.equal((await state(page)).remaining,1500);
      }
      await page.reload({waitUntil:'networkidle'});await canvas.waitFor();
      assert.equal(await page.locator('[data-home-motion]').getAttribute('aria-pressed'),'false','motion preference persists');
      await page.emulateMedia({reducedMotion:'reduce'});await canvas.waitFor({state:'detached'});
      assert.equal(await page.locator('[data-home-motion]').isVisible(),false);
      await tap(page,page.locator('[data-home-destination="inbox"]'),touch);
      assert.equal(await page.locator('.dashboard-agenda').isVisible(),true,'ordinary tool links survive reduced motion');
      assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('dashboard-agenda')),true,'navigation focuses the real Inbox');
      assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,...viewport,pixels,hold:held}));
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
