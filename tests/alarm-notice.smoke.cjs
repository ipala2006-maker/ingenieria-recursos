const { chromium } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8149/';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
      const page = await context.newPage();
      await page.route('**/api/**', route => route.fulfill({ json: { enabled: false } }));
      await page.addInitScript(({ date, time }) => {
        localStorage.setItem('estudiemos_theme', 'dark');
        localStorage.setItem('bandeja_agenda', JSON.stringify([{ id: 'alarm-pilot', title: 'Preparar el parcial de Física', type: 'Tarea', date: '', done: false, alarm: { date, time, repeat: 'none', windows: false } }]));
        localStorage.removeItem('estudiemos_inbox_alarm_delivered');
        window.EstudiemosAccount = { whenReady: async () => {}, getClient: () => null, getUser: () => null, getSession: () => null, open: () => {} };
      }, { date, time });
      await page.goto(base, { waitUntil: 'networkidle' });
      const notice = page.locator('.inbox-alarm-notice');
      await notice.waitFor({ state: 'visible', timeout: 15000 });
      const box = await notice.boundingBox();
      assert.ok(box.width >= viewport.width - 1 && box.height >= viewport.height - 1);
      assert.match(await notice.innerText(), /Preparar el parcial de Física/);
      assert.equal(await page.locator('[data-alarm-notice-dismiss]').isVisible(), true);
      await page.screenshot({ path: path.join(__dirname, `../tmp/alarm-fullscreen-${viewport.width}.png`) });
      await page.locator('[data-alarm-notice-dismiss]').click();
      assert.equal(await notice.isVisible(), false);
      await page.evaluate(()=>{
        const other=document.createElement('dialog');other.id='pilot-dialog';other.textContent='Editor piloto';document.body.appendChild(other);other.showModal();
        localStorage.removeItem('estudiemos_inbox_alarm_delivered');
        return window.EstudiemosInboxAlarms.check();
      });
      assert.ok(await notice.evaluate(n=>n.open),'alarm uses the top layer above other dialogs');
      assert.ok(await page.locator('[data-alarm-notice-dismiss]').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;}),'alarm is visually above the open editor');
      await page.locator('[data-alarm-notice-dismiss]').click();
      assert.ok(await page.locator('#pilot-dialog').evaluate(n=>n.open),'alarm dismissal does not discard the editor');
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
