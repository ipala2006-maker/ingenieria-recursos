const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('../tmp/ui-check/node_modules/playwright');
const base = 'http://127.0.0.1:8190';
const out = path.resolve(__dirname, '../tmp/cloudflare-ui');

(async () => {
  for (const [route, status] of [['/', 200], ['/api/account-config?drive=config', 200],
    ['/api/widget-push?mobilePush=dispatch', 401], ['/api/_lib/mobile-push.js', 404],
    ['/.env', 404], ['/scripts/backup-database.cjs', 404], ['/.well-known/assetlinks.json', 200],
    ['/amistad/' + 'a'.repeat(32), 200], ['/materia/BAD', 404]]) {
    const response = await fetch(base + route);
    assert.equal(response.status, status, route);
    assert.ok(response.headers.get('content-security-policy'), route);
    await response.body?.cancel();
  }
  const retired = await fetch(base + '/api/widget-link?alarmFeed=1', { redirect: 'manual' });
  assert.equal(retired.status, 307);
  assert.equal(retired.headers.get('location'), base + '/.well-known/windows-alarms-retired.json');
  const download = await fetch(base + '/downloads/Estudiemos-Para-Windows.exe', { method: 'HEAD' });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /attachment/);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', hasTouch: width === 390 });
      await context.addInitScript(() => {
        localStorage.setItem('estudiemos_onboarding_v1', JSON.stringify({ status: 'completed' }));
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({ days: {}, goal: { minutes: 25, updatedAt: 1 } }));
      });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      const goal = page.locator('[data-study-goal-dialog]');
      if (await goal.isVisible()) {
        await goal.locator('[type=submit]').click();
        await goal.waitFor({ state: 'hidden' });
      }
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.equal(await page.evaluate(() => typeof window.EstudiemosFeedback?.complete), 'function');
      await page.screenshot({ path: path.join(out, `dark-${width}.png`), fullPage: true, animations: 'disabled' });
      await page.evaluate(() => localStorage.setItem('estudiemos_theme', 'light'));
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('Workers runtime: routes, private source isolation, headers, downloads, dark/light and desktop/mobile passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
