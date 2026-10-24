const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/responsive-tools');
const owner='11111111-1111-4111-8111-111111111111',folder='pilot-root',mime='application/vnd.google-apps.folder';
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser;fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{for(const {key,value}of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const [width,height]of[[1440,900],[1024,900],[768,1024],[390,844],[320,568]]){
      const mobile=width<701,context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:width<900,serviceWorkers:'block',reducedMotion:'reduce'});
      await context.addInitScript(owner=>{
        window.EstudiemosAccount={getUser:()=>({id:owner}),getSession:()=>({access_token:'local-fixture'}),getClient:()=>null,whenReady:async()=>({session:{user:{id:owner}}}),isSynchronized:()=>true,open(){}};
        localStorage.setItem('estudiemos_onboarding_v1',JSON.stringify({status:'completed'}));
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{blocks:4,study:56,break:5},currentBlock:4,phase:'study',remaining:3360,running:false,updatedAt:Date.now()}));
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'fixture-task',title:'whatsapp estudiemos y repaso de integrales',type:'Tarea',date:'',done:false}]));
      },owner);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===base){
          if(!url.pathname.startsWith('/api/'))return route.continue();
          const action=url.searchParams.get('drive');return route.fulfill({json:action==='config'?{enabled:true,browseEnabled:true}:action==='status'?{connected:true,browse:true}:action==='token'?{accessToken:'local-drive-fixture',expiresAt:Date.now()+3600000}:{enabled:false}});
        }
        if(url.origin!=='https://www.googleapis.com')return route.abort();
        if(url.pathname.endsWith('/about'))return route.fulfill({json:{user:{emailAddress:'student@example.test'},storageQuota:{limit:'15000000000',usage:'2000000'}}});
        const query=url.searchParams.get('q')||'';
        return route.fulfill({json:{files:query.includes('estudiemosRoot')?[{id:folder,name:'Estudiemos',mimeType:mime}]:['Estudiemos','AM2','Fisica','CyCN','Quimica','Programacion'].map((name,index)=>({id:index?'fixture-'+index:folder,name,mimeType:mime,parents:['root']}))}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base);await page.waitForFunction(()=>window.EstudiemosHomeLayout&&document.body.classList.contains('home-resizable'));
      await page.evaluate(({mobile,width})=>{
        const board=EstudiemosHomeBoard,host=document.querySelector('.workspace-page'),tree=board.defaults(),w=host.clientWidth,h=host.clientHeight-64;
        const placement=board.remember({...board.layout(tree,w,h),width:w,height:h},null,tree),fw=width>1200?330:270;
        placement.boxes.focus={x:0,y:0,w:fw,h:337};placement.boxes.workspace={x:fw+16,y:0,w:width>1200?550:360,h:510};placement.boxes.inbox={x:0,y:353,w:290,h:245};
        EstudiemosHomeLayout.write({version:4,tree,placement,visible:{focus:true,workspace:true,inbox:true,calendar:false,progress:false,assistant:false,shortcuts:false}});
        dispatchEvent(new StorageEvent('storage',{key:EstudiemosHomeLayout.key}));
      },{mobile,width});
      const inbox=page.locator('[data-home-space=inbox]'),space=page.locator('[data-home-space=workspace]'),focus=page.locator('[data-home-space=focus]');
      for(const theme of['dark','light']){
        await page.evaluate(theme=>EstudiemosTheme.set(theme),theme);
        if(mobile)await page.locator('[data-home-view=inbox]').click();
        const title=inbox.locator('.dashboard-agenda__copy strong');await title.waitFor();
        assert.equal(await title.innerText(),'whatsapp estudiemos y repaso de integrales');
        assert.equal(await title.evaluate(el=>getComputedStyle(el).whiteSpace),'normal');
        assert.equal(await title.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1),true,'Inbox shows the full title instead of an ellipsis');
        assert.equal(await inbox.locator('.dashboard-agenda__date').isVisible(),true,'Compact tools keep date information visible');
        await inbox.screenshot({path:path.join(out,`${engine}-${width}-inbox-${theme}.png`)});
        if(mobile)await page.locator('[data-home-view=space]').click();
        await space.locator('.workspace-item').first().waitFor();
        assert.equal(await space.locator('.workspace-item').count(),6);
        const dimensions=await space.locator('.workspace-item').first().boundingBox();assert.ok(dimensions.height<=86,'File tiles remain compact without tiny targets');assert.ok(dimensions.height>=60);
        const columns=await space.locator('.workspace-items').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);if(width===1440)assert.equal(columns,3,'A 550px tool fits three readable file columns');
        assert.equal(await space.locator('.workspace-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
        await space.screenshot({path:path.join(out,`${engine}-${width}-drive-${theme}.png`)});
        if(mobile)await page.locator('[data-home-view=overview]').click();
        await focus.screenshot({path:path.join(out,`${engine}-${width}-focus-${theme}.png`)});
        assert.equal(await focus.locator('.study-playbar').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        if(!mobile)assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
      }
      if(mobile)await page.locator('[data-home-view=inbox]').click();
      await inbox.locator('[data-dashboard-agenda-done]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('bandeja_agenda')).every(item=>item.done));
      assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width}: full task title, compact Drive tiles, fitted controls and completion`);await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
