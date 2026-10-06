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
    for (const width of [1440, 1024, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/Argentina/Buenos_Aires', isMobile: width < 500, hasTouch: width < 500, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => {
        const now = new Date(), prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-';
        const day = n => prefix + String(n).padStart(2, '0');
        const items = [
          { id: 'class', title: 'Clase de Algebra', type: 'Clase', date: day(5), horaInicio: '08:00', horaFin: '10:00' },
          { id: 'exam', title: 'Parcial de Fisica', type: 'Parcial', date: day(5), horaInicio: '11:30' },
          { id: 'task', title: 'Entregar el informe', type: 'Tarea', date: day(5) },
          { id: 'long', title: 'Repasar integrales y resolver todos los ejercicios de la guia', type: 'Tarea', date: day(5), horaInicio: '18:30' },
          { id: 'unsafe', title: '<img src=x onerror="window.__xss=true">', type: 'Tarea', date: day(5) },
          { id: 'done', title: 'Guia terminada', type: 'Tarea', date: day(12), done: true },
          { id: 'bad-date', title: 'Fecha invalida', type: 'Tarea', date: {} }
        ];
        localStorage.setItem('bandeja_agenda', JSON.stringify(items));
        localStorage.setItem('estudiemos_calendar_view', 'month');
        localStorage.setItem('estudiemos_home_layout_local', JSON.stringify({ visible: { focus:false, progress:false, assistant:false, shortcuts:false, workspace:false, inbox:false, calendar:true } }));
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({ days: { [day(5)]: 30 } }));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/');
      const calendar = page.locator('[data-dashboard-calendar-widget]');
      if (width < 500) await page.locator('[data-home-view="calendar"]').click();
      await calendar.waitFor({ state: 'visible' });
      await page.waitForTimeout(350);
      assert.equal(await calendar.locator('[data-dashboard-date]').count(), 42);
      assert.match(await calendar.locator('[data-calendar-legend]').textContent(), /6 actividades este mes/);
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
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
        await page.waitForTimeout(120);
        await calendar.screenshot({ path: path.join(output, theme + '-' + width + '.png') });
        assert.equal(await page.evaluate(() => { window.scrollTo(100, scrollY); return scrollX; }), 0);
      }
      await busy.focus(); await page.keyboard.press('Enter');
      await page.locator('body.agenda-open .agenda-board').waitFor();
      assert.match(await page.locator('#agendaSelectedLabel').textContent(), /05/);
      assert.ok(await page.locator('.agenda-board .agenda-item').count() >= 5);
      await page.locator('[data-agenda-close]').click();
      if (width > 500) {
        await calendar.evaluate(el => { el.style.width = '360px'; });
        await page.waitForFunction(() => document.querySelector('[data-dashboard-calendar]').dataset.monthCapacity === '0');
        assert.match(await busy.locator('.dashboard-calendar__count').textContent(), /5/);
      }
      await page.locator('[data-dashboard-calendar-view="week"]').click();
      assert.equal(await calendar.locator('[data-dashboard-date]').count(), 7);
      assert.equal(await calendar.locator('[data-calendar-legend]').isVisible(), false);
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
      if (width === 1440 && process.env.TEST_WEBKIT !== '1') {
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
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
