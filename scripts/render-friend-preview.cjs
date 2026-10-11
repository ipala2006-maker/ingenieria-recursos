const { chromium } = require('../tmp/ui-check/node_modules/playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../tools/friend-invite-preview.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.resolve(__dirname, '../assets/friend-invite-preview.png') });
    console.log('Invitation preview rendered: 1200 x 630.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
