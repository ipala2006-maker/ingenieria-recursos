const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'https://estudiemos.ar';
const out = path.join(root, 'tmp', 'account-recovery');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2' };

async function fixture(context, state) {
  await context.addInitScript((initial) => {
    localStorage.setItem('estudiemos_onboarding_v1', '{"status":"completed"}');
    localStorage.setItem('estudiemos_pomodoro_streak', '{"days":{},"goal":{"minutes":25,"updatedAt":1}}');
    window.trace = { requests:[], options:[], verifies:[], updates:[], signouts:[] };
    window.testAuth = { updateFails:!initial.link, validCode:initial.mobile ? '04825193' : '048251' };
    const user = { id:'11111111-1111-4111-8111-111111111111', email:'prueba@example.test' };
    const recoverySession = { user, access_token:'fake-recovery-token', refresh_token:'fake-recovery-refresh' };
    const request = async (email, options) => {
      window.trace.requests.push({ email, options });
      return { error: email === 'ausente@example.test' ? { code:'user_not_found' } : null };
    };
    window.supabase = { createClient(_url, _key, options) {
      if (options.auth.persistSession === false) {
        window.trace.options.push(options.auth);
        return { auth:{
          async verifyOtp(args) {
            window.trace.verifies.push(args);
            if (window.testAuth.pauseVerify) await new Promise(resolve => { window.testAuth.finishVerify = resolve; });
            if (args.token !== window.testAuth.validCode) return { error:{ code:'otp_expired' } };
            window.testAuth.validCode = '';
            return { data:{ session:recoverySession }, error:null };
          },
          async updateUser(args) {
            window.trace.updates.push(args);
            if (window.testAuth.updateFails) {
              window.testAuth.updateFails = false;
              return { error:{ code:'weak_password' } };
            }
            return { error:null };
          },
          async signOut(args) { window.trace.signouts.push(args); return { error:null }; }
        } };
      }
      const login = initial.link ? recoverySession : null;
      return { auth:{
        async getSession() { return { data:{ session:login }, error:null }; },
        onAuthStateChange(fn) { if (initial.link) setTimeout(() => fn('PASSWORD_RECOVERY', login), 0); },
        resetPasswordForEmail:request,
        async updateUser(args) { window.trace.updates.push(args); return { error:null }; }
      } };
    } };
  }, state);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'challenges.cloudflare.com') return route.fulfill({contentType:'text/javascript',body:`
      window.turnstile = {
        render(container, options) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'Verificar (prueba)';
          button.addEventListener('click', () => options.callback('captcha-fixture'));
          container.replaceChildren(button);
          return container;
        },
        remove(container) { container.replaceChildren(); },
        reset() {}
      };
    `});
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/account-config') return route.fulfill({json:{enabled:true,url:'https://auth.example.test',publishableKey:'public-fixture',captchaSiteKey:'fixture'}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({json:{enabled:false}});
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) return route.abort();
    try { return route.fulfill({contentType:mime[path.extname(file)] || 'application/octet-stream',body:await fs.readFile(file)}); }
    catch (_) { return route.fulfill({status:404,body:''}); }
  });
}

