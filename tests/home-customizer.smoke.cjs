const { chromium } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8149/';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({ json: { enabled: false } }));
      await page.addInitScript(() => {
        localStorage.setItem('estudiemos_theme', 'dark');
        window.EstudiemosAccount = { whenReady: async () => {}, getClient: () => null, getUser: () => null, getSession: () => null, open: () => {} };
      });
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('[data-home-customize]').click();
      assert.equal(await page.locator('[data-home-customizer]').evaluate(dialog => dialog.open), true);
      const progress = page.locator('[data-home-customizer-spaces] input[value="progress"]');
      await progress.uncheck();
      assert.equal(await page.locator('[data-home-space="progress"]').first().evaluate(element => element.classList.contains('home-space-disabled')), true);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('estudiemos_home_layout')).visible.progress), false);
      await page.locator('.home-customizer__density label').filter({ has: page.locator('[value="compact"]') }).click();
      assert.equal(await page.locator('body').getAttribute('data-home-density'), 'compact');
      await page.locator('.home-customizer__done').click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('[data-home-space="progress"]').first().evaluate(element => element.classList.contains('home-space-disabled')), true);
      await page.locator('[data-home-customize]').click();
      await page.locator('[data-home-customizer-reset]').click();
      assert.equal(await page.locator('[data-home-space="progress"]').first().evaluate(element => element.classList.contains('home-space-disabled')), false);
      assert.equal(await page.locator('body').getAttribute('data-home-density'), 'comfortable');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
