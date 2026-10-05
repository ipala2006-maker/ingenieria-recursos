const { chromium, webkit } = require("../tmp/ui-check/node_modules/playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const policy = require("../vercel.json").headers.find(rule => rule.source === "/(.*)").headers;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".wav": "audio/wav", ".webmanifest": "application/manifest+json" };
const output = path.join(root, "tmp/launch-audit");

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) { res.setHeader("Content-Type", "application/json"); res.end('{"enabled":false}'); return; }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep) || !types[path.extname(file)]) { res.writeHead(404).end(); return; }
    try {
      // WebKit upgrades loopback resources too; this fixture has no TLS certificate.
      for (const { key, value } of policy) res.setHeader(key, key === 'Content-Security-Policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
      res.setHeader("Content-Type", types[path.extname(file)]);
      res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    if (process.env.TEST_UNIT_BROWSER === "1") {
      // These existing tests need the preview to remain responsive during execution.
      const { spawn } = require("node:child_process");
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--test", "tests/share-target-inbox.test.cjs", "tests/widget-calendar-layout.test.cjs"], { cwd: root, env: { ...process.env, TEST_BASE_URL: base }, stdio: "inherit" });
        child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error("Browser unit tests failed")));
      });
      return;
    }
    browser = process.env.TEST_WEBKIT === "1" ? await webkit.launch() : await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, hasTouch: width < 500, isMobile: width < 500, serviceWorkers: 'block' });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.hostname === "noembed.com") return route.fulfill({ json: { title: '<img src=x onerror="window.__xss=true">' } });
        return url.origin === base ? route.continue() : route.abort();
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => { errors.push(error.message); console.log('Page error:', error.message); });
      await page.goto(base + "/");
      await page.locator("[data-home-timer]").waitFor();
      await page.locator("[data-quick-note-form]").waitFor({ state: 'attached', timeout: 10000 }).catch(async error => {
        console.log(await page.evaluate(() => ({ url: location.href, dashboard: window.__estudiemosDashboardInstalled, panels: [...document.querySelectorAll('[data-quick-panel]')].map(el => ({panel:el.dataset.quickPanel, html:el.innerHTML.slice(0,80)})) })));
        throw error;
      });
      await page.locator("[data-quick-note-open]").first().click();
      const form = page.locator("[data-quick-note-form]");
      const task = '<img src=x onerror="window.__xss=true">';
      await form.locator('[name="title"]').fill(task);
      await form.locator('[name="inboxAlarmEnabled"]').check();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const date = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, "0"), String(tomorrow.getDate()).padStart(2, "0")].join("-");
      await form.locator('[name="inboxAlarmDate"]').fill(date);
      await form.locator('[name="inboxAlarmTime"]').fill("18:30");
      await form.locator('[name="inboxAlarmRepeat"]').selectOption("weekly");
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("bandeja_agenda") || "[]").length === 1);
      const items = await page.evaluate(() => JSON.parse(localStorage.getItem("bandeja_agenda")));
      assert.equal(items[0].title, task);
      assert.equal(items[0].alarm.time, "18:30"); assert.equal(items[0].alarm.repeat, "weekly");
      assert.equal(await page.locator('[data-dashboard-agenda] img').count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      if (width < 500) await page.locator('[data-home-view="inbox"]').click();
      await page.locator("[data-inbox-alarm-id]").first().click();
      assert.equal(await page.locator('[data-alarm-editor] [name="inboxAlarmTime"]').inputValue(), "18:30");
      await page.locator('[data-alarm-close]').click();
      if (width < 500) await page.locator('[data-home-view="overview"]').click();
      await page.locator('[data-home-timer]').click();
      await page.waitForFunction(() => document.querySelector('[data-home-clock]').textContent !== '25:00');
      await page.locator('[data-home-timer]').click();
      await page.locator('[data-friends-open]').click();
      await page.getByRole('button', { name: 'Cerrar amigos', exact: true }).click();
      for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => window.EstudiemosTheme.set(theme), theme);
        await page.waitForTimeout(180);
        await page.screenshot({ path: path.join(output, `home-${theme}-${width}.png`) });
        const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
          nodes: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).slice(0, 8).map(el => ({tag:el.tagName,classes:el.className,rect:el.getBoundingClientRect().toJSON()})) }));
        const scrollX = await page.evaluate(() => { const y = scrollY; window.scrollTo(100, y); return window.scrollX; });
        assert.equal(scrollX, 0, JSON.stringify({ theme, width, layout }));
        assert.equal(layout.nodes.length, 0, JSON.stringify({ theme, width, layout }));
      }
      await page.goto(base + "/pages/tema/cinematica.html");
      await page.locator('.video-card__title').first().waitFor({ state: 'attached' });
      assert.equal(await page.locator('.video-card__title img').count(), 0);
      assert.equal(await page.locator('.video-card__title').first().textContent(), task);
      await page.locator('[onclick="showVideos()"]').click();
      assert.equal(await page.locator('#videosView').isVisible(), true);
      await page.locator('#videosView [onclick="showCategories()"]').click();
      assert.equal(await page.locator('#categoriesView').isVisible(), true);
      await page.evaluate(() => {
        const script = document.createElement("script"); script.textContent = "window.__cspBypassed=true"; document.body.appendChild(script);
        const button = document.createElement("button"); button.setAttribute("onclick", "window.__cspBypassed=true"); document.body.appendChild(button); button.click();
      });
      assert.equal(await page.evaluate(() => window.__xss || window.__cspBypassed), undefined);
      await page.goto(base + "/instalar.html?local=1");
      await page.locator('[data-install-pc]').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}: CSP blocks injection; safe task/video titles; manual alarm; timer; friends; mobile layout; download`);
      await context.close();
    }
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