async function run(engine, width, height) {
  const mobile = width < 600;
  const browser = await engine.launch(engine === chromium ? {channel:'chrome'} : {});
  const context = await browser.newContext({viewport:{width,height},hasTouch:mobile,reducedMotion:'reduce',serviceWorkers:'block'});
  await fixture(context, {link:false,mobile});
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({time:new Date('2026-11-08T15:00:00Z')});
    await page.goto(origin);
    const dialog = page.getByRole('dialog');
    await page.getByRole('button',{name:'Abrir cuenta'}).click();
    await dialog.getByRole('button',{name:'Olvidé mi contraseña'}).click();
    await dialog.getByRole('heading',{name:'Recuperar contraseña'}).waitFor();
    const verify = dialog.getByRole('button',{name:'Verificar (prueba)'});
    const confirmCaptcha = () => verify.click();
    const send = dialog.getByRole('button',{name:'Enviar código'});
    await send.click();
    await dialog.getByText('Escribí un correo electrónico válido.').waitFor();
    await dialog.getByRole('textbox',{name:'Correo electrónico'}).fill('Prueba@Example.Test');
    await send.click();
    await dialog.getByText('Completá la comprobación de seguridad que aparece junto al formulario.').waitFor();
    assert.equal(await page.evaluate(() => trace.requests.length), 0);
    await confirmCaptcha();
    await dialog.locator('.account-panel').screenshot({path:path.join(out,engine.name()+'-'+width+'-request.png')});
    await send.click();
    await dialog.getByRole('heading',{name:'Nueva contraseña'}).waitFor();
    const intro = dialog.locator('[data-recovery-intro]');
    assert.equal(await intro.textContent(), 'Si hay una cuenta para prueba@example.test, vas a recibir un correo. Revisá también Spam.');
    assert.equal(await dialog.locator('[data-recovery-resend]').isDisabled(), true);
    await page.clock.fastForward(61000);
    await dialog.getByRole('button',{name:'Reenviar código',exact:true}).click();
    assert.equal(await page.evaluate(() => trace.requests.length), 1, 'resend requires a fresh challenge');
    await confirmCaptcha();
    await dialog.getByRole('button',{name:'Confirmar reenvío'}).click();
    await dialog.getByText('Si la cuenta existe y el envío está disponible, vas a recibir un código nuevo.').waitFor();
    assert.equal(await page.evaluate(() => trace.requests.length), 2);
    assert.deepEqual(await page.evaluate(() => trace.requests[0]), {
      email:'prueba@example.test', options:{redirectTo:origin+'/', captchaToken:'captcha-fixture'}
    });
    const otp = dialog.getByLabel('Código de verificación');
    assert.equal(await otp.getAttribute('inputmode'), 'numeric');
    assert.equal(await otp.getAttribute('autocomplete'), 'one-time-code');
    await otp.fill('111 111');
    assert.equal(await otp.inputValue(), '111111');
    await dialog.getByLabel('Nueva contraseña',{exact:true}).fill('abc');
    await dialog.getByLabel('Confirmar contraseña').fill('different');
    await dialog.getByText('Las contraseñas no coinciden').waitFor();
    const save = dialog.getByRole('button',{name:'Guardar contraseña'});
    await save.click();
    assert.equal(await page.evaluate(() => trace.verifies.length), 0);
    await dialog.getByLabel('Nueva contraseña',{exact:true}).fill('fictional-password');
    await dialog.getByLabel('Confirmar contraseña').fill('fictional-password');
    await dialog.getByText('Las contraseñas coinciden',{exact:true}).waitFor();
    await save.click();
    await dialog.getByText('El código no es válido o venció.').waitFor();
    assert.equal(await page.evaluate(() => trace.updates.length), 0);
    await dialog.locator('.account-panel').screenshot({path:path.join(out,engine.name()+'-'+width+'-code.png')});
    const fits = await dialog.locator('.account-panel').evaluate(panel =>
      panel.scrollWidth <= panel.clientWidth && panel.getBoundingClientRect().width <= innerWidth);
    assert.equal(fits,true);
    await otp.fill(mobile ? '0482 5193' : '048 251');
    await save.click();
    await dialog.getByText('Elegí una contraseña más segura.').waitFor();
    assert.equal(await otp.isVisible(), false, 'do not ask to re-enter an already consumed code');
    assert.equal(await page.evaluate(() => EstudiemosAccount.getSession()), null);
    await dialog.getByLabel('Nueva contraseña',{exact:true}).fill('fictional-password-2');
    await dialog.getByLabel('Confirmar contraseña').fill('fictional-password-2');
    await save.click();
    await dialog.getByText('Contraseña actualizada. Ya podés ingresar.').waitFor();
    assert.equal(await dialog.getByRole('textbox',{name:'Correo electrónico'}).inputValue(), 'prueba@example.test');
    assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).inputValue(), '');
    const trace = await page.evaluate(() => window.trace);
    assert.deepEqual(trace.verifies.map(call => call.type), ['recovery','recovery']);
    assert.equal(trace.verifies[1].token,mobile ? '04825193' : '048251');
    assert.equal(trace.updates.length,2);
    assert.deepEqual(trace.signouts,[{scope:'local'}]);
    assert.ok(trace.options.every(opt => opt.storageKey === 'estudiemos-password-recovery' &&
      !opt.persistSession && !opt.autoRefreshToken && !opt.detectSessionInUrl));
    await dialog.getByRole('button',{name:'Olvidé mi contraseña'}).click();
    await dialog.getByRole('textbox',{name:'Correo electrónico'}).fill('ausente@example.test');
    await confirmCaptcha();
    await send.click();
    await dialog.getByRole('heading',{name:'Nueva contraseña'}).waitFor();
    assert.equal(await intro.textContent(), 'Si hay una cuenta para ausente@example.test, vas a recibir un correo. Revisá también Spam.');
    await dialog.getByRole('button',{name:'Cambiar correo'}).click();
    await dialog.getByRole('heading',{name:'Recuperar contraseña'}).waitFor();
    await dialog.getByRole('button',{name:'Volver a ingresar'}).click();
    await dialog.getByRole('button',{name:'Olvidé mi contraseña'}).waitFor();
    await dialog.getByRole('button',{name:'Olvidé mi contraseña'}).click();
    await dialog.getByRole('textbox',{name:'Correo electrónico'}).fill('prueba@example.test');
    await send.click();
    await dialog.getByRole('heading',{name:'Nueva contraseña'}).waitFor();
    await page.evaluate(() => Object.assign(testAuth, {pauseVerify:true,validCode:'123456'}));
    await otp.fill('123456');
    await dialog.getByLabel('Nueva contraseña',{exact:true}).fill('not-saved');
    await dialog.getByLabel('Confirmar contraseña').fill('not-saved');
    await save.click();
    await page.waitForFunction(() => Boolean(testAuth.finishVerify));
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await page.evaluate(() => testAuth.finishVerify());
    await page.waitForFunction(() => trace.signouts.length === 2);
    assert.equal(await page.evaluate(() => trace.updates.length),2,'a late code verification cannot change the password after dismissal');
    assert.deepEqual(errors, []);
    console.log(engine.name(), width, 'recovery passed');

    if (!mobile) {
      const linkContext = await browser.newContext({serviceWorkers:'block'});
      await fixture(linkContext, {link:true});
      const link = await linkContext.newPage();
      await link.goto(origin+'/materias.html');
      const panel = link.getByRole('dialog');
      await panel.getByRole('heading',{name:'Nueva contraseña'}).waitFor();
      assert.equal(await panel.getByLabel('Código de verificación').isVisible(), false);
      await panel.getByLabel('Nueva contraseña',{exact:true}).fill('fixture-link-new');
      await panel.getByLabel('Confirmar contraseña').fill('fixture-link-new');
      await panel.getByRole('button',{name:'Guardar contraseña'}).click();
      await panel.getByText('Contraseña actualizada.',{exact:true}).waitFor();
      assert.equal(await link.evaluate(() => trace.verifies.length),0);
      await linkContext.close();
    }
  } finally { await browser.close(); }
}

(async () => {
  await fs.mkdir(out,{recursive:true});
  await run(chromium,1440,900);
  await run(chromium,360,640);
  await run(webkit,320,568);
})().catch(error => { console.error(error); process.exitCode = 1; });
