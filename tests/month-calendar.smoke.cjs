const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/month-calendar');
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      for (const { key, value } of headers) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = process.env.TEST_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
    for (const width of process.env.CALENDAR_FIT_ONLY ? [] : [1440, 1024, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/Argentina/Buenos_Aires', isMobile: width < 500, hasTouch: width < 500, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => {
        const now = new Date(), prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-';
        const day = n => prefix + String(n).padStart(2, '0');
        const items = [
          { id: 'class', title: 'Clase de Algebra', type: 'Clase', date: day(5), horaInicio: '08:00', horaFin: '10:00' },
          { id: 'exam', title: 'Parcial de Fisica', type: 'Parcial', date: day(5), horaInicio: '11:30' },
          { id: 'task', title: 'Entregar el informe', type: 'Tarea', date: day(5) },
          { id: 'long', title: 'Repasar integrales y resolver todos los ejercicios de la guia', subject: 'Analisis matematico', note: 'Resolver los ejercicios 4 al 18.\nLlevar las dudas a la consulta con el profesor.', alarm: {date: day(5), time: '18:00', repeat: 'none'}, type: 'Tarea', date: day(5), horaInicio: '18:30' },
          { id: 'unsafe', title: '<img src=x onerror="window.__xss=true">', type: 'Tarea', date: day(5) },
          { id: 'done', title: 'Guia terminada', type: 'Tarea', date: day(12), done: true },
          { id: 'long-class', title: 'Clase de Analisis Matematico: integrales multiples y aplicaciones', type: 'Clase', date: day(6), horaInicio: '08:00', horaFin: '11:00' },
          { id: 'bad-date', title: 'Fecha invalida', type: 'Tarea', date: {} }
        ];
        localStorage.setItem('bandeja_agenda', JSON.stringify(items));
        localStorage.setItem('estudiemos_calendar_view', 'month');
        localStorage.setItem('estudiemos_home_layout_local', JSON.stringify({ visible: { focus:false, progress:false, assistant:false, shortcuts:false, workspace:false, inbox:false, calendar:true } }));
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({ days: { [day(5)]: 30 } }));
        history.replaceState({homeView:'space'}, '');
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/');
      const calendar = page.locator('[data-dashboard-calendar-widget]');
      if (width < 500) {
        assert.equal(await page.locator('[data-home-view="overview"]').getAttribute('aria-selected'),'true');
        await page.locator('[data-home-view="calendar"]').click();
      }
      await calendar.waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      if (width < 500) await page.locator('[data-home-view="overview"]').click();
      await page.locator('[data-home-customize]').click();
      await page.locator('.home-layout-manage').click();
      const tools = page.locator('[data-home-customizer]');
      assert.equal(await tools.locator('input[value="assistant"],input[value="workspace"]').count(), 0);
      assert.doesNotMatch(await tools.innerText(), /Organizador IA|Mi espacio/);
      await tools.locator('.home-customizer__done').click();
      await page.locator('.home-layout-done').click();
      if (width < 500) await page.locator('[data-home-view="calendar"]').click();
      const expectedCells = await page.evaluate(() => { const d = new Date(); return Math.ceil((((new Date(d.getFullYear(), d.getMonth(), 1).getDay()+6)%7) + new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()) / 7) * 7; });
      assert.equal(await calendar.locator('[data-dashboard-date]').count(), expectedCells);
      assert.match(await calendar.locator('[data-calendar-legend]').textContent(), /7 actividades este mes/);
      const prefix = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-'; });
      const busy = calendar.locator('[data-dashboard-date="' + prefix + '05"]');
      assert.match(await busy.getAttribute('aria-label'), /Clase de Algebra/);
      assert.equal(await busy.evaluate(el => getComputedStyle(el, '::after').display), 'none');
      assert.equal(await calendar.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      const capacity = Number(await calendar.locator('[data-dashboard-calendar]').getAttribute('data-month-capacity'));
      if (capacity) {
        assert.ok(await busy.locator('.dashboard-calendar__month-event').count() > 0);
        assert.match(await busy.textContent(), /08:00.*Clase de Algebra/);
        assert.match(await busy.textContent(), /\+\d+ más/);
      } else {
        assert.match(await busy.locator('.dashboard-calendar__count').textContent(), /5/);
      }
      const empty = calendar.locator('[data-dashboard-date="' + prefix + '04"]');
      assert.equal(await empty.locator('.dashboard-calendar__month-event,.dashboard-calendar__count').count(), 0);
      assert.deepEqual(await calendar.locator('.dashboard-calendar__month-event').evaluateAll(nodes => nodes.filter(node => {
        const cell = node.closest('[data-dashboard-date]').getBoundingClientRect(), rect = node.getBoundingClientRect();
        return rect.bottom > cell.bottom+1 || rect.right > cell.right+1 || node.scrollWidth > node.clientWidth+1;
      }).map(node => node.textContent)), [], 'month previews must fit completely, never show partial titles');
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
        await page.waitForTimeout(120);
        await calendar.screenshot({ path: path.join(output, theme + '-' + width + '.png') });
        assert.equal(await page.evaluate(() => { window.scrollTo(100, scrollY); return scrollX; }), 0);
      }
      await busy.focus(); await page.keyboard.press('Enter');
      const reader = page.locator('[data-calendar-reader]');
      assert.equal(await reader.isVisible(), false);
      assert.equal(await calendar.getAttribute('data-view'), 'schedule');
      assert.equal(await calendar.locator('.calendar-activity').count(), 5);
      assert.match(await calendar.locator('.calendar-activity.is-class').textContent(), /08:00-10:00/);
      assert.deepEqual(await calendar.locator('h4,.calendar-activity__note').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth+1 || node.scrollHeight > node.clientHeight+1).map(node => node.textContent)), [], 'inline schedule titles and notes must never be clipped');
      await calendar.screenshot({path:path.join(output, 'schedule-light-'+width+'.png')});
      await calendar.locator('[data-calendar-schedule-input]').fill(prefix+'04');
      assert.match(await calendar.locator('[data-dashboard-calendar]').textContent(), /No hay actividades/);
      await calendar.locator('[data-dashboard-month-change="1"]').click();
      assert.equal(await calendar.locator('[data-calendar-schedule-input]').inputValue(), prefix+'05');
      await calendar.locator('[data-calendar-schedule-input]').fill(prefix+'05');
      await calendar.locator('[data-calendar-expand]').click();
      await reader.waitFor({ state: 'visible' });
      assert.match(await reader.locator('#calendarDayTitle').textContent(), /5/);
      assert.equal(await reader.locator('.calendar-activity').count(), 5);
      assert.match(await reader.locator('.calendar-activity.is-class').textContent(), /08:00-10:00/);
      assert.match(await reader.locator('.calendar-activity__note').textContent(), /ejercicios 4 al 18.*\nLlevar las dudas/);
      assert.match(await reader.locator('.calendar-activity__subject').textContent(), /Analisis matematico/);
      assert.match(await reader.locator('.calendar-activity__alarm').textContent(), /18:00/);
      await reader.locator('[data-inbox-alarm-id="long"]').click();
      await page.locator('.inbox-alarm-dialog:not(.alarm-setup)').waitFor({state:'visible'});
      await page.locator('[data-alarm-close]').click();
      assert.equal(await reader.isVisible(), true);
      assert.equal(await reader.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.deepEqual(await reader.locator('h4,.calendar-activity__note').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).map(node => node.textContent)), [], 'full text must wrap without clipping');
      await reader.screenshot({ path: path.join(output, 'reader-light-' + width + '.png') });
      await page.evaluate(() => window.EstudiemosTheme.set('dark'));
      await page.waitForTimeout(400);
      await reader.screenshot({ path: path.join(output, 'reader-dark-' + width + '.png') });
      const checkbox = reader.locator('[data-dashboard-agenda-done="long"]');
      await checkbox.check();
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.bandeja_agenda).find(item => item.id === 'long').done), true);
      await reader.locator('[data-dashboard-date="' + prefix + '04"]').click();
      assert.match(await reader.locator('[data-calendar-day-items]').textContent(), /No hay actividades/);
      await page.keyboard.press('Escape');
      assert.equal(await reader.isVisible(), false);
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-calendar-expand'));
      await calendar.locator('[data-calendar-expand]').click();
      await reader.locator('[data-calendar-edit-day]').click();
      await page.locator('body.agenda-open .agenda-board').waitFor();
      await page.locator('[data-agenda-close]').click();
      await calendar.locator('[data-dashboard-calendar-view="month"]').click();
      if (width > 500) {
        await calendar.evaluate(el => { el.style.width = '360px'; });
        await page.waitForFunction(() => document.querySelector('[data-dashboard-calendar]').dataset.monthCapacity === '0');
        assert.match(await busy.locator('.dashboard-calendar__count').textContent(), /5/);
      }
      await busy.click();
      await calendar.locator('[data-dashboard-calendar-view="week"]').click();
      assert.equal(await calendar.locator('[data-dashboard-date]').count(), 7);
      assert.equal(await calendar.locator('[data-calendar-legend]').isVisible(), false);
      await calendar.screenshot({ path: path.join(output, 'week-' + width + '.png') });
      await busy.click();
      assert.match(await calendar.locator('h4').allTextContents().then(titles => titles.join(' ')), /Repasar integrales y resolver todos los ejercicios de la guia/);
      await calendar.screenshot({path:path.join(output, 'schedule-dark-'+width+'.png')});
      await page.goto(base + '/instalar.html?local=1');
      assert.deepEqual(await page.locator('[data-tour-target]').evaluateAll(nodes => nodes.map(el => el.dataset.tourTarget)), ['inbox','calendar','focus','progress']);
      assert.equal(await page.locator('.widget-gallery__item').count(), 4);
      assert.doesNotMatch(await page.locator('body').innerText(), /Mi espacio|Trabajar con la IA|WhatsApp/);
      for (const target of ['inbox', 'calendar', 'focus', 'progress']) {
        await page.locator('[data-tour-target="' + target + '"]').click();
        await page.waitForTimeout(750);
        const scene = page.locator('[data-scene="' + target + '"]');
        assert.equal(await scene.getAttribute('aria-hidden'), 'false');
        for (const theme of ['dark', 'light']) {
          await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
          await page.locator('.product-tour__visual').screenshot({ path: path.join(output, 'tour-' + target + '-' + theme + '-' + width + '.png') });
        }
        const clipped = await scene.evaluate(el => [...el.querySelectorAll('h3, p, time, .scene-alarm, .scene-week')].filter(node => { const r = node.getBoundingClientRect(), b = el.getBoundingClientRect(); return r.bottom > b.bottom + 1 || r.right > b.right + 1; }).map(node => node.className));
        assert.deepEqual(clipped, [], 'scene content must fit: ' + target + ' at ' + width);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width === 1440 && process.env.TEST_WEBKIT !== '1' && process.env.UPDATE_INSTALL_PREVIEW === '1') {
        await page.setViewportSize({ width: 1200, height: 630 });
        await page.goto(base + '/instalar.html?local=1');
        await page.evaluate(() => {
          document.querySelectorAll('.install-header,.journey-rail,.install-hero__scroll,.install-hero__actions,.install-hero__sync').forEach(el => el.remove());
          const hero = document.querySelector('.install-hero');
          Object.assign(hero.style, { padding: '24px 60px 0', minHeight: '630px', height: '630px', gap: '18px' });
          Object.assign(document.querySelector('.install-hero__content').style, { padding: '0', margin: '0' });
          Object.assign(document.querySelector('.hero-product').style, { height: '430px', width: '1080px', margin: '0', transform: 'none' });
          Object.assign(document.querySelector('#heroTitle').style, { fontSize: '64px', margin: '4px 0 12px' });
          document.querySelector('.demo-toolbar').remove();
          Object.assign(document.querySelector('.demo-dashboard').style, { padding:'10px 20px' });
          Object.assign(document.querySelector('.demo-space').style, { padding:'10px 14px' });
          document.querySelectorAll('.demo-task-list p').forEach(el => el.style.padding = '8px 0');
          Object.assign(document.querySelector('.demo-focus-summary').style, { marginTop:'12px',paddingTop:'10px' });
          Object.assign(document.querySelector('.demo-side').style, { gridTemplateRows:'minmax(0,1.4fr) minmax(0,.6fr)' });
          document.querySelectorAll('.demo-side>section').forEach(el => el.style.padding = '10px');
          document.querySelector('.demo-inbox header').style.marginBottom = '7px';
          document.querySelector('.demo-progress').style.gap = '6px';
          document.querySelector('.demo-progress').style.lineHeight = '1.2';
          document.querySelectorAll('.demo-progress b').forEach(el => el.style.fontSize = '14px');
        });
        await page.screenshot({ path: path.join(root, 'assets/install/free-launch-preview.png') });
      }
      assert.deepEqual(errors, []);
      console.log('PASS readable month, resize, safe titles, day agenda and available-feature tour at ' + width);
      await context.close();
    }
    for (const [width, height] of [[1440,768], [1280,720], [390,667], [320,568]]) {
      const context = await browser.newContext({ viewport: {width, height}, timezoneId: 'America/Argentina/Buenos_Aires', isMobile: width < 500, hasTouch: width < 500, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => {
        const d = new Date(), date = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        localStorage.setItem('estudiemos_calendar_view', 'month');
        localStorage.setItem('estudiemos_home_layout_local', JSON.stringify({visible:{assistant:true,workspace:true},sizes:{assistant:{mobileHeight:456},workspace:{mobileHeight:543}}}));
        localStorage.setItem('bandeja_agenda', JSON.stringify(Array.from({length:30}, (_, i) => ({ id:'dense-'+i, title:'Actividad '+i+' con un titulo completo para leer sin recortes', subject:'Materia de prueba', date, type:'Tarea', note:'Informacion completa de la actividad '+i, horaInicio:'10:00', horaFin:'11:00' }))));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/');
      const calendar = page.locator('[data-dashboard-calendar-widget]');
      if (await page.locator('[data-home-view="calendar"]').isVisible()) await page.locator('[data-home-view="calendar"]').click();
      await calendar.waitFor({state:'visible'});
      await page.waitForTimeout(300);
      assert.equal(await page.locator('[data-home-space="assistant"]').isVisible(),false);
      assert.equal(await page.locator('[data-home-space="workspace"]').isVisible(),false);
      assert.equal(await page.locator('[data-home-shortcut="space"]').isVisible(),false);
      if (width < 500) {
        await page.locator('[data-home-view="overview"]').click();
        await page.locator('[data-home-view="overview"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('[data-home-view="calendar"]').getAttribute('aria-selected'),'true');
        await page.locator('[data-home-view="overview"]').click();
      }
      await page.locator('[data-home-customize]').click();
      await page.locator('.home-layout-manage').click();
      await page.locator('[data-home-customizer] label:has([name="homeDensity"][value="compact"])').click();
      const retained = await page.evaluate(() => JSON.parse(localStorage.estudiemos_home_layout_local));
      assert.equal(retained.visible.assistant,true); assert.equal(retained.visible.workspace,true);
      assert.equal(retained.sizes.assistant.mobileHeight,456); assert.equal(retained.sizes.workspace.mobileHeight,543);
      await page.locator('[data-home-customizer] .home-customizer__done').click();
      await page.locator('.home-layout-done').click();
      if (width < 500) await page.locator('[data-home-view="calendar"]').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      if (width > 700) assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight+1), 'desktop board must still fit the screen');
      await calendar.screenshot({path:path.join(output, `default-${width}x${height}.png`)});
      const rowsFit = () => calendar.locator('[data-dashboard-calendar]').evaluate(grid => {
        const bounds = grid.getBoundingClientRect();
        return [...grid.querySelectorAll('[data-dashboard-date]')].every(day => { const rect = day.getBoundingClientRect(); return rect.bottom <= bounds.bottom+1 && rect.right <= bounds.right+1; });
      });
      assert.ok(await rowsFit(), 'every day of the month must fit the small tool');
      await calendar.locator('[data-calendar-expand]').click();
      const reader = page.locator('[data-calendar-reader]');
      assert.equal(await reader.locator('.calendar-activity').count(), 30);
      const last = reader.locator('[data-dashboard-agenda-done="dense-29"]');
      await last.check();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.bandeja_agenda).at(-1).done), true);
      const updatedTitle = 'Actividad actualizada desde otro dispositivo';
      await page.evaluate(title => {
        const items = JSON.parse(localStorage.bandeja_agenda); items[0].title = title;
        localStorage.setItem('bandeja_agenda', JSON.stringify(items));
        dispatchEvent(new CustomEvent('estudiemos:data-change', {detail:{key:'bandeja_agenda'}}));
      }, updatedTitle);
      assert.equal(await reader.locator('h4').first().textContent(), updatedTitle);
      await reader.locator('[data-calendar-reader-close]').click();
      await calendar.locator('[data-dashboard-month-change="1"]').click();
      const nextMonthCells = await page.evaluate(() => { const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth()+1, 1); return Math.ceil((((first.getDay()+6)%7) + new Date(first.getFullYear(), first.getMonth()+1, 0).getDate())/7)*7; });
      assert.equal(await calendar.locator('[data-dashboard-date]').count(), nextMonthCells);
      await page.waitForTimeout(250);
      if (!(await rowsFit())) {
        console.log(await calendar.locator('[data-dashboard-calendar]').evaluate(grid => ({ height:grid.clientHeight, dataset:{...grid.dataset}, rows:getComputedStyle(grid).gridTemplateRows, clippedDates:[...grid.children].filter(day => day.getBoundingClientRect().bottom > grid.getBoundingClientRect().bottom+1).map(day => day.dataset.dashboardDate) })));
        await calendar.screenshot({path:path.join(output, `next-month-${width}x${height}.png`)});
      }
      assert.ok(await rowsFit(), 'next month must fit too');
      await calendar.locator('[data-dashboard-calendar-view="week"]').click();
      await page.waitForTimeout(250);
      assert.ok(await rowsFit(), 'all seven days must fit the small tool');
      await calendar.screenshot({path:path.join(output, `default-week-${width}x${height}.png`)});
      assert.deepEqual(errors, []);
      console.log(`PASS default board, short viewport, 30 complete activities and live changes at ${width}x${height}`);
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
