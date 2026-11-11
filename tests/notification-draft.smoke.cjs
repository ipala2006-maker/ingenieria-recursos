const assert = require('node:assert/strict');
const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const { createPreview } = require('./helpers/app-preview.cjs');

const app = createPreview({withNotice:false});
const serve = app.listeners('request')[0];
app.removeListener('request', serve);
app.on('request', (req, res) => {
  if (req.url === '/service-worker.js') {
    // Simulate only the OS delivery; the page sees a message from its real controller.
    return res.writeHead(200, {'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(`
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      self.addEventListener('message', event => {
        if (event.data === 'test-click') event.source.postMessage({type:'ESTUDIEMOS_OPEN_TOOL',tool:'agenda'});
      });
    `);
  }
  if (req.url.startsWith('/api/')) return res.writeHead(200, {'Content-Type':'application/json'}).end('{"enabled":false}');
  return serve(req, res);
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => app.listen(0,'127.0.0.1',resolve));
    const url = 'http://127.0.0.1:' + app.address().port + '/';
    browser = process.env.TEST_WEBKIT ? await webkit.launch() : await chromium.launch({channel:'chrome'});
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    await context.addInitScript(() => {
      localStorage.setItem('estudiemos_onboarding_v1','{"status":"completed"}');
      localStorage.setItem('estudiemos_pomodoro_streak','{"goal":{"minutes":25,"updatedAt":1},"days":{}}');
    });
    await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller) && Boolean(document.querySelector('.agenda-board')));
    await page.locator('.topbar [data-quick-note-open]').tap();
    const title = page.locator('[data-quick-note-form] [name=title]');
    await title.fill('Borrador que debe quedar abierto');
    async function notify() {
      await page.evaluate(() => new Promise(resolve => {
        navigator.serviceWorker.addEventListener('message', resolve, {once:true});
        navigator.serviceWorker.controller.postMessage('test-click');
      }));
    }
    await notify();
    assert.equal(await title.isVisible(), true);
    assert.equal(await title.inputValue(), 'Borrador que debe quedar abierto');
    assert.equal(page.url(),url);
    await page.locator('[data-quick-panel="note"] [data-quick-panel-close]').tap();
    await notify();
    await page.waitForFunction(() => document.body.classList.contains('agenda-open'));
    assert.equal(context.pages().length,1);
    console.log('PASS real service-worker message: preserves the open draft and opens Inbox when no editor is active');
  } finally {
    await browser?.close();
    if(app.listening)await new Promise(resolve=>app.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
