const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/compact-tools');
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type','application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      for (const {key,value} of headers) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
      res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    fs.mkdirSync(output, {recursive:true});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = process.env.TEST_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    for (const width of [1440,1024,390,320]) {
      const motion = [1440,390].includes(width);
      const context = await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,reducedMotion:motion?'no-preference':'reduce',timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => {
        const now = new Date(), prefix = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-';
        localStorage.setItem('estudiemos_calendar_view','month');
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify({visible:{focus:true,progress:false,assistant:false,workspace:false,calendar:false,inbox:false,shortcuts:false}}));
        localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{blocks:5,study:59,break:5},currentBlock:4,phase:'study',remaining:3540,running:false,autoStart:true,updatedAt:Date.now()}));
        localStorage.setItem('bandeja_agenda',JSON.stringify([
          {id:'class-1',date:prefix+'05',title:'Clase de Computacion',type:'Clase',horaInicio:'08:00',horaFin:'11:00'},
          {id:'class-2',date:prefix+'05',title:'Clase de Quimica',type:'Clase',horaInicio:'11:30',horaFin:'13:30'},
          {id:'long-class',date:prefix+'06',title:'Clase de Analisis Matematico: integrales multiples y sus aplicaciones',type:'Clase',horaInicio:'10:00',horaFin:'12:30'}
        ]));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/');
      await page.locator('[data-home-skip] svg').waitFor();
      if (motion) await page.locator('[data-study-scene]').waitFor();
      const focus = page.locator('[data-home-space="focus"]');
      for (const [w,h] of width>700?[[240,200],[300,240],[400,260],[520,340]]:[[width-32,240],[width-32,340]]) {
        await focus.evaluate((el,{w,h,desktop}) => { el.style.height=h+'px'; if(desktop){Object.assign(el.style,{left:'0',top:'54px',width:w+'px'});el.dataset.boardCompact=String(h<280);} },{w,h,desktop:width>700});
        await page.waitForTimeout(180);
        const problems = await focus.evaluate(el => {
          const bounds=el.getBoundingClientRect(), clock=el.querySelector('.study-focus__clock').getBoundingClientRect();
          const failures=[];
          for (const node of el.querySelectorAll('[data-home-clock],.study-focus__clock small,.study-focus__clock span,[data-home-reset],[data-home-timer],[data-home-skip],[data-home-adjust],[data-home-timer-state],[data-home-session] summary')) {
            if (!node.getClientRects().length) continue;
            const r=node.getBoundingClientRect();
            if (r.left<bounds.left-1 || r.right>bounds.right+1 || r.top<bounds.top-1 || r.bottom>bounds.bottom+1) failures.push('outside: '+node.outerHTML.slice(0,140));
            if (node.closest('.study-focus__clock') && (r.left<clock.left-1 || r.right>clock.right+1 || r.top<clock.top-1 || r.bottom>clock.bottom+1 || node.scrollWidth>node.clientWidth+1)) failures.push('clock clipped: '+node.textContent);
            if (node.matches('button') && getComputedStyle(node).boxShadow!=='none') failures.push('raised control: '+node.outerHTML.slice(0,100));
            if (node.closest('.study-focus__actions') && r.bottom>el.querySelector('[data-home-session]').getBoundingClientRect().top+1) failures.push('control overlaps settings: '+node.textContent);
          }
          return failures;
        });
        assert.deepEqual(problems,[],`timer and controls must fit at ${width}, tool ${w}x${h}`);
        for (const theme of ['dark','light']) {
          await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
          await focus.screenshot({path:path.join(output,`focus-${width}-${w}x${h}-${theme}.png`)});
        }
      }
      if (motion) {
        const painted=await page.locator('[data-study-scene]').evaluate(canvas=>{
          const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>100)colored++;
          return colored;
        });
        assert.ok(painted>50,'the resized ring must remain visible, not a blank canvas');
      }
      await page.locator('[data-home-skip]').click();
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'break');
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),300);
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),false);
      assert.equal(await page.locator('[data-home-depth]').getAttribute('data-timer-phase'),'break');
      assert.match(await page.locator('[data-home-skip]').getAttribute('aria-label'),/bloque 5/);
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.study-focus__fallback')).borderTopColor==='rgb(251, 188, 4)', null, {timeout:3000});
      assert.equal(await page.locator('.study-focus__fallback').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(251, 188, 4)');
      await page.locator('[data-home-skip]').click();
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().block),5);
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'study');
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().todayMinutes),0);
      await page.locator('[data-home-timer]').click();
      await page.waitForTimeout(350);
      await page.locator('[data-home-skip]').click();
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),true);
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'break');
      await page.locator('[data-home-skip]').click();
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().block),1);
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),true);
      await page.locator('[data-home-timer]').click();
      await page.locator('[data-home-open="pomodoro"]').click();
      await page.locator('[data-pomodoro-skip]').click();
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().phase),'break');
      assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().running),false);
      await page.locator('[data-pomodoro-close]').click();
      await page.evaluate(()=>{
        const value=window.EstudiemosHomeLayout.read();value.visible.focus=false;value.visible.calendar=true;
        window.EstudiemosHomeLayout.write(value);dispatchEvent(new CustomEvent('estudiemos:cloud-restored'));
      });
      if (width<500) await page.locator('[data-home-view="calendar"]').click();
      const calendar=page.locator('[data-dashboard-calendar-widget]');
      await calendar.waitFor({state:'visible'});await page.waitForTimeout(200);
      const busy=calendar.locator('[data-dashboard-date$="-05"]');
      if(width>700) assert.equal(await busy.locator('.dashboard-calendar__month-event').count(),2,'two regular classes must fit in a month cell');
      await calendar.screenshot({path:path.join(output,`calendar-${width}.png`)});
      if(width>700) {
        await calendar.evaluate(el=>{el.style.width='700px';el.style.height='620px';});
        await page.waitForTimeout(200);
        assert.deepEqual(await calendar.locator('.dashboard-calendar__month-event').evaluateAll(nodes=>nodes.filter(node=>{
          const r=node.getBoundingClientRect(),cell=node.closest('[data-dashboard-date]').getBoundingClientRect();
          return r.bottom>cell.bottom+1 || r.right>cell.right+1 || node.scrollWidth>node.clientWidth+1;
        }).map(node=>node.textContent)),[],'resizing must refit every complete preview, not clip titles');
      }
      await busy.click();
      assert.equal(await calendar.locator('.calendar-activity').count(),2);
      assert.match(await calendar.locator('.calendar-activity').last().textContent(),/11:30-13:30/);
      assert.deepEqual(errors,[]);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width>700)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
      console.log(`PASS ${width}: timer fit, flat controls, paused/running skip, shared menu, compact month and resize`);
      await context.close();
    }
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
