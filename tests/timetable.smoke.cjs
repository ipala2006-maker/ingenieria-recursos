const {chromium,webkit} = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..'), output = path.join(root,'tmp/timetable-check');
const headers = require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const server = http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) {res.setHeader('Content-Type','application/json');res.end('{"enabled":false}');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
    try {
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
      res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=process.env.TEST_BASE_URL||'http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    for(const width of [1440,1024,390,320]) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block',isMobile:width<500,hasTouch:width<500});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(()=>{
        if(localStorage.getItem('config_seed'))return;
        localStorage.setItem('config_seed','1');
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'exam',title:'Parcial',date:'2026-10-18',type:'Parcial'},{id:'undated',title:'Una nota sin fecha',date:'',alarm:{date:'2027-01-01',time:'18:00',repeat:'none'}}]));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({goal:{minutes:45,updatedAt:1},days:{'2026-10-10':60}}));
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify({visible:{focus:false,progress:false,assistant:false,shortcuts:false,workspace:false,inbox:false,calendar:true}}));
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/');
      if(width<500)await page.locator('[data-home-view=calendar]').click();
      await page.waitForFunction(()=>window.EstudiemosTimetable);
      assert.equal(await page.locator('[data-timetable-open],.timetable__week,[data-calendar-manage-weekly]').count(),0);
      const calendar=page.locator('[data-dashboard-calendar-widget]'),tools=page.locator('[data-calendar-tools]'),dialog=page.locator('[data-timetable]'),form=dialog.locator('form');
      const create=async()=>{await calendar.locator('[data-calendar-add]').click();await tools.locator('[data-calendar-create-options] [data-calendar-add-weekly]').click();await dialog.waitFor({state:'visible'});};
      const settings=async()=>{await calendar.locator('[data-calendar-settings]').click();await tools.waitFor({state:'visible'});};
      await create();
      await form.locator('[name=title]').fill('Análisis matemático');
      for(const day of [0,1,2,3,4,5,6])await form.locator('[name=day][value="'+day+'"]').setChecked(false);
      await form.locator('[type=submit]').click();assert.match(await form.locator('[data-timetable-status]').textContent(),/al menos un día/);
      for(const day of [1,3,5])await form.locator('[name=day][value="'+day+'"]').setChecked(true);
      await form.locator('[name=start]').fill('08:00');await form.locator('[name=end]').fill('07:00');
      await form.locator('[type=submit]').click();assert.match(await form.locator('[data-timetable-status]').textContent(),/posterior/);
      await form.locator('[name=end]').fill('11:00');await form.locator('[name=place]').fill('Aula 203');await form.locator('[data-timetable-color=teal]').click();
      assert.match(await form.locator('[data-timetable-preview]').textContent(),/Análisis matemático.*Lun · Mié · Vie.*08:00–11:00/s);
      await form.locator('[type=submit]').click();await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),2);
      await page.reload();if(width<500)await page.locator('[data-home-view=calendar]').click();
      await page.waitForFunction(()=>window.EstudiemosTimetable);
      await settings();assert.equal(await tools.locator('[data-calendar-edit-schedule]').count(),1);
      await tools.locator('[data-calendar-edit-schedule]').click();await form.locator('[name=end]').fill('10:30');
      for(const theme of ['dark','light']) {
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
        assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        assert.deepEqual(await dialog.locator('input,p,button,strong,span').evaluateAll(nodes=>nodes.filter(n=>n.clientWidth>0&&n.scrollWidth>n.clientWidth+2).map(n=>n.textContent)),[]);
        await dialog.screenshot({path:path.join(output,theme+'-'+width+'.png')});
      }
      await form.locator('[type=submit]').click();await dialog.waitFor({state:'hidden'});
      await settings();assert.match(await tools.locator('.calendar-settings-schedule').textContent(),/10:30/);
      await tools.locator('[data-calendar-tools-close]').click();
      await create();await form.locator('[name=title]').fill('<img src=x onerror="window.__xss=true">');
      assert.equal(await dialog.locator('img').count(),0);await form.locator('[type=submit]').click();await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.__xss),undefined);
      await settings();await tools.locator('[data-calendar-edit-schedule]').last().click();
      await dialog.locator('[data-timetable-delete]').click();await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),1);
      const preserved=await page.evaluate(()=>({goal:localStorage.estudiemos_pomodoro_streak,note:JSON.parse(localStorage.bandeja_agenda).find(n=>n.id==='undated')}));
      await settings();await tools.locator('[data-calendar-clear]').click();await tools.locator('[data-calendar-cleanup-cancel]').click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),1);
      await tools.locator('[data-calendar-clear]').click();await tools.locator('[data-calendar-cleanup-confirm]').click();
      await tools.locator('[data-calendar-settings-status]').filter({hasText:'Calendario vacío'}).waitFor();
      assert.deepEqual(await page.evaluate(()=>({goal:localStorage.estudiemos_pomodoro_streak,note:JSON.parse(localStorage.bandeja_agenda)[0]})),preserved);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),1);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),0);
      await tools.locator('[data-calendar-tools-close]').click();await page.reload();if(width<500)await page.locator('[data-home-view=calendar]').click();
      await page.waitForFunction(()=>window.EstudiemosTimetable);
      await settings();await tools.locator('[data-calendar-restore]').click();
      await tools.locator('[data-calendar-settings-status]').filter({hasText:'Calendario recuperado'}).waitFor();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),2);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),1);
      await tools.locator('[data-calendar-edit-schedule]').click();
      await page.evaluate(()=>{window.EstudiemosAccount.getUser=()=>({id:'other-student'});dispatchEvent(new CustomEvent('estudiemos:account-synced'));});
      assert.equal(await dialog.isVisible(),false);
      if(width===1440) {
        const before=await page.evaluate(()=>({agenda:localStorage.bandeja_agenda,weekly:localStorage.bandeja_horarios,backup:localStorage.bandeja_calendario_papelera}));
        await page.evaluate(()=>{window.EstudiemosAccount.refresh=()=>new Promise(resolve=>{window.__releaseRefresh=resolve;});});
        await settings();await tools.locator('[data-calendar-clear]').click();await tools.locator('[data-calendar-cleanup-confirm]').click();
        await page.waitForFunction(()=>typeof window.__releaseRefresh==='function');
        await page.keyboard.press('Escape');await tools.waitFor({state:'hidden'});await settings();
        await page.evaluate(()=>{window.__releaseRefresh(true);window.__releaseRefresh=null;});
        await tools.locator('[data-calendar-tools-close]').click();
        assert.deepEqual(await page.evaluate(()=>({agenda:localStorage.bandeja_agenda,weekly:localStorage.bandeja_horarios,backup:localStorage.bandeja_calendario_papelera})),before,'closing and reopening settings cancels an in-flight cleanup');
        await settings();await tools.locator('[data-calendar-clear]').click();await tools.locator('[data-calendar-cleanup-confirm]').click();
        await page.waitForFunction(()=>typeof window.__releaseRefresh==='function');
        await page.evaluate(()=>{window.EstudiemosAccount.getUser=()=>({id:'third-student'});dispatchEvent(new CustomEvent('estudiemos:account-synced'));window.__releaseRefresh(true);});
        await tools.waitFor({state:'hidden'});
        assert.deepEqual(await page.evaluate(()=>({agenda:localStorage.bandeja_agenda,weekly:localStorage.bandeja_horarios,backup:localStorage.bandeja_calendario_papelera})),before,'an account switch cancels an in-flight cleanup');
      }
      assert.deepEqual(errors,[]);await context.close();console.log('PASS calendar-only editor '+width+': validation, multi-day, edit/delete, persistence, themes, recoverable cleanup and privacy');
    }
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
