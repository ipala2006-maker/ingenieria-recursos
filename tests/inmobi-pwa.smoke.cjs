const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const origin = 'https://estudiemos.ar';
const live = process.argv.includes('--live');
const simulateAds = !live && process.env.TEST_ADS_FIXTURE === '1';
const engine = process.env.TEST_WEBKIT === '1' ? webkit : chromium;
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
const aliases = {'/':'/index.html', '/mi-espacio':'/mi-espacio.html', '/materias':'/materias.html', '/consentimiento':'/consentimiento.html'};
const fixture = `;if (window.EstudiemosAccount) window.EstudiemosAccount.getUser = () => window.__fixtureUser;`;

async function main() {
  const { default: frontdoor } = await import('../cloudflare/frontdoor.mjs');
  const browser = await engine.launch(engine === chromium ? {channel:'chrome'} : {});
  const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
  const page = await context.newPage();
  const errors = [];
  let loads = 0;
  page.on('pageerror', error => errors.push(error.message));
  try {
    await context.addInitScript(() => {
      window.__fixtureUser = {id:'fixture-free'};
      localStorage.setItem('estudiemos_onboarding_v1','{"status":"completed"}');
      localStorage.setItem('estudiemos_pomodoro_streak','{"days":{},"goal":{"minutes":25,"updatedAt":1}}');
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'pagead2.googlesyndication.com' && url.pathname === '/pagead/js/adsbygoogle.js') {
        loads++;
        return route.fulfill({contentType:'text/javascript',body:'window.__simulatedAds = true;'});
      }
      if (/(^|\.)(inmobi\.com|inmobicdn\.net|inmobi-choice\.io)$/.test(url.hostname)) return route.continue();
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({contentType:'application/json',body:'{"enabled":false}'});
      if (live) {
        if (url.pathname !== '/scripts/account.js') return route.continue();
        const response = await route.fetch();
        return route.fulfill({response,body:(await response.text()) + fixture});
      }
      const file = path.resolve(root,'.'+(aliases[url.pathname] || url.pathname));
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        let body = await readFile(file);
        if (url.pathname === '/scripts/account.js') body = Buffer.from(body.toString() + fixture);
        if (simulateAds && url.pathname === '/shared/release.js') body = Buffer.from(body.toString().replace(/ads: (true|false)/, 'ads: true'));
        const headers = {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'};
        const response = await frontdoor.fetch(new Request(url), { ASSETS: {fetch:async () => new Response(body,{headers})} });
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
      } catch (_) { return route.fulfill({status:404,body:''}); }
    });
    const go = pathname => page.goto(origin + pathname);
    const dialog = page.getByRole('dialog',{name:/privacy|privacidad/i});
    const reject = dialog.getByRole('button',{name:/^(rechazar|reject|disagree)$/i}).filter({visible:true});
    const accept = dialog.getByRole('button',{name:/^(aceptar|accept|agree)( todo| all)?$/i}).filter({visible:true});
    const rejectAll = dialog.getByRole('button',{name:/^reject all$|^rechazar todo$/i}).filter({visible:true});
    const reopen = async () => {
      await page.locator('[data-account-open]').filter({visible:true}).click();
      await page.locator('.account-shell').getByRole('link',{name:'Preferencias de cookies'}).click();
      await accept.waitFor({timeout:12000});
      assert.equal(new URL(page.url()).pathname, '/', 'the account link opens CMP without leaving the home');
    };
    const state = () => page.evaluate(() => new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('No completed TCF choice')),7000);
      window.__tcfapi('addEventListener',2,(data,ok) => {
        if (!ok || !['useractioncomplete','tcloaded'].includes(data.eventStatus)) return;
        window.__tcfapi('removeEventListener',2,()=>{},data.listenerId);
        clearTimeout(timeout);
        resolve({google:data.vendor?.consents?.[755] === true,tcString:data.tcString});
      });
    }));
    const response = await go('/?tutorial=1');
    assert.match(response.headers()['content-security-policy'], /script-src [^;]+https:\/\/cmp\.inmobi\.com/);
    await reject.waitFor({timeout:20000});
    const tutorial = page.locator('.onboarding-layer');
    assert.equal(await tutorial.isVisible(),false,'the tour must not cover the privacy controls');
    assert.equal(loads,0,'no ad requests before a decision');
    await reject.tap();
    const tourStep = step => page.locator(`.onboarding-layer[data-step=${step}]:not(.is-starting):not(.is-changing) .driver-popover-description`);
    await tourStep('welcome').waitFor({state:'visible'});
    await page.touchscreen.tap(375,100);
    await tourStep('note').waitFor({state:'visible'});
    await page.touchscreen.tap(15,100);
    await tourStep('welcome').waitFor({state:'visible'});
    await tutorial.getByRole('button',{name:'Omitir'}).tap();
    await tutorial.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.estudiemos_onboarding_v1).status),'skipped');
    assert.equal((await state()).google,false);
    assert.equal(loads,0);
    await reopen();
    await accept.click();
    if (simulateAds) await page.waitForFunction(() => window.__simulatedAds === true);
    const expectedLoads = Number(simulateAds);
    assert.equal(loads,expectedLoads,'consent does not bypass the production pause');
    const granted = await state();
    assert.equal(granted.google,true);
    await reopen();
    const navigation = simulateAds ? page.waitForEvent('domcontentloaded') : null;
    await rejectAll.click();
    if (navigation) await navigation;
    else await page.reload();
    const denied = await state();
    assert.equal(denied.google,false);
    assert.notEqual(denied.tcString,granted.tcString);
    for (const pathname of ['/mi-espacio','/materias']) {
      await go(pathname);
      assert.deepEqual(await state(),denied,'the denial is shared across the PWA');
      assert.equal(await page.locator('script[data-estudiemos-adsense]').count(),0);
    }
    await go('/consentimiento?preferencias=1');
    await rejectAll.waitFor({timeout:12000});
    assert.equal(loads,expectedLoads);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${engine.name()} ${live?'production':'local'}: real InMobi, persistent denial and revocation; AdSense SDK requests: ${loads}`);
  } catch (error) {
    console.log('Page errors:',errors);
    console.log((await page.locator('body').innerText()).slice(-1800));
    throw error;
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
