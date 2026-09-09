const {chromium,webkit} = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8131/';
const output = path.join(__dirname,'../tmp/ui-check');
(async () => {
  const browser = process.env.TEST_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  const report=[];
  try {
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]) {
      const context = await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({json:{enabled:false}}));
      await page.goto(base+'instalar.html?local=1',{waitUntil:'networkidle'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,`install-refined-${viewport.width}.png`)});
      await page.locator('[data-tour-target="focus"]').click();
      await page.locator('[data-demo-toggle]').click();
      await page.waitForFunction(()=>document.querySelector('[data-demo-clock]').textContent!=='25:00');
      await page.locator('[data-demo-toggle]').click();
      await page.locator('[data-demo-reset]').click();
      assert.equal(await page.locator('[data-demo-clock]').innerText(),'25:00');
      await page.locator('#tourPanel').screenshot({path:path.join(output,`install-focus-${viewport.width}.png`)});
      await page.locator('[data-widget-next]').click();
      assert.equal(await page.locator('[data-widget-status]').innerText(),'2 de 5');
      await page.locator('[data-install-pc]').click();
      assert.equal(await page.locator('[data-install-pc-guide]').isVisible(),true);
      assert.match(await page.locator('[data-install-android]').getAttribute('href'),/android-latest/);
      assert.match(await page.locator('[data-install-windows-widgets]').getAttribute('href'),/https:\/\/estudiemos-app\.vercel\.app\/downloads/);
      await page.locator('#instalar').screenshot({path:path.join(output,`install-platforms-${viewport.width}.png`)});
      await page.evaluate(()=>{
        const event = new Event('beforeinstallprompt');
        event.prompt=async()=>{window.testInstallPrompt=true;};
        event.userChoice=Promise.resolve({outcome:'accepted'});
        window.dispatchEvent(event);
      });
      await page.locator('[data-install-pc]').click();
      assert.equal(await page.evaluate(()=>window.testInstallPrompt),true);
      assert.equal(await page.locator('[data-install-pc]').innerText(),'Abrir Estudiemos');
      assert.deepEqual(errors,[]);
      report.push({installation:viewport.width,errors});
      await context.close();
    }
    for(const viewport of [{width:390,height:400},{width:280,height:280},{width:300,height:210}]) {
      for(const view of ['workspace','calendar','inbox','pomodoro','streak']) {
        const context=await browser.newContext({viewport});
        await context.addInitScript(()=>{
          const date=new Date();const today=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
          localStorage.setItem('estudiemos_theme','dark');
          localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'qa-one',title:'Repasar matrices',date:today,type:'Tarea',done:false,horaInicio:'09:00'},{id:'qa-two',title:'Preparar resumen',date:'',type:'Tarea',done:false}]));
          localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days:{[today]:35}}));
          const query={select(){return this;},eq(){return this;},order:async()=>({data:[{id:'qa-folder',kind:'folder',name:'Apuntes',parent_id:null}]})};
          window.EstudiemosAccount={getUser:()=>({id:'test-user'}),getSession:()=>null,whenReady:async()=>{},getClient:()=>({from:()=>query}),open:()=>{}};
        });
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.route('**/api/**',route=>route.fulfill({json:{enabled:false}}));
        await page.goto(base+`widget.html?source=desktop-app&view=${view}`,{waitUntil:'networkidle'});
        assert.equal(await page.locator('.widget-section').count(),1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.locator('.widget-section button').first().focus();
        const focus=await page.evaluate(()=>document.activeElement.outerHTML);
        await page.waitForTimeout(700);
        assert.equal(await page.evaluate(()=>document.activeElement.outerHTML),focus);
        if(view==='pomodoro') {
          const bounds=await page.locator('.pomodoro-widget-actions').boundingBox();
          assert.ok(bounds.y>=0 && bounds.y+bounds.height<=viewport.height+1,'Pomodoro controls must remain in the widget');
          const ring=await page.locator('.pomodoro-widget-ring').boundingBox();
          const time=await page.locator('.pomodoro-widget-ring strong').boundingBox();
          assert.ok(ring.y+ring.height<=bounds.y,'ring must not overlap its buttons');
          assert.ok(time.x>=ring.x && time.x+time.width<=ring.x+ring.width,'clock must stay inside its ring');
        }
        await page.screenshot({path:path.join(output,`widget-refined-${view}-${viewport.width}x${viewport.height}.png`)});
        assert.deepEqual(errors,[]);
        report.push({widget:view,viewport,errors});
        await context.close();
      }
    }
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
