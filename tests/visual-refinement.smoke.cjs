const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/ui-refinement');

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = process.env.TEST_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    for (const width of [1440, 1024, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(() => {
        localStorage.setItem('estudiemos_theme', 'dark');
        localStorage.setItem('estudiemos_study_chart_mode', 'depth');
        const days = {};
        [75, 55, 40, 65, 20, 45, 60].forEach((minutes, i) => {
          const date = new Date(); date.setDate(date.getDate() - i);
          days[`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`] = minutes;
        });
        localStorage.setItem('estudiemos_pomodoro_streak', JSON.stringify({ version: 2, days }));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/instalar.html?local=1');
      const copy = await page.locator('.install-hero__content').boundingBox();
      const preview = await page.locator('.hero-product').boundingBox();
      assert.ok(preview.y >= copy.y + copy.height + 24, 'preview must not overlap hero text or actions');
      const rail = await page.locator('.journey-rail').boundingBox();
      if (rail) assert.ok(rail.x >= preview.x + preview.width, 'navigation must stay outside the product preview');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `hero-${width}.png`) });
      await page.goto(base + '/instalar.html?local=1&widget=inbox#pc-widgets');
      await page.locator('[data-install-pc]').scrollIntoViewIfNeeded();
      assert.match(await page.locator('[data-continue-widget]').getAttribute('href'), /setup-widget=inbox/);
      assert.equal(await page.locator('.install-addon').count(), 0);
      await page.screenshot({ path: path.join(output, `download-${width}.png`) });
      await page.goto(base + '/');
      const dial = page.locator('[data-home-dial]');
      await dial.waitFor(); await dial.scrollIntoViewIfNeeded();
      await page.locator('[data-study-scene]').waitFor();
      const box = await dial.boundingBox(), r = box.width / 2 - 8;
      const point = angle => ({ x: box.x + box.width / 2 + r * Math.sin(angle * Math.PI / 180), y: box.y + box.height / 2 - r * Math.cos(angle * Math.PI / 180) });
      await page.mouse.move(point(90).x, point(90).y); await page.mouse.down();
      for (const angle of [120, 180, 240]) {
        await page.mouse.move(point(angle).x, point(angle).y, { steps: 4 });
        assert.ok(Math.abs(Number(await dial.getAttribute('aria-valuenow')) - angle / 6) <= 1);
      }
      await page.mouse.up();
      await dial.focus(); await page.keyboard.press('ArrowLeft');
      assert.equal(await dial.getAttribute('aria-valuenow'), '39');
      await page.locator('[data-home-depth]').screenshot({ path: path.join(output, `timer-${width}.png`) });
      const chart = page.locator('[data-home-chart]');
      await chart.scrollIntoViewIfNeeded();
      const canvas = page.locator('[data-progress-scene]'); await canvas.waitFor();
      await page.waitForTimeout(450);
      const pixels = await canvas.evaluate(el => {
        const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
        let count = 0, min = el.height, max = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 100 && data[i + 2] > data[i] + 20) {
          const y = Math.floor(i / 4 / el.width); min = Math.min(min, y); max = Math.max(max, y); count++;
        }
        return { count, coverage: (max - min) / el.height };
      });
      assert.ok(pixels.count > 200 && pixels.coverage > .6, `bars should fill the plot: ${JSON.stringify(pixels)}`);
      const before = await canvas.screenshot(), rect = await canvas.boundingBox();
      await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height * .5); await page.mouse.down();
      await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height * .55, { steps: 10 }); await page.mouse.up();
      await page.waitForTimeout(250);
      assert.notEqual(before.toString('base64'), (await canvas.screenshot()).toString('base64'));
      await page.locator('[data-progress-reset]').click();
      await page.locator('.study-progress').screenshot({ path: path.join(output, `progress-${width}.png`) });
      await page.evaluate(() => document.documentElement.classList.add('theme-light'));
      await page.waitForTimeout(100);
      await page.locator('.study-progress').screenshot({ path: path.join(output, `progress-light-${width}.png`) });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: layout, unified download, dial input, chart rendering and drag`);
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
