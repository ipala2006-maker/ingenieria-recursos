const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/calendar-timetable');
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
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=process.env.TEST_BASE_URL||'http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    for(const width of [1440,1024,390,320]){
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Argentina/Buenos_Aires',isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
        return route.continue();
      });
      await context.addInitScript(()=>{
        if(localStorage.getItem('calendar_seeded'))return;
        const now=new Date(),date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const days=[now.getDay(),(now.getDay()+1)%7];
        localStorage.setItem('calendar_seeded','1');
        localStorage.setItem('bandeja_horarios',JSON.stringify([
          {id:'algebra',title:'Álgebra',days,start:'08:00',end:'10:00',place:'Aula 203',color:'blue'},
          {id:'coding',title:'Programación',days,start:'11:00',end:'13:00',place:'Laboratorio',color:'teal'}
        ]));
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'dated',title:'Entregar informe',type:'Entrega',date,horaInicio:'16:00',done:false}]));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:45,updatedAt:1}}));
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify({visible:{focus:false,progress:false,assistant:false,shortcuts:false,workspace:false,inbox:false,calendar:true}}));
        localStorage.setItem('estudiemos_calendar_view','month');
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/');
      if(width<500)await page.locator('[data-home-view=calendar]').click();
      const calendar=page.locator('[data-dashboard-calendar-widget]');await calendar.waitFor({state:'visible'});
      await page.waitForFunction(()=>window.EstudiemosTimetable&&window.EstudiemosInboxAlarms);
      const today=await page.evaluate(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;});
      await calendar.locator('[data-dashboard-date="'+today+'"]').click();
      assert.equal(await calendar.locator('.calendar-activity').count(),3);
      assert.equal(await calendar.locator('.calendar-activity.is-recurring').count(),2);
      assert.equal(await calendar.locator('.calendar-activity.is-recurring input,.calendar-activity.is-recurring [data-inbox-alarm-id]').count(),0);
      assert.match(await calendar.locator('.timetable-color--teal').textContent(),/11:00-13:00.*Horario fijo.*Programación/s);
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
        await calendar.screenshot({path:path.join(out,'day-'+theme+'-'+width+'.png')});
        assert.deepEqual(await calendar.locator('h4,.calendar-activity__note').evaluateAll(nodes=>nodes.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)),[]);
      }
      await calendar.locator('[data-calendar-filter]').selectOption('weekly');assert.equal(await calendar.locator('.calendar-activity').count(),2);
      await calendar.locator('[data-calendar-filter]').selectOption('dated');assert.equal(await calendar.locator('.calendar-activity').count(),1);
      await calendar.locator('[data-calendar-filter]').selectOption('all');
      await calendar.locator('[data-calendar-colors]').click();
      const tools=page.locator('[data-calendar-tools]');await tools.waitFor({state:'visible'});
      assert.match(await tools.textContent(),/Álgebra.*Programación.*Examen.*Tarea/s);await tools.locator('[data-calendar-tools-close]').click();
      await calendar.locator('[data-calendar-edit-schedule=algebra]').click();
      const timetable=page.locator('[data-timetable]'),form=timetable.locator('form');
      await timetable.waitFor({state:'visible'});assert.equal(await form.locator('[name=title]').inputValue(),'Álgebra');
      await form.locator('[name=start]').fill('09:00');await form.locator('[data-timetable-color=rose]').click();await form.locator('[type=submit]').click();await timetable.locator('[data-timetable-close]').click();
      assert.match(await calendar.locator('.calendar-activity.timetable-color--rose').textContent(),/09:00-10:00/);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),1);
      await calendar.locator('[data-calendar-expand]').click();const reader=page.locator('[data-calendar-reader]');await reader.waitFor({state:'visible'});
      assert.equal(await reader.locator('.calendar-activity').count(),3);
      await reader.locator('[data-calendar-add]').click();await tools.locator('[data-calendar-add-weekly]').click();
      await form.locator('[name=title]').fill('Física');await form.locator('[name=start]').fill('14:00');await form.locator('[name=end]').fill('15:30');await form.locator('[type=submit]').click();await timetable.locator('[data-timetable-close]').click();
      assert.equal(await reader.locator('.calendar-activity').count(),4);
      await reader.screenshot({path:path.join(out,'expanded-'+width+'.png')});
      await reader.locator('[data-calendar-add]').click();await tools.locator('[data-calendar-add-note]').click();
      const note=page.locator('[data-quick-note-form]');await note.waitFor({state:'visible'});assert.equal(await note.locator('[name=inboxNoteDate]').inputValue(),today);
      assert.equal(await note.locator('[name=inboxDateEnabled]').isChecked(),true);assert.equal(await note.locator('[name=inboxAlarmEnabled]').isChecked(),false);
      await note.locator('[name=title]').fill('Repasar guía');await note.locator('[type=submit]').click();
      await page.waitForFunction(()=>JSON.parse(localStorage.bandeja_agenda).length===2);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.title==='Repasar guía').date),today);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).find(i=>i.title==='Repasar guía').alarm),null);
      await calendar.locator('[data-dashboard-calendar-view=month]').click();
      await calendar.locator('[data-calendar-filter]').selectOption('weekly');
      assert.match(await calendar.locator('[data-dashboard-date="'+today+'"]').getAttribute('aria-label'),/Álgebra.*Programación.*Física/s);
      assert.doesNotMatch(await calendar.locator('[data-dashboard-date="'+today+'"]').getAttribute('aria-label'),/Entregar informe/);
      await calendar.screenshot({path:path.join(out,'month-'+width+'.png')});
      await calendar.locator('[data-dashboard-calendar-view=week]').click();await calendar.screenshot({path:path.join(out,'week-'+width+'.png')});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.evaluate(()=>{
        const schedules=JSON.parse(localStorage.bandeja_horarios);schedules.find(s=>s.id==='coding').title='Programación actualizada';
        localStorage.setItem('bandeja_horarios',JSON.stringify(schedules));dispatchEvent(new CustomEvent('estudiemos:data-change',{detail:{key:'bandeja_horarios'}}));
      });
      await calendar.locator('[data-dashboard-date="'+today+'"]').click();assert.match(await calendar.textContent(),/Programación actualizada/);
      const physicsId=await page.evaluate(()=>JSON.parse(localStorage.bandeja_horarios).find(item=>item.title==='Física').id);
      await calendar.locator('[data-calendar-edit-schedule="'+physicsId+'"]').click();
      await timetable.locator('.timetable__day.is-selected [data-timetable-delete="'+physicsId+'"]').click();
      await timetable.locator('[data-timetable-close]').click();
      assert.equal(await calendar.locator('.calendar-activity.is-recurring').count(),2);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.bandeja_agenda).length),2,'deleting a weekly schedule never deletes dated notes');
      await calendar.locator('[data-calendar-filter]').selectOption('all');await calendar.locator('[data-calendar-edit-day]').click();
      const inbox=page.locator('.agenda-board');await inbox.waitFor({state:'visible'});
      assert.equal(await inbox.locator('.agenda-item.is-recurring').count(),2);assert.match(await inbox.locator('#agendaList').textContent(),/Repasar guía/);
      await inbox.locator('[data-agenda-filter=pending]').click();assert.equal(await inbox.locator('.agenda-item.is-recurring').count(),0);
      await inbox.locator('[data-agenda-close]').click();
      await page.goto(base+'/widget.html?view=calendar');await page.locator('.widget-calendar').waitFor({state:'visible'});
      assert.match(await page.locator('.widget-calendar').textContent(),/Programación actualizada/);assert.ok(await page.locator('.calendar-entry.is-recurring').count()>0);
      assert.deepEqual(errors,[]);await context.close();console.log('PASS integrated calendar '+width+': projections, colors, filters, create/edit, note date, live sync, Inbox and PC widget');
    }
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
