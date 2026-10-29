const { chromium, webkit, devices } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/mobile-alarm-flow');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) return res.writeHead(404).end();
    try { res.setHeader('Content-Type', types[path.extname(file)]); res.end(fs.readFileSync(file)); }
    catch (_) { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const safari = process.env.TEST_WEBKIT === '1';
    browser = safari ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
    const cases = safari ? [devices['iPhone 13'], { ...devices['iPhone 13'], viewport: { width: 390, height: 460 } }]
      : [devices['Pixel 5'], { ...devices['Pixel 5'], viewport: { width: 360, height: 480 } }, { viewport: { width: 1280, height: 720 } }];
    for (const device of cases) {
      // WebKit's mobile automation has no wheel/drag API; keep touch targets and the
      // iPhone UA/viewport while using its supported wheel input for scroll checks.
      const context = await browser.newContext({ ...device, ...(safari ? { isMobile: false } : {}), serviceWorkers: 'block' });
      await context.addInitScript(() => {
        window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }) };
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({ days: {}, goal: { minutes: 25, updatedAt: 1 } }));
        localStorage.setItem('bandeja_agenda', JSON.stringify([{ id: 'fixture-task', title: 'Repasar para el parcial', type: 'Tarea', date: '' }]));
        // UI-only fixture: no permission prompt, subscription or provider delivery is performed.
        Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
        if (!window.PushManager) window.PushManager = function () {};
        if (!window.Notification) window.Notification = { permission: 'default' };
        window.EstudiemosWindowsLocalAlarms = { ready: () => false };
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        return route.fulfill({ json: url.pathname === '/api/account-config'
          ? { enabled: true, url: 'https://fixture.invalid', publishableKey: 'fixture-only' }
          : { enabled: false, connected: false } });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.waitForFunction(() => window.EstudiemosInboxAlarms && window.EstudiemosMobileNotifications && window.EstudiemosAccount);
      await page.locator('[data-account-auth]').waitFor({ state: 'attached' });
      await page.locator('.topbar [data-quick-note-open]').click();
      const note = page.locator('[data-quick-panel="note"]');
      await note.locator('input[name="title"]').fill('Conservar mi alarma');
      await note.locator('[name="inboxAlarmEnabled"]').check();
      const panel = note.locator('.quick-panel');
      await panel.evaluate(el => { el.scrollTop = 0; });
      const start = await page.evaluate(() => ({ y: scrollY, home: document.querySelector('.study-home')?.scrollTop || 0 }));
      const rect = await panel.boundingBox();
      if (device.isMobile && !safari) {
        const input = await context.newCDPSession(page);
        const x = rect.x + rect.width - 8, y = Math.min(rect.y + rect.height - 35, page.viewportSize().height - 35);
        await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 8; step++) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 25 }] });
        await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await input.detach();
      } else {
        await page.mouse.move(rect.x + rect.width / 2, Math.min(rect.y + rect.height / 2, page.viewportSize().height - 30));
        await page.mouse.wheel(0, 1000);
      }
      await page.waitForTimeout(300);
      const scroll = await panel.evaluate(el => ({ top: el.scrollTop, client: el.clientHeight, height: el.scrollHeight, overflow: el.scrollWidth > el.clientWidth + 1 }));
      assert.equal(scroll.overflow, false, 'alarm panel has no horizontal overflow');
      if (scroll.height > scroll.client + 2) assert.ok(scroll.top > 0, 'scrolling moves the alarm form: ' + JSON.stringify({ rect, scroll }));
      assert.deepEqual(await page.evaluate(() => ({ y: scrollY, home: document.querySelector('.study-home')?.scrollTop || 0 })), start, 'home stays still behind the alarm');
      const submit = note.locator('[type="submit"]');
      await submit.scrollIntoViewIfNeeded();
      const bottom = await submit.boundingBox();
      assert.ok(bottom.y >= 0 && bottom.y + bottom.height <= page.viewportSize().height + 1, 'save stays reachable');
      const mobile = device.isMobile;
      if (mobile) {
        const login = note.locator('[data-alarm-permission]');
        await login.scrollIntoViewIfNeeded();
        assert.equal(await login.textContent(), 'Ingresar');
        await login.tap();
      } else await page.evaluate(() => EstudiemosAccount.open());
      const account = page.locator('.account-shell');
      await account.waitFor({ state: 'visible' });
      const email = account.locator('input[name="email"]');
      await email.scrollIntoViewIfNeeded();
      assert.ok(await email.evaluate(el => { const r = el.getBoundingClientRect(); return el === document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); }), 'login must be above the alarm, not hidden behind it');
      await email.fill('fixture@example.invalid');
      await account.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
      await page.screenshot({ path: path.join(output, `${safari ? 'webkit' : 'chrome'}-${device.viewport.width}-${device.viewport.height}-login.png`) });
      const recovery = account.locator('[data-account-reset]');
      await recovery.scrollIntoViewIfNeeded();
      const recoveryRect = await recovery.boundingBox();
      assert.ok(recoveryRect.y >= 0 && recoveryRect.y + recoveryRect.height <= page.viewportSize().height + 1, 'all account actions remain reachable');
      assert.equal(await account.locator('.account-panel').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
      await account.locator('[data-account-close]').click();
      await account.waitFor({ state: 'hidden' });
      assert.equal(await note.locator('input[name="title"]').inputValue(), 'Conservar mi alarma');
      assert.equal(await note.locator('[name="inboxAlarmEnabled"]').isChecked(), true);
      assert.equal(await account.isVisible(), false);
      await page.screenshot({ path: path.join(output, `${safari ? 'webkit' : 'chrome'}-${device.viewport.width}.png`) });
      await note.locator('[data-quick-panel-close]').click();
      await note.waitFor({ state: 'hidden' });
      await page.evaluate(() => EstudiemosInboxAlarms.open('fixture-task'));
      const editor = page.locator('.inbox-alarm-dialog:not(.alarm-setup)');
      await editor.locator('[name="inboxAlarmEnabled"]').check();
      if (mobile) await editor.locator('[data-alarm-permission]').tap();
      else await page.evaluate(() => EstudiemosAccount.open());
      await account.locator('input[name="email"]').fill('second@example.invalid');
      await page.keyboard.press('Escape');
      await account.waitFor({ state: 'hidden' });
      assert.equal(await editor.evaluate(el => el.open), true, 'closing login preserves the native alarm editor');
      await editor.locator('[data-alarm-close]').click();
      assert.deepEqual(errors, []);
      console.log(`PASS ${safari ? 'WebKit' : 'Chrome'} ${device.viewport.width}x${device.viewport.height}: scroll, visible login, preserved alarm and nested editor`);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
