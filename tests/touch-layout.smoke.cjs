const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),live=process.env.TEST_BASE_URL;
if(live)assert.equal(new URL(live).origin,'https://estudiemos-app.vercel.app');
const output=path.join(root,'tmp/touch-layout',live?'live':'local');
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
    for(const [width,height] of [[390,844],[844,390],[768,1024],[800,1280],[1280,800]]){
      if(process.env.TEST_WIDTH&&width!==Number(process.env.TEST_WIDTH))continue;
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'America/Argentina/Buenos_Aires'});
      await context.addInitScript(()=>{
        window.EstudiemosAccount={getUser:()=>null,getSession:()=>null,getClient:()=>null,whenReady:async()=>({session:null}),open(){}};
        if(!localStorage.getItem('estudiemos_pomodoro_streak'))localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        window.addEventListener('pointerdown',event=>window.__pilotPointer=event.pointerId,true);
      });
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        return route.fulfill({json:url.searchParams.get('drive')==='config'?{enabled:true,browseEnabled:true}:{enabled:false,connected:false}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);await page.locator('[data-home-timer]:enabled').waitFor();
      const board=await page.locator('body').evaluate(el=>el.classList.contains('home-board'));
      const focus=page.locator('[data-home-space=focus]'),handle=focus.locator('[data-home-resize=focus]');
      await page.locator('[data-home-customize]').tap();await handle.waitFor();
      assert.equal(await handle.evaluate(el=>getComputedStyle(el).touchAction),'none','touch resizing must not become browser scrolling');
      const target=await handle.boundingBox();assert.ok(target.width>=44&&target.height>=44,'corner is large enough for a finger');
      const client=engine==='chrome'?await context.newCDPSession(page):null;
      let start;
      async function down(locator){
        await locator.scrollIntoViewIfNeeded();const r=await locator.boundingBox(),north=await locator.getAttribute('data-edge')==='n';start={x:r.x+r.width*(north ? .25 : .5),y:r.y+r.height/2};
        if(client)await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1,radiusX:7,radiusY:7,force:1}]});
        else {await page.mouse.move(start.x,start.y);await page.mouse.down();}
      }
      async function move(dx,dy){
        for(let i=1;i<=6;i++){
          const x=start.x+dx*i/6,y=start.y+dy*i/6;
          if(client)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1,radiusX:7,radiusY:7,force:1}]});
          else await page.mouse.move(x,y);
          await page.waitForTimeout(20);
        }
      }
      async function up(){if(client)await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await page.waitForFunction(()=>!document.body.classList.contains('home-board-dragging'));await page.waitForTimeout(80);}
      async function press(locator){if(client){await down(locator);await up();}else await locator.click();}
      async function cancel(){if(client)await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else {await handle.dispatchEvent('pointercancel',{pointerId:await page.evaluate(()=>window.__pilotPointer)});await page.mouse.up();}}
      const before=await focus.boundingBox(),delta=board?-36:50;
      await down(handle);await move(board?-30:0,delta);await up();
      const after=await focus.boundingBox();
      assert.ok(Math.abs(after.height-before.height-delta)<3,'drag follows the finger and commits the new height');
      const stored=await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key));
      await press(page.locator('.home-layout-undo'));
      await page.waitForFunction(height=>Math.abs(document.querySelector('[data-home-space=focus]').getBoundingClientRect().height-height)<2,before.height);
      await down(handle);await move(board?-30:0,delta);await up();
      await press(page.locator('.home-layout-done'));await page.reload();await page.locator('[data-home-timer]:enabled').waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key)),stored,'reload retains this device layout');
      assert.ok(Math.abs((await focus.boundingBox()).height-after.height)<2,'saved size is actually rendered');
      await press(page.locator('[data-home-customize]'));
      const saved=await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key)),box=await focus.boundingBox();
      await down(handle);await move(board?-20:0,20);await cancel();
      assert.ok(Math.abs((await focus.boundingBox()).height-box.height)<2,'cancelled touch restores the preview');
      assert.equal(await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key)),saved,'cancelled touch never saves');
      if(board){
        const mover=focus.locator('[data-home-move=focus]');
        assert.equal(await mover.evaluate(el=>getComputedStyle(el).touchAction),'none','tablet move handle cannot become a scroll');
        const r=await mover.boundingBox();assert.ok(r.width>=44&&r.height>=44,'tablet move handle is finger sized');
        const original=await focus.boundingBox();
        await down(mover);await move(12,12);await up();
        const moved=await focus.boundingBox();assert.ok(Math.abs(moved.x-original.x-12)<=5&&Math.abs(moved.y-original.y-12)<=5,'tablet follows a touch move with soft alignment: '+JSON.stringify({original,moved}));
        await press(page.locator('.home-layout-undo'));await page.waitForFunction(({x,y})=>{const r=document.querySelector('[data-home-space=focus]').getBoundingClientRect();return Math.abs(r.x-x)<2&&Math.abs(r.y-y)<2;},original);
        for(const edge of ['n','e','s','w']){
          await down(focus.locator('[data-edge='+edge+']'));
          assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('home-board-dragging')),true,'touch reaches the '+edge+' resize handle');
          await move(edge==='e'||edge==='w'?8:0,edge==='s'?-8:edge==='n'?8:0);await up();
          const resized=await focus.boundingBox();
          const expected=edge==='e'?8:edge==='w'?-Math.min(8,Math.max(0,original.width-240)):-8;
          assert.ok(Math.abs((['e','w'].includes(edge)?resized.width-original.width:resized.height-original.height)-expected)<3,'touch works on the '+edge+' edge without crossing its minimum');
          await press(page.locator('.home-layout-undo'));await page.waitForFunction(original=>{const r=document.querySelector('[data-home-space=focus]').getBoundingClientRect();return ['x','y','width','height'].every(k=>Math.abs(r[k]-original[k])<2);},original);
        }
        assert.equal(await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key)),saved,'undo also preserves the stored tablet layout');
      }else{
        await press(page.locator('.home-layout-manage'));
        assert.equal(await page.locator('[data-height=focus]').isVisible(),true);
        assert.equal(await page.locator('[data-height=inbox]').isVisible(),false,'full-screen tabs have no ineffective height slider');
        await press(page.locator('.home-customizer__done'));
      }
      await page.screenshot({path:path.join(output,`${engine}-${width}-editing.png`)});
      await focus.screenshot({path:path.join(output,`${engine}-${width}-focus.png`)});
      await down(handle);await move(board?-10:0,10);
      await page.setViewportSize(board?{width:390,height:844}:{width:1024,height:768});
      await page.waitForFunction(width=>innerWidth===width,board?390:1024);
      await up();await page.waitForTimeout(250);
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('home-board-dragging')),false,'rotation cancels an in-progress gesture');
      assert.equal(await page.evaluate(()=>localStorage.getItem(EstudiemosHomeLayout.key)),saved,'rotation never commits stale gesture geometry');
      assert.deepEqual(errors,[],'rotation must not use geometry from the previous layout mode');
      await press(page.locator('.home-layout-manage'));
      const nowBoard=await page.locator('body').evaluate(el=>el.classList.contains('home-board'));
      assert.equal(await page.locator('[data-height=focus]').isVisible(),!nowBoard);
      await page.setViewportSize({width,height});await page.waitForTimeout(250);
      assert.equal(await page.locator('[data-height=focus]').isVisible(),!board,'an open settings dialog adapts when rotated');
      await press(page.locator('.home-customizer__done'));await press(page.locator('.home-layout-done'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),'layout stays within viewport');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine} ${width}x${height}: ${client?'native touch drag':'pointer drag + touch CSS'}, persistence, undo, cancellation and rotation`);
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
