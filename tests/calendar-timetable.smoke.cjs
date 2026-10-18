const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/calendar-planner');
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"enabled":false}');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  let browser,lastPage;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=process.env.TEST_BASE_URL||'http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    for(const width of [1440,1024,390,320]){
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Argentina/Buenos_Aires',isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
      context.setDefaultTimeout(15000);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(()=>{
        if(localStorage.getItem('planner_seed'))return;
        localStorage.setItem('planner_seed','1');
        localStorage.setItem('bandeja_horarios','[]');
        localStorage.setItem('bandeja_agenda',JSON.stringify([
          {id:'undated',title:'Una idea sin fecha',date:'',type:'Tarea'},
          {id:'protected',title:'Revisar la alarma',date:'2026-10-19',type:'Tarea',alarm:{date:'2027-01-01',time:'18:00',repeat:'none'}}
        ]));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{'2026-10-18':60},goal:{minutes:45,updatedAt:1}}));
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify({visible:{focus:false,progress:false,assistant:false,shortcuts:false,workspace:false,inbox:false,calendar:true}}));
      });
      const page=await context.newPage(),errors=[];lastPage=page;page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
      await page.clock.setFixedTime(new Date('2026-10-19T15:00:00Z'));
      await page.goto(base+'/');if(width<500)await page.locator('[data-home-view=calendar]').click();
      await page.waitForFunction(()=>window.EstudiemosTimetable&&window.EstudiemosInboxAlarms);
      const calendar=page.locator('[data-dashboard-calendar-widget]'),reader=page.locator('[data-calendar-reader]'),editor=reader.locator('[data-calendar-editor]'),form=editor.locator('form'),tools=page.locator('[data-calendar-tools]');
      const save=async()=>{await form.locator('[type=submit]').click();await editor.waitFor({state:'hidden'});assert.equal(await reader.isVisible(),true);};
      const program=async()=>{await reader.getByRole('tab',{name:'Programar',exact:true}).click();await editor.waitFor({state:'visible'});};
      const pick=async date=>{
        await reader.locator('[data-dashboard-calendar-view=month]').click();
        await reader.locator('[data-dashboard-date="'+date+'"]').click();
      };
      assert.equal(await page.locator('dialog.timetable,[data-timetable-open],[data-calendar-manage-weekly]').count(),0);
      await calendar.getByRole('button',{name:'Programar',exact:true}).click();await editor.waitFor({state:'visible'});
      assert.equal(await form.locator('[name=repeat]').inputValue(),'none');
      await form.locator('[name=title]').fill('Consulta de Física');await form.locator('[name=date]').fill('2026-10-19');
      await form.locator('[name=start]').fill('14:00');await form.locator('[name=end]').fill('15:00');await form.locator('[data-timetable-color=rose]').click();
      await form.locator('[data-timetable-details] summary').click();await form.locator('[name=place]').fill('Aula 203');await save();
      const onceId=await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.title==='Consulta de Física').id);
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.id===id).alarm,onceId),null);
      assert.match(await reader.locator('.calendar-activity.is-colored.timetable-color--rose').textContent(),/14:00-15:00.*Consulta de Física/s);
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-calendar-reader] .calendar-activity.is-colored')).getPropertyValue('--event-color').trim()==='#e6a2b3');
      await program();await form.locator('[name=repeat]').selectOption('weekly');await form.locator('[name=title]').fill('Análisis matemático');
      for(const day of [0,1,2,3,4,5,6])await form.locator('[name=day][value="'+day+'"]').setChecked([1,3,5].includes(day));
      await form.locator('[name=date]').fill('2026-10-19');await form.locator('[name=limited]').check();await form.locator('[name=until]').fill('2026-10-01');
      await form.locator('[type=submit]').click();assert.match(await form.locator('[data-timetable-status]').textContent(),/fecha final/);
      await form.locator('[name=until]').fill('2026-11-13');
      await form.locator('[name=start]').fill('08:00');await form.locator('[name=end]').fill('10:00');await form.locator('[data-timetable-color=blue]').click();
      await form.locator('[data-timetable-details] summary').click();await form.locator('[name=place]').fill('Aula 5');await form.locator('[data-timetable-details] summary').click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),0,'live preview never persists before Save');
      assert.ok(await reader.locator('.dashboard-calendar__event.is-preview').count()>0);
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
        assert.ok(await reader.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        assert.deepEqual(await form.locator('input,select,textarea,strong,button').evaluateAll(nodes=>nodes.filter(n=>n.clientWidth>0&&n.scrollWidth>n.clientWidth+2).map(n=>n.textContent)),[]);
        await reader.screenshot({path:path.join(out,'planner-'+theme+'-'+width+'.png')});
      }
      await save();assert.equal(await reader.locator('.is-preview').count(),0);const weeklyId=await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios)[0].id);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios)[0].endDate),'2026-11-13');
      assert.equal(await reader.locator('.calendar-activity.is-recurring').count(),1);
      await reader.locator('[data-dashboard-calendar-view=month]').click();
      assert.match(await reader.locator('[data-dashboard-date="2026-10-19"]').getAttribute('aria-label'),/Análisis matemático/);
      await reader.locator('[data-dashboard-month-change="1"]').click();
      assert.match(await reader.locator('[data-dashboard-date="2026-11-13"]').getAttribute('aria-label'),/Análisis matemático/);
      assert.doesNotMatch(await reader.locator('[data-dashboard-date="2026-11-16"]').getAttribute('aria-label'),/Análisis matemático/);
      await reader.locator('[data-dashboard-month-change="-1"]').click();await pick('2026-10-19');
      await reader.locator('[data-calendar-edit-schedule="'+weeklyId+'"]').click();
      await form.locator('[name=end]').fill('09:30');await form.locator('[data-timetable-color=violet]').click();await save();
      assert.match(await reader.locator('.calendar-activity.timetable-color--violet').textContent(),/08:00-09:30/);
      await program();await form.locator('[name=repeat]').selectOption('daily');await form.locator('[name=title]').fill('Lectura corta');
      await form.locator('[name=date]').fill('2026-10-20');await form.locator('[name=limited]').check();await form.locator('[name=until]').fill('2026-10-22');
      await form.locator('[name=start]').fill('18:00');await form.locator('[name=end]').fill('18:30');await form.locator('[data-timetable-color=teal]').click();await save();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).find(i=>i.title==='Lectura corta').days.length),7);
      await program();await form.locator('[name=title]').fill('Entregar informe');await form.locator('[name=date]').fill('2026-10-21');
      await form.locator('[name=allDay]').check();await form.locator('[data-timetable-color=amber]').click();await save();
      const deliveryId=await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.title==='Entregar informe').id);
      assert.match(await reader.locator('.calendar-activity.timetable-color--amber').textContent(),/Todo el día.*Entregar informe/s);
      await pick('2026-10-19');await reader.locator('[data-calendar-edit-entry=protected]').click();await form.locator('[name=repeat]').selectOption('weekly');
      await form.locator('[type=submit]').click();assert.match(await form.locator('[data-timetable-status]').textContent(),/Quitá la alarma/);
      await form.locator('[data-timetable-close]').click();await editor.waitFor({state:'hidden'});
      await reader.locator('[data-calendar-edit-entry="'+onceId+'"]').click();await form.locator('[name=repeat]').selectOption('weekly');await save();
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.bandeja_agenda).some(i=>i.id===id),onceId),false);
      await reader.locator('[data-calendar-edit-schedule="'+onceId+'"]').click();await form.locator('[name=repeat]').selectOption('none');await save();
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.bandeja_horarios).some(i=>i.id===id),onceId),false);
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.id===id).color,onceId),'rose');
      await reader.locator('[data-calendar-filter]').selectOption('weekly');assert.equal(await reader.locator('.calendar-activity.is-colored').count(),0);
      await reader.locator('[data-calendar-filter]').selectOption('all');await reader.locator('[data-calendar-colors]').click();
      assert.match(await tools.textContent(),/Análisis matemático.*Lectura corta/s);await tools.locator('[data-calendar-tools-close]').click();
      await reader.screenshot({path:path.join(out,'calendar-'+width+'.png')});
      await pick('2026-10-21');await reader.locator('[data-calendar-edit-day]').click();
      const inbox=page.locator('.agenda-board');await inbox.waitFor({state:'visible'});
      await inbox.locator('[data-agenda-done="'+deliveryId+'"]').check();
      assert.equal(await page.evaluate(id=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.id===id).color,deliveryId),'amber');
      await inbox.locator('[data-agenda-filter=pending]').click();assert.equal(await inbox.locator('.agenda-item.is-recurring').count(),0);await inbox.locator('[data-agenda-close]').click();
      await page.waitForFunction(()=>document.querySelector('.agenda-board').getAttribute('aria-hidden')==='true');await page.reload();if(width<500)await page.locator('[data-home-view=calendar]').click();await page.waitForFunction(()=>window.EstudiemosTimetable);
      await calendar.getByRole('button',{name:'Programar',exact:true}).click();await form.locator('[name=title]').fill('<img src=x onerror="window.__xss=true">');
      assert.equal(await editor.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
      await form.locator('[data-timetable-close]').click();await reader.locator('[data-calendar-reader-close]').click();
      assert.equal(await reader.locator('.is-preview').count(),0,'cancel and close discard the unsaved preview');
      await calendar.locator('[data-calendar-settings]').click();await tools.locator('[data-calendar-clear]').click();await tools.locator('[data-calendar-cleanup-confirm]').click();
      await tools.locator('[data-calendar-settings-status]').filter({hasText:'Calendario vacío'}).waitFor();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).length),0);
      await tools.locator('[data-calendar-restore]').click();await tools.locator('[data-calendar-settings-status]').filter({hasText:'Calendario recuperado'}).waitFor();
      await tools.locator('[data-calendar-tools-close]').click();await calendar.getByRole('button',{name:'Programar',exact:true}).click();
      await page.evaluate(()=>{window.EstudiemosAccount.getUser=()=>({id:'other'});dispatchEvent(new CustomEvent('estudiemos:account-synced'));});
      assert.equal(await reader.isVisible(),false);
      await page.goto(base+'/widget.html?view=calendar');await page.locator('.widget-calendar').waitFor({state:'visible'});
      await page.locator('[data-widget-calendar-view=week]').click();
      assert.ok(await page.locator('.calendar-entry.is-recurring.timetable-color--violet').count()>0);
      assert.ok(await page.locator('.calendar-entry.is-colored.timetable-color--rose').count()>0);
      assert.deepEqual(errors,[]);await context.close();console.log('PASS integrated planner '+width+': one-off/daily/weekly, finite period, colors, inline editing, safe conversion, Inbox, cleanup, ownership and widgets');
    }
  }catch(error){
    if(lastPage&&!lastPage.isClosed()){
      await lastPage.screenshot({path:path.join(out,'failure.png')});
      console.error(await lastPage.locator('[data-calendar-reader]').evaluate(el=>({editing:el.dataset.editing,activities:[...el.querySelectorAll('.calendar-activity')].map(n=>({text:n.textContent,color:getComputedStyle(n).getPropertyValue('--event-color')})),status:el.querySelector('[data-timetable-status]')?.textContent})));
    }throw error;
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
