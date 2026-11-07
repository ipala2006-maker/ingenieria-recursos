const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'https://estudiemos.ar';
const live = process.argv.includes('--live');
const engine = process.env.TEST_WEBKIT === '1' ? webkit : chromium;
const out = path.join(root, 'tmp', 'home-panel-polish' + (live ? '-live' : ''));
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};

async function main() {
  await fs.mkdir(out, {recursive:true});
  const browser = await engine.launch(engine === chromium ? {channel:'chrome'} : {});
  try {
    for (const [width,height] of [[1440,900],[768,1024],[390,844],[361,700],[320,640]]) {
      const mobile = width < 701;
      const context = await browser.newContext({
        viewport:{width,height}, timezoneId:'America/Argentina/Buenos_Aires',
        hasTouch:mobile, reducedMotion:'reduce', serviceWorkers:'block'
      });
      await context.addInitScript(() => {
        localStorage.setItem('estudiemos_onboarding_v1', '{"status":"completed"}');
        localStorage.setItem('estudiemos_pomodoro_streak', '{"days":{},"goal":{"minutes":25,"updatedAt":1}}');
        localStorage.setItem('estudiemos_home_layout_local', JSON.stringify({
          version:5, preset:'light', visible:{
            focus:false, progress:false, assistant:false, shortcuts:false,
            workspace:false, classes:false, calendar:true, inbox:true
          }
        }));
        localStorage.setItem('bandeja_agenda', JSON.stringify([
          {id:'note', type:'Tarea', title:'Repasar para el parcial', date:'2026-11-07', horaInicio:'14:00'}
        ]));
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({json:{enabled:false}});
        if (live) return route.continue();
        const file = path.resolve(root, '.'+(url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        if (!file.startsWith(root + path.sep)) return route.abort();
        try {
          return route.fulfill({contentType:mime[path.extname(file)] || 'application/octet-stream',body:await fs.readFile(file)});
        } catch (_) { return route.fulfill({status:404,body:''}); }
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-11-07T15:00:00Z'));
      await page.goto(origin, {waitUntil:'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      const inbox = page.locator('[data-home-space=inbox]');
      const calendar = page.locator('[data-dashboard-calendar-widget]');
      const nav = page.locator('[data-home-navigation]');
      const routeTo = async view => { if (mobile) await nav.locator('[data-home-view='+view+']').click(); };
      const checkLabel = async panel => {
        const values = await panel.locator('.dashboard-widget__eyebrow').evaluate(el => {
          const style = getComputedStyle(el);
          return [style.fontSize,style.fontWeight,style.textTransform,style.color !== getComputedStyle(el.parentElement).color];
        });
        assert.deepEqual(values, ['10px','600','uppercase',true]);
      };
      const controlShape = el => {
        const style = getComputedStyle(el);
        return [style.borderRadius,style.paddingBlockStart,style.paddingInlineStart];
      };
      for (const theme of ['dark','light']) {
        await page.evaluate(value => EstudiemosTheme.set(value), theme);
        await routeTo('inbox');
        await checkLabel(inbox);
        const actions = inbox.locator('[data-home-add-tool],[data-home-tools-open]');
        assert.equal(await actions.count(),3);
        for (const action of await actions.all()) {
          await action.waitFor({state:'visible'});
          assert.deepEqual(await action.evaluate(controlShape), ['8px','8px','10px']);
          const box = await action.boundingBox(), panel = await inbox.boundingBox();
          assert.ok(box.height >= 44 && box.x+box.width <= panel.x+panel.width+1 && box.y+box.height <= panel.y+panel.height+1);
        }
        await inbox.screenshot({path:path.join(out,engine.name()+'-'+width+'-'+theme+'-inbox.png')});
        await routeTo('calendar');
        await checkLabel(calendar);
        for (const view of ['month','week']) {
          await calendar.locator('[data-dashboard-calendar-view='+view+']').click();
          const today = calendar.locator('[aria-current=date]');
          await today.waitFor({state:'visible'});
          assert.equal(await today.count(),1);
          assert.equal(await today.getAttribute('data-dashboard-date'),'2026-11-07');
          const paint = await calendar.locator('[data-dashboard-calendar]').evaluate((grid, mode) => {
            const el = grid.querySelector('[aria-current=date]');
            const other = grid.querySelector('[data-dashboard-date]:not(.is-today):not(.is-outside)');
            return {
              tinted:getComputedStyle(el).backgroundColor !== getComputedStyle(other).backgroundColor,
              marker:mode==='month'
                ? getComputedStyle(el.querySelector('.dashboard-calendar__number')).backgroundColor !== getComputedStyle(other.querySelector('.dashboard-calendar__number')).backgroundColor
                : getComputedStyle(el,'::before').width==='2px'
            };
          },view);
          assert.deepEqual(paint,{tinted:true,marker:true});
          if (view==='month' && width===320) {
            await calendar.screenshot({path:path.join(out,engine.name()+'-320-'+theme+'-month.png')});
          }
        }
        const filter = calendar.locator('[data-calendar-filter]');
        assert.deepEqual(await filter.evaluate(controlShape), ['8px','8px','10px']);
        await filter.selectOption('dated');
        assert.equal(await filter.inputValue(),'dated');
        assert.equal(await filter.evaluate(el => {
          const style = getComputedStyle(el);
          const context = document.createElement('canvas').getContext('2d');
          context.font = style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
          const width = el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-18;
          return [...el.options].every(option=>context.measureText(option.textContent).width<=width);
        }),true,'calendar filter labels fit with room for the native arrow');
        await calendar.screenshot({path:path.join(out,engine.name()+'-'+width+'-'+theme+'-calendar.png')});
        if (mobile) {
          const tab = nav.locator('[data-home-view=calendar]');
          assert.equal(await tab.getAttribute('aria-selected'),'true');
          assert.deepEqual(await tab.evaluate(controlShape), ['8px','8px',width<=360?'4px':'10px']);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      }
      await routeTo('inbox');
      await inbox.locator('[data-home-tools-open]').click();
      await page.locator('[data-home-customizer]').waitFor({state:'visible'});
      await page.locator('.home-customizer__done').click();
      if (mobile) {
        await page.evaluate(() => {
          const layout = EstudiemosHomeLayout.read();
          EstudiemosHomeLayout.write({...layout, visible:{...layout.visible, focus:true, workspace:true}});
          dispatchEvent(new StorageEvent('storage',{key:EstudiemosHomeLayout.key}));
        });
        const tabs = nav.locator('button:visible');
        await page.waitForFunction(()=>document.querySelectorAll('[data-home-navigation] button:not([hidden])').length===4);
        assert.equal(await tabs.count(),4);
        assert.equal(await tabs.evaluateAll(nodes => nodes.every(el => {
          const box = el.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(el);
          return box.height >= 44 && [...text.getClientRects()].every(r=>r.left>=box.left-1&&r.right<=box.right+1);
        })),true,'all four labels fit the narrow navigation');
      }
      console.log('PASS '+engine.name()+' '+width+'px: labels, quick actions, bottom controls and today in both themes');
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
