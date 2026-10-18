const {chromium,webkit} = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..'), output = path.join(root,'tmp/timetable-check');
const headers = require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const server = http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) { res.setHeader('Content-Type','application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
    try {
      for(const {key,value} of headers) res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
      res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:'+server.address().port;
    browser = process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    for(const width of [1440,1024,390,320]) {
      const context = await browser.newContext({viewport:{width,height:900},timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block',isMobile:width<500,hasTouch:width<500});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(()=>{
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'exam',title:'Parcial',date:'2026-10-18',type:'Parcial'}]));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({goal:{minutes:45,updatedAt:1},days:{}}));
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/');
      await page.locator('.topbar [data-timetable-open]').click();
      const dialog=page.locator('[data-timetable]'), form=dialog.locator('form');
      await dialog.waitFor({state:'visible'});
      await form.locator('[name=title]').fill('Análisis matemático');
      for(const day of [0,1,2,3,4,5,6]) await form.locator('[name=day][value="'+day+'"]').setChecked([1,3,5].includes(day));
      await form.locator('[name=start]').fill('08:00');await form.locator('[name=end]').fill('11:00');await form.locator('[name=place]').fill('Aula 203');
      await form.locator('[data-timetable-color=teal]').click();
      await form.locator('[type=submit]').click();
      assert.match(await dialog.locator('[data-timetable-status]').textContent(),/guardado/);
      assert.equal(await dialog.locator('[data-timetable-count]').textContent(),'1 horario fijo');
      assert.equal(await dialog.locator('.timetable__entry').count(),3);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),1,'no dated entries created for recurring schedules');
      await dialog.locator('[data-timetable-close]').click();
      await page.reload();await page.locator('.topbar [data-timetable-open]').click();
      assert.equal(await dialog.locator('[data-timetable-count]').textContent(),'1 horario fijo');
      if(width<=900) await dialog.locator('[data-timetable-day="1"]').click();
      await dialog.locator('#timetableDay1 [data-timetable-edit]').click();
      await form.locator('[name=end]').fill('10:30');await form.locator('[type=submit]').click();
      assert.match(await dialog.locator('#timetableDay1 time').textContent(),/10:30/);
      await form.locator('[name=title]').fill('Programación');
      await form.locator('[name=start]').fill('14:00');await form.locator('[name=end]').fill('16:00');
      await form.locator('[type=submit]').click();
      assert.equal(await dialog.locator('[data-timetable-count]').textContent(),'2 horarios fijos');
      for(const theme of ['dark','light']) {
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);await page.waitForTimeout(150);
        assert.deepEqual(await dialog.locator('input,h4,p,button').evaluateAll(nodes=>nodes.filter(node=>node.clientWidth>0&&(node.scrollWidth>node.clientWidth+2)).map(node=>node.textContent)),[],'no clipped controls');
        assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        await dialog.screenshot({path:path.join(output,theme+'-'+width+'.png')});
      }
      if(width<=900) {await dialog.locator('[data-timetable-day="1"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await dialog.locator('[data-timetable-day="2"]').getAttribute('aria-selected'),'true');await dialog.locator('[data-timetable-day="1"]').click();}
      await dialog.locator('#timetableDay1 [data-timetable-delete]').last().click();
      assert.equal(await dialog.locator('[data-timetable-count]').textContent(),'1 horario fijo');
      await form.locator('[name=title]').fill('<img src=x onerror="window.__xss=true">');
      await form.locator('[name=start]').fill('18:00');await form.locator('[name=end]').fill('19:00');await form.locator('[type=submit]').click();
      assert.equal(await dialog.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
      await page.evaluate(()=>{window.EstudiemosAccount.getUser=()=>({id:'other-student'});dispatchEvent(new CustomEvent('estudiemos:account-synced'));});
      assert.equal(await dialog.isVisible(),false,'account switch closes old private form');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('Weekly timetable: multi-day creation, edit, delete, persistence, privacy, themes and four viewports passed.');
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
