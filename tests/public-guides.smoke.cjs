const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const origin = 'https://estudiemos.ar';
const live = process.argv.includes('--live');
const root = path.join(__dirname, '../dist-cloudflare');
const mime = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

async function check(engine, width, height, colorScheme) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {});
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false, serviceWorkers: 'block', colorScheme,
      viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500
    });
    const unexpected = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')) {
        unexpected.push(url.href);
        return route.abort();
      }
      if (live) return route.continue();
      const pathname = url.pathname.endsWith('/') ? url.pathname + 'index.html'
        : path.extname(url.pathname) ? url.pathname : url.pathname + '.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        return await route.fulfill({ body: await fs.readFile(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return route.fulfill({ status: 404, body: '' });
      }
    });
    const page = await context.newPage();
    const start = await page.goto(origin + '/');
    assert.equal(start.status(), 200);
    const guides = page.locator('.study-home__head').getByRole('link', { name: 'Guías de estudio' });
    assert.equal(await guides.isVisible(), true);
    await guides.click();
    assert.equal(new URL(page.url()).pathname, '/guias/');
    assert.equal(await page.getByRole('heading', { level: 1, name: 'Guías de estudio' }).count(), 1);
    const out = path.join(__dirname, '../tmp/public-guides');
    await fs.mkdir(out, { recursive: true });
    await page.screenshot({ path: path.join(out, `${engine.name()}-${width}-index.png`) });
    for (const slug of ['preparar-un-parcial', 'derivadas-y-tasa-de-cambio', 'cinematica-mrua']) {
      await page.locator(`main a[href="/guias/${slug}"]`).click();
      assert.equal(new URL(page.url()).pathname, '/guias/' + slug);
      assert.equal(await page.getByRole('article').count(), 1);
      const layout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        font: getComputedStyle(document.body).fontFamily,
        titles: document.querySelectorAll('article h2').length
      }));
      assert.ok(layout.horizontalOverflow <= 1, `${width}: ${slug}`);
      assert.match(layout.font, /Plus Jakarta Sans/);
      assert.ok(layout.titles >= 4);
      if (slug !== 'preparar-un-parcial') {
        const answer = page.locator('article details');
        await answer.locator('summary').click();
        assert.equal(await answer.locator('p').isVisible(), true);
      }
      if (slug === 'cinematica-mrua') {
        await page.screenshot({ path: path.join(out, `${engine.name()}-${width}-frenado.png`), fullPage: true });
      }
      await page.getByRole('link', { name: 'Todas las guías' }).click();
    }
    assert.deepEqual(unexpected, [], 'reading guides should not require a backend or third party');
    console.log(`PASS ${engine.name()} ${width}px ${colorScheme}: guides navigable from home with JS off, responsive and no API requests`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await check(chromium, 1366, 820, 'dark');
  await check(webkit, 390, 844, 'light');
  await check(webkit, 320, 640, 'dark');
})().catch(error => { console.error(error); process.exitCode = 1; });
