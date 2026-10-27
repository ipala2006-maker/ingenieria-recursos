const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/home-starter');
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end('{"enabled":false}');
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try {
    for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch (_) {res.writeHead(404).end();}
});
if(process.argv.includes('--serve'))server.listen(8183,'127.0.0.1',()=>console.log('Vista local sin cuentas reales: http://127.0.0.1:8183/'));
else (async()=>{
  let browser;
  try {
    fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:640}]) {
      const mobile=viewport.width<=700,context=await browser.newContext({viewport,hasTouch:mobile,serviceWorkers:'block', ...(process.env.TEST_WEBKIT==='1'?{}:{isMobile:mobile})});
      const errors=[],page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(!url.hostname.match(/^(localhost|127\.0\.0\.1)$/))return route.abort();
        if(url.pathname==='/scripts/onboarding.js')return route.fulfill({contentType:'text/javascript',body:''});
        if(url.pathname==='/scripts/classroom-sync.js')return route.fulfill({contentType:'text/javascript',body:`window.__courses=null;window.__courseFailure=false;window.__openedCourse='';window.EstudiemosClasses={snapshot:()=>window.__courses,status:()=>({failed:window.__courseFailure}),open:options=>{window.__openedCourse=options?.id||'list'},refresh:async()=>{window.__courseFailure=false;window.__courses={classes:[],calendar:[]}},events:()=>[]};window.dispatchEvent(new CustomEvent('estudiemos:classes-updated'));`});
        return route.continue();
      });
      await context.addInitScript(()=>{
        window.EstudiemosAccount={getUser:()=>window.__user?{id:window.__user}:null,getSession:()=>null,getClient:()=>null,whenReady:async()=>({session:null}),isSynchronized:()=>window.__settled!==false,open:()=>{window.__loginOpened=true}};
      });
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
      await page.locator('[data-study-goal-dialog]').waitFor({state:'visible'});
      await page.locator('.study-goal-save').click();
      await page.locator('[data-home-empty]').waitFor({state:'visible'});
      assert.deepEqual(await page.evaluate(()=>Object.entries(EstudiemosHomeLayout.read().visible).filter(([,value])=>value).map(([key])=>key)),['calendar','inbox']);
      if(mobile)assert.equal(await page.locator('[data-home-view=inbox]').getAttribute('aria-selected'),'true');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      if(!mobile)assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
      await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${viewport.width}-empty.png`)});
      if(viewport.width===390){
        await page.evaluate(()=>EstudiemosTheme.set('light'));await page.waitForTimeout(220);
        await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-390-light.png`)});
        await page.evaluate(()=>EstudiemosTheme.set('dark'));
      }
      if(viewport.width===1440){
        await page.locator('[data-home-connect-drive]').click();
        assert.equal(await page.evaluate(()=>window.__loginOpened),true,'Drive starts the existing account authorization flow');
        assert.equal(await page.locator('[data-home-space=workspace]').isVisible(),true);
      }
      await page.locator('[data-home-empty] [data-quick-note-open]').click();
      const title=page.locator('[data-quick-panel=note] [name=title]');await title.fill('Repasar para el parcial');await title.press('Enter');
      await page.locator('[data-home-empty]').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bandeja_agenda'))[0].title),'Repasar para el parcial');
      await page.locator('[data-home-add-tool=classes]').click();
      await page.locator('[data-home-space=classes]').waitFor({state:'visible'});
      await page.waitForFunction(()=>window.EstudiemosClasses && typeof window.__courseFailure==='boolean');
      await page.evaluate(()=>{
        window.__user='student-1';window.__courses={classes:[{id:'class-one',title:'Análisis Matemático II',institution:'Comisión 2'},{id:'archived',title:'Vieja',archived:true}],calendar:[]};
        window.dispatchEvent(new CustomEvent('estudiemos:classes-updated'));
      });
      try {await page.locator('.home-classes__row').waitFor();} catch(error) {console.log(await page.evaluate(()=>({html:document.querySelector('[data-home-classes-list]').outerHTML,model:EstudiemosClasses.snapshot(),user:EstudiemosAccount.getUser(),hidden:document.hidden,layout:EstudiemosHomeLayout.read()})));await page.screenshot({path:path.join(out,'failure.png')});throw error;}
      assert.equal(await page.locator('.home-classes__row').count(),1);
      await page.locator('.home-classes__row').click();assert.equal(await page.evaluate(()=>window.__openedCourse),'class-one');
      if(mobile)await page.locator('[data-home-view=inbox]').click();
      await page.locator('[data-home-tools-open]').click();
      await page.locator('[data-home-customizer-spaces] input[value=progress]').check();
      await page.locator('.home-customizer__done').click();
      if(mobile)await page.locator('[data-home-view=overview]').click();
      assert.equal(await page.locator('[data-home-space=progress]').isVisible(),true);
      await page.waitForTimeout(300);
      if(!mobile)assert.equal(await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll('[data-home-space]:not(.home-space-disabled)')].filter(node=>node.dataset.homeSpace!=='shortcuts');
        const boxes=nodes.map(node=>node.getBoundingClientRect());
        return boxes.every((a,i)=>a.top>=document.querySelector('.study-home__head').getBoundingClientRect().bottom-1&&a.bottom<=innerHeight+1&&boxes.slice(i+1).every(b=>a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));
      }),true,'Tools do not overlap each other or the home heading');
      await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${viewport.width}-tools.png`)});
      if(viewport.width===1440){
        const previous=await page.evaluate(()=>{
          const value=EstudiemosHomeLayout.read(),board=EstudiemosHomeBoard,w=document.querySelector('.workspace-page').clientWidth,h=document.querySelector('.workspace-page').clientHeight-64;
          value.placement=board.remember(board.layout(value.tree,w,h,value.visible),null,value.tree);value.preset='custom';
          EstudiemosHomeLayout.write(value);window.dispatchEvent(new StorageEvent('storage',{key:EstudiemosHomeLayout.key}));return JSON.stringify(value);
        });
        assert.equal(await page.evaluate(()=>EstudiemosHomeCustomizer.show('focus')),false);
        await page.locator('[data-home-reflow-add]').click();
        assert.equal(await page.evaluate(()=>EstudiemosHomeLayout.read().visible.focus),true);
        await page.locator('.home-customizer__done').click();await page.locator('[data-home-customize]').click();await page.locator('.home-layout-undo').click();
        assert.equal(await page.evaluate(()=>JSON.stringify(EstudiemosHomeLayout.read())),previous,'Reflow can be undone without losing custom positions');
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('Home starter: fresh installs, task creation, course opening, optional tools and responsive layouts passed.');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
