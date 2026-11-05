const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const origin = 'https://estudiemos.ar';
const url = origin + '/consentimiento';
const live = process.argv.includes('--live');
const files = {
  '/consentimiento': ['consentimiento.html', 'text/html'],
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
      const reject = page.getByRole('button', {name:/^(rechazar|reject|disagree)( todo| all)?$/i}).first();
      await reject.waitFor({timeout:18000});
      const accept = page.getByRole('button', {name:/^(aceptar|accept|agree)( todo| all)?$/i}).first();
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
      const reopen = page.getByText(/^(privacidad|privacy|privacy choices)$/i, {exact:true}).filter({visible:true}).first();
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
      await reopen.click({timeout:8000});
      const save = page.getByRole('button', {name:/save.*exit|guardar/i});
      await save.waitFor({timeout:8000});
      const switches = page.getByText(/^on$/i, {exact:true}).filter({visible:true});
      const active = await switches.count();
      assert.ok(active > 0, 'expected checked consent preferences');
      for (let index = 0; index < active; index++) await switches.first().click();
      await save.click();
      await save.waitFor({state:'hidden'});
      await page.reload();
      const revocation = adConsentStatus(await consent(), true);
      assert.deepEqual(adRequests, []);
      console.log('PASS: real banner, initial reject, reopen and persistent accept; zero ad requests', screenshot);
      if (revocation !== 'denied') {
        console.warn('BLOCKED FOR ROLLOUT: provider did not persist revocation as denied:', revocation);
        if (process.argv.includes('--require-revocation')) assert.equal(revocation, 'denied');
      } else console.log('PASS: revocation persisted after reload');
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
