// npm install --prefix tmp/ui-check playwright pngjs; serve the repo on port 8126.
const {chromium,webkit} = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {PNG} = require('../tmp/ui-check/node_modules/pngjs');
const output = path.join(__dirname, '../tmp/ui-check');
(async () => {
  const safari = process.env.TEST_WEBKIT === '1';
  const browser = safari ? await webkit.launch({headless:true}) : await chromium.launch({channel:'chrome', headless:true, args:['--enable-unsafe-swiftshader']});
  const report = [];
  for (const view of [{name:'desktop',width:1440,height:900},{name:'iphone',width:390,height:844},{name:'android',width:412,height:915},{name:'small',width:320,height:568}]) {
    const context = await browser.newContext({ viewport:view, deviceScaleFactor:1, isMobile:view.width<500, hasTouch:view.width<500 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**', route => route.fulfill({json:{ enabled:false }}));
    await page.addInitScript(() => {
      localStorage.setItem('estudiemos_theme','dark');
      localStorage.setItem('bandeja_agenda',JSON.stringify(Array.from({length:6},(_,i)=>({id:'demo-task-'+i,title:'Actividad de prueba '+(i+1),type:'Tarea',date:'',done:false,createdAt:Date.now()-i}))));
      const items = ['Apuntes','Proyecto final','Computación y cálculo numérico','Lecturas'].map((name,i)=>({id:`folder-${i}`,name,kind:'folder',parent_id:null,updated_at:new Date().toISOString()}));
      const query = {select(){return this},eq(){return this},order:async()=>({data:items})};
      window.EstudiemosAccount = {whenReady:async()=>{},getClient:()=>({from:()=>query}),getUser:()=>({id:'test-user'}),getSession:()=>null,open:()=>{}};
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8126/',{waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#8bb5ff');
    await page.locator('[data-workspace-open]').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view.name+' overflow');
    await page.screenshot({path:path.join(output,view.name+'-home.png')});
    if(view.width<500) {
      await page.locator('[data-home-view="calendar"]').click();
      await page.locator('.dashboard-calendar').screenshot({path:path.join(output,view.name+'-calendar.png')});
      await page.locator('[data-dashboard-calendar-view="month"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('[data-home-view="inbox"]').click();
      await page.locator('.dashboard-agenda').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-dashboard-agenda-done]').count(),6);
      await page.locator('[data-dashboard-agenda-done="demo-task-0"]').click();
      assert.equal(await page.locator('[data-dashboard-agenda-done]').count(),5);
      await page.goBack();
      assert.equal(await page.locator('[data-home-view="calendar"]').getAttribute('aria-selected'),'true');
      await page.locator('[data-home-view="space"]').click();
    }
    await page.locator('[data-workspace-open="folder-0"]').click();
    await page.locator('[data-workspace-folder=""]').click();
    assert.equal(await page.locator('[data-workspace-open]').count(),4);
    await page.locator('[data-pomodoro-open]').click();
    await page.locator('.pomodoro-depth').waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.pomodoro-timer.has-depth').count(),1);
    const canvasImage = await page.locator('.pomodoro-depth').screenshot();
    const png = PNG.sync.read(canvasImage);
    const colors = new Set();
    for(let i=0;i<png.data.length;i+=4) colors.add(png.data.subarray(i,i+3).toString('hex'));
    const pixels = {colors:colors.size};
    assert.ok(colors.size>100,view.name+' blank canvas');
    const drawnPixels=await page.locator('.pomodoro-depth').evaluate(canvas=>{
      const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
      const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
      const data=ctx.getImageData(0,0,copy.width,copy.height).data;
      let count=0;for(let i=3;i<data.length;i+=4) if(data[i]>0) count++;
      return count;
    });
    pixels.drawn=drawnPixels;
    assert.ok(drawnPixels>100,view.name+' transparent 3D buffer');
    if(view.name==='desktop') {
      const rect=await page.locator('.pomodoro-timer').boundingBox();
      await page.mouse.move(rect.x+rect.width*.9,rect.y+rect.height*.15);
      await page.waitForTimeout(100);
      const tilted=await page.locator('.pomodoro-depth').screenshot();
      assert.notEqual(canvasImage.toString('base64'),tilted.toString('base64'),'3D responds to pointer');
    }
    const image = await page.locator('.pomodoro-timer').screenshot({path:path.join(output,view.name+'-focus.png')});
    assert.ok(image.length>1000);
    await page.locator('[data-pomodoro-toggle]').click();
    await page.waitForTimeout(1200);
    assert.notEqual(await page.locator('[data-pomodoro-time]').innerText(),'25:00');
    await page.locator('[data-pomodoro-toggle]').click();
    await page.locator('[data-pomodoro-close]').click();
    await page.locator('[data-streak-open]').click();
    const chart=page.locator('[data-streak-chart]');
    await chart.focus();
    await page.keyboard.press('Home');
    assert.equal(await chart.getAttribute('aria-valuenow'),'0');
    await page.locator('[data-streak-chart-range="month"]').click();
    assert.equal(await chart.getAttribute('aria-valuemax'),'29');
    await page.locator('[data-streak-close]').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-pomodoro-open]').click();
    assert.equal(await page.locator('.pomodoro-depth').count(),0);
    await page.locator('[data-pomodoro-close]').click();
    await page.locator('[data-theme-toggle]').click();
    await page.waitForTimeout(250);
    await page.screenshot({path:path.join(output,view.name+'-light.png')});
    report.push({view:view.name,errors,pixels});
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log(JSON.stringify(report,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
