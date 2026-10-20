const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),live=process.env.TEST_BASE_URL;
if(live)assert.equal(new URL(live).origin,'https://estudiemos-app.vercel.app');
const output=path.join(root,'tmp/mobile-navigation',live?'live':'local');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  fs.mkdirSync(output,{recursive:true});let browser;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file)]){res.writeHead(404).end();return;}
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',types[path.extname(file)]);res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    if(!live)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=live?new URL(live).origin:'http://127.0.0.1:'+server.address().port,engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';
    browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const [width,height] of [[320,568],[390,844],[430,932],[700,900],[844,390]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:width===430?'reduce':'no-preference',timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
      await context.addInitScript(()=>{
        window.EstudiemosAccount={getUser:()=>null,getSession:()=>null,getClient:()=>null,whenReady:async()=>({session:null}),open(){}};
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify({version:4,visible:{shortcuts:true}}));
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'demo',title:'Repasar para el parcial',date:'',type:'Tarea'}]));
      });
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        return route.fulfill({json:url.searchParams.get('drive')==='config'?{enabled:true,browseEnabled:true}:{enabled:false,connected:false}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);await page.locator('[data-home-navigation]').waitFor();await page.locator('[data-home-timer]:enabled').waitFor();
      const nav=page.locator('[data-home-navigation]'),keys=['overview','space','calendar','inbox'];
      assert.equal(await page.locator('[data-home-shortcut]:visible').count(),0,'only one mobile navigation; no duplicate shortcut cards');
      async function selected(key){
        assert.equal(await nav.locator('[aria-selected=true]').count(),1);
        assert.equal(await nav.locator('[aria-selected=true]').getAttribute('data-home-view'),key);
        const panel=await nav.locator(`[data-home-view=${key}]`).getAttribute('aria-controls');
        assert.equal(await page.locator('#'+panel).evaluate(el=>!el.hidden&&!el.inert),true,'selected panel is usable');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),'viewport never overflows');
        const r=await nav.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height+1,'navigation stays on screen');
      }
      async function tap(key,edge=false){
        const button=nav.locator(`[data-home-view=${key}]`),r=await button.boundingBox();
        assert.ok(r.width>=44&&r.height>=48,'comfortable touch target');
        const x=r.x+(edge?5:r.width/2),y=r.y+r.height/2;
        assert.ok(await button.evaluate((el,{x,y})=>el.contains(document.elementFromPoint(x,y)),{x,y}),'touch target is not covered');
        await page.touchscreen.tap(x,y);await selected(key);
      }
      for(const key of ['space','calendar','inbox','overview'])await tap(key,true);
      await tap('calendar');await tap('inbox');await page.goBack();await selected('calendar');await page.goForward();await selected('inbox');
      for(let i=0;i<12;i++)await tap(keys[i%keys.length]);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'calendar'}})));await selected('calendar');
      await page.reload();await nav.waitFor();await selected('calendar');
      await tap('overview');
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>EstudiemosTheme.set(theme),theme);
        await page.waitForTimeout(350);
        await page.screenshot({path:path.join(output,`${engine}-${width}-${theme}.png`)});
        await nav.screenshot({path:path.join(output,`${engine}-${width}-nav-${theme}.png`)});
      }
      await page.evaluate(()=>{
        const value=EstudiemosHomeLayout.read();value.visible.calendar=false;value.visible.workspace=false;
        EstudiemosHomeLayout.write(value);window.dispatchEvent(new CustomEvent('estudiemos:home-customized'));
      });
      assert.equal(await nav.locator('[data-home-view=calendar]').isVisible(),false);
      assert.equal(await nav.locator('[data-home-view=space]').isVisible(),false);
      const remaining=await nav.locator('button:visible').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().width));
      assert.equal(remaining.length,2);assert.ok(Math.abs(remaining[0]-remaining[1])<2,'hidden tools leave no empty slots');
      await nav.locator('[data-home-view=overview]').focus();await page.keyboard.press('ArrowRight');await selected('inbox');
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'calendar'}})));await selected('inbox');
      await page.evaluate(()=>{
        const value=EstudiemosHomeLayout.read();value.visible.inbox=false;
        EstudiemosHomeLayout.write(value);window.dispatchEvent(new CustomEvent('estudiemos:home-customized'));
      });await selected('overview');
      await page.locator('[data-home-customize]').tap();await page.locator('.home-layout-manage').tap();
      assert.equal(await page.locator('[data-home-customizer-spaces] input[value=shortcuts]').count(),0,'retired shortcuts have no misleading setting');
      await page.locator('.home-customizer__done').tap();await page.locator('.home-layout-done').tap();
      await page.setViewportSize({width:1440,height:900});await nav.waitFor({state:'hidden'});
      assert.equal(await page.locator('[data-home-space=focus]').evaluate(el=>el.inert),false);
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('home-board')),true);
      await page.setViewportSize({width,height});await nav.waitFor();await selected('overview');
      assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width}x${height}: touch targets, single navigation, rapid taps, history, visibility, rotation and both themes`);
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
