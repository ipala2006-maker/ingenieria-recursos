const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),live=process.env.TEST_BASE_URL,output=path.join(root,'tmp/control-polish',live?'live':'local');
if(live)assert.equal(new URL(live).origin,'https://estudiemos-app.vercel.app');
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
const mime='application/vnd.google-apps.folder',owner='11111111-1111-4111-8111-111111111111',folder='pilot-app-folder';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
async function contained(child,parent){
  const a=await child.boundingBox(),b=await parent.boundingBox();
  assert.ok(a&&b&&a.x>=b.x-1&&a.y>=b.y-1&&a.x+a.width<=b.x+b.width+1&&a.y+a.height<=b.y+b.height+1,`Clipped control: ${JSON.stringify({a,b})}`);
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});let browser;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file)]){res.writeHead(404).end();return;}
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',types[path.extname(file)]);res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    if(!live)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=live?new URL(live).origin:'http://127.0.0.1:'+server.address().port;
    const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    const sizes=[[1440,900,330,337,550],[1440,900,240,230,300],[1440,900,700,337,550],[768,1024,300,337,400],[390,844],[320,568]];
    for(const [width,height,focusWidth,focusHeight,driveWidth] of sizes.filter(size=>!process.env.TEST_WIDTH||size[0]===Number(process.env.TEST_WIDTH))){
      const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,timezoneId:'America/Argentina/Buenos_Aires',serviceWorkers:'block'});
      await context.addInitScript(owner=>{
        window.EstudiemosAccount={getUser:()=>({id:owner,email:'estudiante@example.test'}),getSession:()=>({access_token:'local-pilot'}),getClient:()=>null,whenReady:async()=>({session:{user:{id:owner}}}),isSynchronized:()=>true,open(){}};
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
      },owner);
      await context.route('**/*',route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===base){
          if(!url.pathname.startsWith('/api/'))return route.continue();
          const action=url.searchParams.get('drive');
          return route.fulfill({json:action==='config'?{enabled:true,browseEnabled:true}:action==='status'?{connected:true,browse:true}:action==='token'?{accessToken:'local-pilot-google',expiresAt:Date.now()+3600000}:{enabled:false}});
        }
        if(url.origin!=='https://www.googleapis.com')return route.abort();
        if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'*'}});
        if(url.pathname.endsWith('/about'))return route.fulfill({json:{user:{emailAddress:'estudiante@example.test'},storageQuota:{limit:'15000000000',usage:'2000000000'}}});
        const q=url.searchParams.get('q')||'';
        if(q.includes('estudiemosRoot'))return route.fulfill({json:{files:[{id:folder,name:'Estudiemos',mimeType:mime}]}});
        if(url.pathname.endsWith('/'+folder))return route.fulfill({json:{id:folder,name:'Estudiemos',mimeType:mime,parents:['root']}});
        return route.fulfill({json:{files:q.includes("'root' in parents")?[{id:folder,name:'Estudiemos',mimeType:mime,parents:['root']}]:[{id:'sample',name:'Guía de ejercicios.pdf',mimeType:'application/pdf',parents:[folder],size:'34000',appProperties:{estudiemosOwner:owner,estudiemosSpace:folder}}]}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base);await page.waitForFunction(()=>window.EstudiemosStudy&&window.EstudiemosHomeLayout&&document.body.classList.contains('home-resizable'));
      if(width>=701)await page.evaluate(({focusWidth,focusHeight,driveWidth})=>{
        const board=window.EstudiemosHomeBoard,host=document.querySelector('.workspace-page'),w=host.clientWidth,h=host.clientHeight-64,tree=board.defaults();
        const placement=board.remember({...board.layout(tree,w,h),width:w,height:h},null,tree);
        placement.boxes.focus={x:0,y:0,w:focusWidth,h:focusHeight};placement.boxes.workspace={x:focusWidth+16,y:0,w:driveWidth,h:Math.min(460,h)};
        EstudiemosHomeLayout.write({version:4,tree,placement,visible:{focus:true,workspace:true,progress:false,calendar:false,inbox:false,assistant:false,shortcuts:false}});
        window.dispatchEvent(new StorageEvent('storage',{key:EstudiemosHomeLayout.key}));
      },{focusWidth,focusHeight,driveWidth});
      const focus=page.locator('[data-home-space=focus]'),space=page.locator('[data-home-space=workspace]');
      await page.locator('[data-home-timer]:enabled').waitFor();
      // Windows WebKit has native same-tab navigation crashes, including on the baseline.
      // Chrome exercises the click; Windows WebKit checks the destination in a fresh page.
      if(width<500)await page.locator('[data-home-view=space]').click();
      await space.locator('[data-workspace-open="'+folder+'"]').waitFor();
      if(engine==='webkit'&&process.platform==='win32'&&width<500){
        const library=await context.newPage(),href=await space.locator('.workspace-library-title').getAttribute('href');
        await library.goto(new URL(href,base).href);await library.locator('[data-workspace-open="'+folder+'"]').waitFor();
        assert.ok(await library.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'standalone library remains responsive');
        await library.close();console.log(`LIMIT webkit ${width}: native same-tab click not certified on Windows; link destination checked separately`);
      }else{
        await space.locator('.workspace-library-title').click();await page.waitForURL('**/mi-espacio.html');
        await page.locator('[data-workspace-open="'+folder+'"]').waitFor();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'full library navigation remains responsive');
        await page.goBack();await page.locator('[data-home-timer]:enabled').waitFor({state:'attached'});
      }
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);
        if(width<500)await page.locator('[data-home-view=overview]').click();
        await focus.scrollIntoViewIfNeeded();
        const playbar=focus.locator('.study-playbar'),buttons=playbar.locator('button');
        for(let i=0;i<await buttons.count();i++){await contained(buttons.nth(i),focus);const r=await buttons.nth(i).boundingBox();assert.equal(Math.round(r.height),44);assert.ok(r.width>=(width<500?44:32));}
        const play=await playbar.boundingBox(),nudge=await focus.locator('.study-nudge').boundingBox();
        assert.ok(Math.abs(play.width-nudge.width)<2,'minute and transport controls share one width');
        assert.ok(nudge.y>=play.y+play.height+6,'clear separation between control rows');
        await contained(focus.locator('[data-home-clock]'),focus);
        await focus.screenshot({path:path.join(output,`${engine}-${width}-${focusWidth||'mobile'}-focus-${theme}.png`)});
        if(width<500)await page.locator('[data-home-view=space]').click();
        await space.locator('[data-workspace-open="'+folder+'"]').waitFor();
        assert.equal(await space.locator('a.workspace-tool-icon').count(),0,'remove the broken expand arrows');
        assert.equal(await space.locator('.workspace-library-title').getAttribute('href'),'./mi-espacio.html','title keeps access to the complete library');
        for(const selector of ['.workspace-search','.workspace-sort','.workspace-view-toggle'])await contained(space.locator(selector),space);
        const select=space.locator('[data-workspace-sort]');
        assert.ok(await select.evaluate(el=>{const s=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font;return ctx.measureText(el.selectedOptions[0].text).width<=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+1;}),'sort label is fully visible');
        assert.ok(await space.locator('.workspace-tool-icon svg').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).every(el=>{const s=getComputedStyle(el);return s.fill==='none'&&s.stroke!=='none';})),'header icons never use accidental black fills');
        assert.equal(await space.locator('[data-drive-account]').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','long accounts do not split awkwardly');
        const add=space.locator('[data-workspace-add]').first(),header=space.locator('.workspace-section__head');
        await contained(add,header);
        assert.ok(await add.isDisabled(),'readonly locations still protect writes');
        await space.screenshot({path:path.join(output,`${engine}-${width}-${driveWidth||'mobile'}-drive-${theme}.png`)});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if(width>=701)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'desktop keeps its no-scroll board');
      }
      if(width>=701){
        await page.locator('[data-home-customize]').click();
        const handle=focus.locator('[data-edge=s]'),r=await handle.boundingBox(),before=await focus.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-12,{steps:6});await page.mouse.up();
        assert.ok((await focus.boundingBox()).height<before.height-8,'edge resizing remains functional');
        await page.locator('.home-layout-done').click();
        await contained(focus.locator('.study-playbar'),focus);await contained(focus.locator('.study-nudge'),focus);
      }
      if(width<500)await page.locator('[data-home-view=overview]').click();
      await focus.locator('[data-home-timer]').click();assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),true);
      await focus.locator('[data-home-timer]').click();assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().running),false);
      await focus.locator('[data-home-skip]').click();assert.equal(await page.evaluate(()=>EstudiemosStudy.snapshot().phase),'break');
      assert.equal(await focus.locator('[data-home-depth]').getAttribute('data-timer-phase'),'break');
      await focus.locator('[data-home-session]>summary').click();const dialog=page.locator('.study-session-dialog[open]');await dialog.waitFor();
      assert.equal(await dialog.locator('.study-stepper button').first().evaluate(el=>getComputedStyle(el).boxShadow),'none');
      await dialog.locator('[data-home-session-close]').click();
      await dialog.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width}x${height} focus ${focusWidth||'mobile'}: aligned controls, responsive Drive, clean icons, both themes and actions`);
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
