const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8149/';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>null,getUser:()=>null,getSession:()=>null};});
    await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('[data-home-customize]').click();
    const tool=key=>page.locator(`[data-home-space=${key}]`);
    const before=await tool('focus').boundingBox(),progress=await tool('progress').boundingBox();
    const handle=await page.locator('[data-home-move=focus]').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+50,handle.y+handle.height/2+30,{steps:6});
    await page.waitForFunction(()=>Number.parseFloat(document.querySelector('[data-home-space=focus]').style.getPropertyValue('--home-drag-x'))===50);
    const moving=await tool('focus').boundingBox();assert.ok(Math.abs(moving.x-before.x-50)<2,'tool follows cursor');
    await page.mouse.move(progress.x+progress.width/2,progress.y+progress.height/2,{steps:8});await page.mouse.up();
    await page.waitForTimeout(300);
    const after=await tool('focus').boundingBox();assert.ok(Math.abs(after.x-progress.x)<2,'drop exchanges tools');
    await page.reload({waitUntil:'networkidle'});assert.ok(Math.abs((await tool('focus').boundingBox()).x-after.x)<2,'reorder persists');
    await page.locator('[data-home-customize]').click();
    const divider=page.locator('.home-board-divider[data-axis=x]').first(),r=await divider.boundingBox();
    const initial=await tool('progress').boundingBox();
    await page.mouse.move(r.x+6,r.y+r.height/2);await page.mouse.down();
    await page.mouse.move(r.x+9,r.y+r.height/2,{steps:3});await page.mouse.up();
    const resized=await tool('progress').boundingBox();assert.ok(Math.abs(resized.width-initial.width-3)<1,'continuous pixel resizing');
    const saved=await page.evaluate(()=>localStorage.getItem('estudiemos_home_layout'));
    const next=await divider.boundingBox();await page.mouse.move(next.x+6,next.y+next.height/2);await page.mouse.down();
    await page.mouse.move(next.x+90,next.y+next.height/2,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.evaluate(()=>localStorage.getItem('estudiemos_home_layout')),saved,'Escape rolls back without saving');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('.workspace-page').evaluate(n=>n.scrollHeight<=n.clientHeight+1));
    assert.deepEqual(errors,[]);console.log('PASS movement, continuous resize, persistence and cancellation');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
