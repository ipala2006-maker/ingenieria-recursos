const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const origin = 'https://estudiemos.ar';
const url = origin + '/consentimiento';
const live = process.argv.includes('--live');
const files = {
  '/consentimiento': ['consentimiento.html', 'text/html'],
  '/scripts/ad-consent.js': ['scripts/ad-consent.js', 'text/javascript'],
  '/scripts/cmp-preferences.js': ['scripts/cmp-preferences.js', 'text/javascript'],
  '/scripts/inmobi-choice-tag.js': ['scripts/inmobi-choice-tag.js', 'text/javascript'],
  '/styles/consent-preview.css': ['styles/consent-preview.css', 'text/css'],
  '/assets/favicon.svg': ['assets/favicon.svg', 'image/svg+xml']
};
const advertising = /(?:^|\.)(?:googlesyndication\.com|doubleclick\.net|googleadservices\.com)$/i;

async function main() {
  const { default: frontdoor } = await import('../cloudflare/frontdoor.mjs');
  const { adConsentStatus } = await import('../scripts/ad-consent.js');
  const engine = process.env.TEST_WEBKIT === '1' ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? {channel:'chrome'} : {});
  try {
    const context = await browser.newContext({
      locale: 'es-AR', viewport: {width: 390, height: 844}, serviceWorkers: 'block'
    });
    const adRequests = [], errors = [];
    await context.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (advertising.test(target.hostname)) {
        adRequests.push(target.hostname);
        return route.abort();
      }
      if (live || target.origin !== origin) return route.continue();
      const file = files[target.pathname];
      if (!file) return route.fulfill({status:404, body:''});
      const asset = await frontdoor.fetch(new Request(target), {ASSETS:{
        fetch: async () => new Response(await readFile(path.join(__dirname, '..', file[0])), {
          headers: {'Content-Type':file[1]}
        })
      }});
      return route.fulfill({status:asset.status, headers:Object.fromEntries(asset.headers), body:Buffer.from(await asset.arrayBuffer())});
    });
    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 300));
    });
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    try {
      const dialog = page.getByRole('dialog', {name:/privacy|privacidad/i});
      const reject = dialog.getByRole('button', {name:/^(rechazar|reject|disagree)$/i}).filter({visible:true});
      await reject.waitFor({timeout:18000});
      const accept = dialog.getByRole('button', {name:/^(aceptar|accept|agree)( todo| all)?$/i}).filter({visible:true});
      await accept.waitFor({timeout:5000});
      const screenshot = path.join(__dirname, '../tmp/ui-check', `inmobi-banner-${live?'produccion':'ensayo'}-${engine.name()}.png`);
      await page.screenshot({path:screenshot});
      const consent = () => page.evaluate(() => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('No completed TCF decision')), 5000);
        window.__tcfapi('addEventListener', 2, (data, success) => {
          if (!success || !['tcloaded','useractioncomplete'].includes(data.eventStatus)) return;
          clearTimeout(timer);
          window.__tcfapi('removeEventListener', 2, () => {}, data.listenerId);
          resolve(data);
        });
      }));
      const vendors = data => Object.keys(data.vendor.consents).filter(id => data.vendor.consents[id]).map(Number);
      await reject.click();
      await reject.waitFor({state:'hidden'});
      assert.deepEqual(vendors(await consent()), []);
      const reopen = page.getByRole('link', {name:/^(privacidad|privacy|privacy choices)$/i});
      await reopen.click({timeout:8000});
      await accept.waitFor({timeout:8000});
      await accept.click();
      await accept.waitFor({state:'hidden'});
      const accepted = await consent();
      assert.equal(accepted.cmpId, 10);
      assert.deepEqual(vendors(accepted), [755]);
      assert.equal(adConsentStatus(accepted, true), 'granted');
      await page.reload();
      assert.equal(adConsentStatus(await consent(), true), 'granted');
      const stored = async () => Object.fromEntries((await context.cookies(origin))
        .filter(cookie => /gpp|consent/i.test(cookie.name))
        .map(cookie => [cookie.name, createHash('sha256').update(cookie.value).digest('hex')]));
      const before = await stored();
      await page.evaluate(async () => {
        const { observeBrowserAdConsent } = await import('/scripts/ad-consent.js?v=20261104b');
        window.__testAdConsent = observeBrowserAdConsent(() => {});
        window.__testTcfEvents = [];
        window.__tcfapi('addEventListener', 2, (data, success) => {
          if (success && data) window.__testTcfEvents.push(structuredClone(data));
        });
      });
      await page.waitForFunction(() => window.__testAdConsent.getStatus() === 'granted');
      await reopen.click({timeout:8000});
      const partners = process.argv.includes('--partners');
      if (partners) await dialog.getByRole('button', {name:/^partners$|^socios$/i}).click();
      // The CMP also renders a separate Disagree control; use the visible
      // Reject All command from the opened preference panel.
      await dialog.getByRole('button', {name:/^reject all$|^rechazar todo$/i}).filter({visible:true}).click();
      if (partners) await dialog.getByRole('button', {name:/save.*exit|guardar/i}).filter({visible:true}).click();
      await page.waitForFunction(() => window.__testAdConsent.getStatus() === 'denied' &&
        window.__testTcfEvents.some(data => data.eventStatus === 'useractioncomplete' &&
          data.vendor?.consents?.[755] !== true), null, {timeout:8000});
      const after = await stored();
      const events = await page.evaluate(() => window.__testTcfEvents);
      const withdrawal = events.find(data => data.eventStatus === 'useractioncomplete' && adConsentStatus(data, true) === 'denied');
      assert.ok(withdrawal, 'expected a completed TCF denial, not just a closed modal');
      assert.notEqual(withdrawal.tcString, accepted.tcString);
      const changedCookies = Object.keys(after).filter(key => after[key] !== before[key]);
      assert.ok(changedCookies.includes('euconsent-v2'), 'InMobi must persist a new TCF cookie');
      if (before.IABGPP_HDR_GppString) assert.ok(changedCookies.includes('IABGPP_HDR_GppString'));
      await page.reload();
      const reloaded = await consent();
      assert.equal(adConsentStatus(reloaded, true), 'denied');
      assert.equal(reloaded.tcString, withdrawal.tcString);
      assert.deepEqual(adRequests, []);
      console.log('PASS: initial reject, accept, useractioncomplete denied, changed TCString and persisted denial');
      console.log('Consent cookies updated:', changedCookies.join(', '));
      console.log('Zero ad requests; banner screenshot:', screenshot);
    } catch (error) {
      console.log((await page.locator('body').innerText()).slice(0,1800));
      console.log(errors);
      throw error;
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
