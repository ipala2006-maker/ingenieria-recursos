const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/note-entry');
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('bandeja_agenda') || '[]'));
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"enabled":false}');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file)]){res.writeHead(404).end();return;}
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',types[path.extname(file)]);res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port, engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';
    browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const width of [1440,390,320]){
      const context=await browser.newContext({viewport:{width,height:width<500?844:900},isMobile:width<500,hasTouch:width<500,timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      await context.addInitScript(()=>{
        const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);yesterday.setHours(18,0,0,0);
        if(!localStorage.getItem('estudiemos_pomodoro_streak'))localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        if(!localStorage.getItem('estudiemos_pomodoro'))localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{study:59,break:5,blocks:4},phase:'study',running:true,remaining:3540,endAt:yesterday.getTime()+3540000,studyCreditAt:yesterday.getTime(),updatedAt:yesterday.getTime(),autoStart:true}));
        if('Notification'in window)Notification.requestPermission=async()=>'denied';
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(()=>window.EstudiemosStudy&&window.EstudiemosNoteEntry);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().todayMinutes),0);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),false);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.history().at(-2).minutes),59);
      // Do not reseed history on this reload: a second visit must not credit the expired block twice.
      await page.reload(); await page.waitForFunction(()=>window.EstudiemosStudy);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().todayMinutes),0);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),false);
      assert.equal(await page.evaluate(()=>EstudiemosStudy.history().at(-2).minutes),59);
      const quick=page.locator('[data-quick-note-form]'),date='2030-12-20';
      await page.locator('[data-quick-note-open]').first().click();
      await quick.locator('[name=inboxDateEnabled]').waitFor({state:'attached'});
      await quick.locator('[data-note-continue]').waitFor();
      await quick.locator('[name=title]').fill('Primera del mismo día');
      await quick.locator('[name=inboxDateEnabled]').check();await quick.locator('[name=inboxNoteDate]').fill(date);
      await quick.getByRole('radio',{name:'Turquesa',exact:true}).check();
      await quick.locator('[name=title]').press('Shift+Enter');
      assert.equal((await read(page))[0].date,date);
      assert.equal(await quick.locator('[name=inboxNoteDate]').inputValue(),date);
      assert.equal(await quick.getByRole('radio',{name:'Turquesa',exact:true}).isChecked(),true);
      assert.equal(await quick.locator('[name=title]').inputValue(),'');
      assert.equal(await quick.locator('[name=title]').evaluate(el=>el===document.activeElement),true);
      await quick.locator('[name=title]').fill('Segunda del mismo día');await quick.locator('[name=title]').press('Enter');
      await page.locator('[data-quick-panel=note]').waitFor({state:'hidden'});
      assert.equal((await read(page))[0].date,date);assert.equal((await read(page))[0].color,'teal');
      await page.locator('[data-quick-note-open]').first().click();
      await quick.locator('[name=title]').fill('Sin fecha desde botón');await quick.locator('[data-note-continue]').click();
      assert.equal((await read(page))[0].date,'');assert.equal((await read(page))[0].alarm,null);
      await quick.locator('[name=title]').fill('Sin fecha desde teclado');await quick.locator('[name=title]').press('Shift+Enter');
      assert.equal((await read(page))[0].date,'');assert.equal(await quick.isVisible(),true);
      const before=(await read(page)).length;
      await quick.locator('[name=title]').press('Shift+Enter');assert.equal((await read(page)).length,before);
      await quick.locator('[name=title]').fill('Composición');
      assert.equal(await quick.locator('[name=title]').evaluate(el=>{const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;}),false);
      assert.equal((await read(page)).length,before);
      await quick.locator('[name=inboxDateEnabled]').check();await quick.locator('[name=inboxNoteDate]').fill('');
      await quick.locator('[name=title]').press('Shift+Enter');assert.equal((await read(page)).length,before);
      await quick.locator('[name=inboxDateEnabled]').uncheck();
      await quick.locator('[name=title]').evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertLineBreak',bubbles:true,cancelable:true})));
      assert.equal((await read(page)).length,before+1);assert.equal(await quick.isVisible(),true);
      await quick.locator('[name=title]').fill('Con alarma propia');
      await quick.locator('[name=inboxAlarmEnabled]').check();
      await quick.locator('[name=inboxAlarmDate]').fill(date);await quick.locator('[name=inboxAlarmTime]').fill('18:30');
      await quick.locator('[name=title]').press('Shift+Enter');
      assert.equal((await read(page))[0].alarm.time,'18:30');
      assert.equal(await quick.locator('[name=inboxAlarmEnabled]').isChecked(),false,'the next task must not inherit an alarm');
      await page.locator('[data-quick-panel=note] [data-quick-panel-close]').click();await quick.waitFor({state:'hidden'});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos:open-agenda')));await page.locator('[data-agenda-create]').click();
      const manual=page.locator('#agendaForm');
      await manual.locator('[name=inboxDateEnabled]').check();await manual.locator('[name=inboxNoteDate]').fill(date);
      await manual.locator('#agendaTitle').fill('Inbox uno');await manual.locator('#agendaTitle').press('Shift+Enter');
      await manual.locator('#agendaTitle').fill('Inbox dos');await manual.locator('#agendaTitle').press('Enter');
      const inbox=(await read(page)).filter(item=>item.title.startsWith('Inbox '));
      assert.equal(inbox.length,2);assert.ok(inbox.every(item=>item.date===date));assert.notEqual(inbox[0].id,inbox[1].id);
      await page.locator('[data-agenda-close]').click();
      await page.evaluate(()=>window.EstudiemosTimetable.open({date:'2030-12-20'}));
      const planner=page.locator('[data-timetable-form]');await planner.waitFor({state:'visible'});
      await planner.locator('[name=allDay]').check();await planner.locator('[data-timetable-color=rose]').click();
      await planner.locator('[name=title]').fill('Calendario uno');await planner.locator('[name=title]').press('Shift+Enter');
      assert.equal(await planner.isVisible(),true);assert.equal(await planner.locator('[name=date]').inputValue(),date);
      assert.equal(await planner.locator('[name=color]').inputValue(),'rose');
      await planner.locator('[name=title]').fill('Calendario dos');await planner.locator('[name=title]').press('Enter');
      assert.equal((await read(page)).filter(item=>item.title.startsWith('Calendario ')).length,2);
      await page.locator('[data-calendar-reader-close]').click();
      await page.locator('[data-quick-note-open]').first().click();await quick.locator('[name=title]').fill('Seguir anotando');
      await page.screenshot({path:path.join(output,`${engine}-${width}.png`)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.ok(await quick.locator('[data-note-continue]').evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth;}));
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine} ${width}: Enter, Shift+Enter, mobile continue, date/color retained, IME/validation, all three forms, expired study stays yesterday`);
      await context.close();
    }
    const midnight=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
    await midnight.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await midnight.addInitScript(()=>{
      const RealDate=Date; window.__studyClock=new RealDate('2026-10-19T23:59:30').getTime();
      window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[window.__studyClock]));}static now(){return window.__studyClock;}};
      localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
      localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{study:25,break:5,blocks:4},phase:'study',running:true,remaining:1500,endAt:Date.now()+1500000,studyCreditAt:Date.now(),updatedAt:Date.now(),autoStart:false}));
    });
    const overnight=await midnight.newPage();await overnight.goto(base);await overnight.waitForFunction(()=>window.EstudiemosStudy);
    await overnight.evaluate(()=>{window.__studyClock+=90000;});
    await overnight.waitForFunction(()=>EstudiemosStudy.snapshot().todayMinutes===1);
    assert.deepEqual(await overnight.evaluate(()=>JSON.parse(localStorage.getItem('estudiemos_pomodoro_streak')).carrySeconds),{'2026-10-19':30,'2026-10-20':0});
    assert.equal(await overnight.evaluate(()=>EstudiemosStudy.snapshot().running),true);
    console.log(`PASS ${engine}: real running timer crosses midnight, credits 30 seconds yesterday and 1 minute today`);
    await midnight.close();
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
