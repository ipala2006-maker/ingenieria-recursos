const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)').headers;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };
const live = process.env.TEST_BASE_URL;
if (live) assert.equal(new URL(live).origin, 'https://estudiemos-app.vercel.app');
const output = path.join(root, 'tmp/optional-note', live ? 'live' : 'local');
const readItems = page => page.evaluate(() => JSON.parse(localStorage.getItem('bandeja_agenda') || '[]'));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) { res.writeHead(404).end(); return; }
    try {
      for (const { key, value } of headers) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
      res.setHeader('Content-Type', types[path.extname(file)]);
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    if (!live) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = live ? new URL(live).origin : 'http://127.0.0.1:' + server.address().port;
    const engine = process.env.TEST_WEBKIT === '1' ? 'webkit' : 'chrome';
    browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, isMobile: width < 500, hasTouch: width < 500, timezoneId: 'America/Argentina/Buenos_Aires', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { enabled: false } });
        return route.continue();
      });
      await context.addInitScript(() => {
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        window.__permissionRequests = 0;
        if ('Notification' in window) Notification.requestPermission = async () => { window.__permissionRequests++; return 'denied'; };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (live && width === 1440) {
        for (const file of ['index.html', 'pages/bandeja.html', 'scripts/dashboard.js', 'scripts/bandeja.js', 'scripts/inbox-alarms.js', 'scripts/global-search.js', 'scripts/note-colors.js', 'styles/note-colors.css', 'styles/inbox-alarms.css']) {
          const response = await context.request.get(`${base}/${file}?version=${process.env.RELEASE_VERSION || 'optional-note'}`);
          assert.equal(response.status(), 200, file);
          const hash = bytes => crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
          assert.equal(hash(await response.body()), hash(fs.readFileSync(path.join(root, file))), `Live file differs: ${file}`);
        }
      }
      await page.goto(base + '/?version=' + (process.env.RELEASE_VERSION || 'optional-note'));
      await page.locator('[data-quick-note-form] [name=inboxDateEnabled]').waitFor({ state: 'attached' });
      await page.locator('[data-quick-note-form] [name=noteColor]').first().waitFor({ state: 'attached' });
      const date = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 2); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); });

      async function defaults(form) {
        assert.equal(await form.locator('[name=noteColor][value=""]').isChecked(), true);
        assert.equal(await form.locator('[name=inboxDateEnabled]').isChecked(), false);
        assert.equal(await form.locator('[name=inboxAlarmEnabled]').isChecked(), false);
        assert.equal(await form.locator('[name=inboxNoteDate]').isDisabled(), true);
        assert.equal(await form.locator('[name=inboxAlarmTime]').isDisabled(), true);
      }
      async function create(form, title, mode) {
        await defaults(form);
        await form.locator('[name=title],#agendaTitle').fill(title);
        const color = ['teal', 'violet', 'rose'][mode];
        await form.getByRole('radio', { name: ['Turquesa', 'Violeta', 'Rosa'][mode], exact: true }).check();
        if (mode > 0) {
          await form.locator('[name=inboxDateEnabled]').check();
          await form.locator('[name=inboxNoteDate]').fill(date);
        }
        if (mode > 1) {
          await form.locator('[name=inboxAlarmEnabled]').check();
          assert.equal(await form.locator('[name=inboxAlarmDate]').inputValue(), date);
          await form.locator('[name=inboxAlarmTime]').fill('18:30');
          await form.locator('[name=inboxAlarmRepeat]').selectOption('weekly');
        }
        const count = (await readItems(page)).length;
        await form.locator('[type=submit]').click();
        await page.waitForFunction(n => JSON.parse(localStorage.getItem('bandeja_agenda') || '[]').length === n + 1, count);
        const saved = (await readItems(page))[0];
        assert.equal(saved.title, title); assert.equal(saved.date, mode > 0 ? date : '');
        assert.equal(saved.color, color);
        if (mode > 1) { assert.equal(saved.alarm.date, date); assert.equal(saved.alarm.time, '18:30'); assert.equal(saved.alarm.repeat, 'weekly'); }
        else assert.equal(saved.alarm, null);
      }

      const quick = page.locator('[data-quick-note-form]');
      for (const mode of [0, 1, 2]) {
        await page.locator('[data-quick-note-open]').first().click();
        await create(quick, `Home mode ${mode}`, mode);
      }
      await page.locator('[data-quick-note-open]').first().click();
      await defaults(quick);
      await quick.locator('[name=title]').fill('Toggle options off');
      await quick.locator('[name=inboxDateEnabled]').check();
      await quick.locator('[name=inboxNoteDate]').fill('');
      const count = (await readItems(page)).length;
      await quick.locator('[type=submit]').click();
      assert.equal((await readItems(page)).length, count);
      await quick.locator('[name=inboxDateEnabled]').uncheck();
      await quick.locator('[name=inboxAlarmEnabled]').check();
      await quick.locator('[name=inboxAlarmTime]').fill('');
      await quick.locator('[name=inboxAlarmEnabled]').uncheck();
      await quick.locator('[type=submit]').click();
      await page.waitForFunction(n => JSON.parse(localStorage.getItem('bandeja_agenda')).length === n + 1, count);
      assert.equal((await readItems(page))[0].date, ''); assert.equal((await readItems(page))[0].alarm, null);

      await page.locator('[data-quick-note-open]').first().click();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(output, `${engine}-${width}-${theme}.png`) });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await quick.locator('[name=title]').fill('Dated preview');
      await quick.locator('[name=inboxDateEnabled]').check();
      await quick.locator('[name=inboxNoteDate]').fill(date);
      await quick.locator('[name=inboxAlarmEnabled]').check();
      await quick.locator('[name=inboxAlarmTime]').fill('18:30');
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(output, `${engine}-${width}-expanded.png`) });
      assert.ok(await quick.evaluate(form => [...form.querySelectorAll('input,select,button')].every(el => { const r = el.getBoundingClientRect(); return r.width === 0 || r.left >= 0 && r.right <= innerWidth; })));
      await page.locator('[data-quick-panel=note] [data-quick-panel-close]').click();
      await page.locator('[data-quick-panel=note]').waitFor({ state: 'hidden' });

      await page.evaluate(() => window.dispatchEvent(new CustomEvent('estudiemos:open-agenda')));
      await page.locator('[data-agenda-create]').click();
      const manual = page.locator('#agendaForm');
      assert.ok(await page.locator('[data-agenda-manual]').evaluate(el => {
        const outer = el.getBoundingClientRect(), button = el.querySelector('[data-agenda-program]').getBoundingClientRect();
        return button.bottom <= outer.bottom + 1;
      }), 'Programar is not clipped by the note form');
      await manual.locator('#agendaTitle').fill('Mi borrador sin guardar');
      await manual.getByRole('radio', { name: 'Amarillo', exact: true }).check();
      const selectedDate = await page.locator('.agenda-day.is-selected').getAttribute('data-agenda-date');
      const reader = page.locator('[data-calendar-reader]'), planner = reader.locator('[data-timetable-form]');
      const beforeProgram = await readItems(page);
      await page.locator('[data-agenda-program]').click();
      await planner.waitFor({ state: 'visible' });
      assert.equal(await planner.locator('[name=date]').inputValue(), selectedDate);
      await planner.locator('[name=repeat]').selectOption('weekly');
      await planner.locator('[name=title]').fill('Mi horario desde Inbox');
      await planner.locator('[name=limited]').check();
      await planner.locator('[name=until]').fill('2030-12-20');
      await planner.locator('[data-timetable-color=amber]').click();
      await planner.locator('[type=submit]').click();
      await planner.waitFor({ state: 'hidden' });
      await reader.locator('[data-calendar-reader-close]').click();
      assert.equal(await manual.locator('#agendaTitle').inputValue(), 'Mi borrador sin guardar');
      assert.equal(await manual.getByRole('radio', { name: 'Amarillo', exact: true }).isChecked(), true);
      assert.deepEqual(await readItems(page), beforeProgram);
      await page.locator('[data-agenda-filter=day]').click();
      await page.locator('#agendaList [data-calendar-edit-schedule]').first().click();
      await planner.waitFor({ state: 'visible' });
      assert.equal(await planner.locator('[name=title]').inputValue(), 'Mi horario desde Inbox');
      assert.equal(await planner.locator('[name=repeat]').inputValue(), 'weekly');
      assert.equal(await planner.locator('[name=color]').inputValue(), 'amber');
      assert.equal(await planner.locator('[name=until]').inputValue(), '2030-12-20');
      await planner.locator('[data-timetable-close]').click();
      await reader.locator('[data-calendar-reader-close]').click();
      await manual.evaluate(form => form.reset());
      for (const mode of [0, 1, 2]) {
        await create(manual, `Inbox mode ${mode}`, mode);
        assert.ok(await page.locator('#agendaList').getByText(`Inbox mode ${mode}`, { exact: true }).isVisible());
        assert.equal(await page.locator('[data-agenda-filter=pending]').getAttribute('class').then(c => c.includes('is-active')), true);
      }
      await defaults(manual);
      const beforeRecolor = (await readItems(page)).find(item => item.title === 'Inbox mode 2');
      await page.locator(`#agendaList [data-note-color-id="${beforeRecolor.id}"]`).click();
      const picker = page.locator('.note-color-dialog');
      await picker.getByRole('button', { name: 'Amarillo', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      const afterRecolor = (await readItems(page)).find(item => item.id === beforeRecolor.id);
      assert.deepEqual(afterRecolor, { ...beforeRecolor, color: 'amber' });
      assert.ok(await page.locator('#agendaList .agenda-item.timetable-color--amber').count());
      const undated = (await readItems(page)).find(item => item.title === 'Inbox mode 0');
      await page.locator(`#agendaList [data-note-color-id="${undated.id}"]`).click();
      await picker.getByRole('button', { name: 'Violeta', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      assert.deepEqual((await readItems(page)).find(item => item.id === undated.id), { ...undated, color: 'violet' });
      await page.locator(`#agendaList [data-note-color-id="${undated.id}"]`).click();
      await picker.getByRole('button', { name: 'Sin color', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      const { color: oldColor, ...neutral } = undated;
      assert.deepEqual((await readItems(page)).find(item => item.id === undated.id), neutral);
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
        await page.locator('#agendaForm').evaluate(form => { for (let el = form.parentElement; el; el = el.parentElement) el.scrollTop = 0; });
        await page.screenshot({ path: path.join(output, `${engine}-${width}-inbox-${theme}.png`) });
        assert.ok(await manual.evaluate(form => [...form.querySelectorAll('input,select,button,label')].every(el => { const r = el.getBoundingClientRect(); return r.width === 0 || r.left >= 0 && r.right <= innerWidth; })));
      }
      await page.locator('[data-agenda-close]').click();
      await page.waitForFunction(() => document.querySelector('.agenda-board').getAttribute('aria-hidden') === 'true');
      if (width < 500) await page.locator('[data-home-view=inbox]').click();
      const alarmItem = (await readItems(page)).find(item => item.title === 'Inbox mode 2');
      await page.locator(`[data-inbox-alarm-id="${alarmItem.id}"]`).filter({ visible: true }).first().click();
      const editor = page.locator('[data-alarm-editor]');
      assert.equal(await editor.locator('[name=inboxDateEnabled]').count(), 0);
      assert.equal(await editor.locator('[name=inboxAlarmTime]').inputValue(), '18:30');
      await editor.locator('[name=inboxAlarmEnabled]').uncheck();
      await editor.locator('[type=submit]').click();
      const edited = (await readItems(page)).find(item => item.title === 'Inbox mode 2');
      assert.equal(edited.date, date); assert.equal(edited.alarm, null);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${width}: Inbox programming and editing, draft preserved, six colored note modes, recolor and clear preserve data, light/dark, no clipping or overflow`);
      await context.close();
    }
  } finally {
    await browser?.close(); if (server.listening) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
