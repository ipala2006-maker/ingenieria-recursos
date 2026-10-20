const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/android-update');
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
      res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  try{
    fs.mkdirSync(out,{recursive:true});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome'});
    for(const width of [412,800]){
      const context=await browser.newContext({viewport:{width,height:1100},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      await context.addInitScript(()=>{
        window.__sent=[];
        window.EstudiemosAndroidUpdater=true;
        window.EstudiemosAndroid={postMessage:raw=>{
          const message=JSON.parse(raw);window.__sent.push(message.type);
          if(message.type==='app-update')queueMicrotask(()=>{
            window.dispatchEvent(new CustomEvent('estudiemos-android-update-started'));
            window.dispatchEvent(new CustomEvent('estudiemos-android-update-status',{detail:{state:'downloading',percent:12}}));
          });
        }};
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
      });
      const external=[];
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base){external.push(url.href);return route.abort();}
        if(url.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});
        return route.continue();
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);
      await page.locator('[data-account-open]').click();
      const update=page.locator('[data-account-update]'),fallback=page.locator('[data-account-update-manual]');
      await update.waitFor();assert.equal(await fallback.isVisible(),false);
      await update.click();await page.waitForFunction(()=>document.querySelector('[data-account-update-label]').textContent.includes('12%'));
      assert.equal(page.url(),base+'/');assert.equal(await fallback.isVisible(),true);
      assert.equal(await update.isDisabled(),true);
      assert.equal(await page.evaluate(()=>window.__sent.filter(type=>type==='app-update').length),1);
      assert.ok(!external.some(url=>url.includes('Estudiemos-Android.apk')),'No automatic browser download');
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-update-status',{detail:{state:'error'}})));
      assert.equal(await update.isEnabled(),true);
      assert.equal(await fallback.getAttribute('target'),'_self');
      assert.ok((await fallback.boundingBox()).height>=44);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(out,width+'-recovery.png')});
      await update.click();
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-update-status',{detail:{state:'installer',percent:100}})));
      assert.equal(await update.isEnabled(),true);
      assert.equal(await page.evaluate(()=>window.__sent.filter(type=>type==='app-update').length),2);
      assert.deepEqual(errors,[]);
      console.log('PASS Android update '+width+'px: real profile UI, progress, fallback, retry and installer confirmation');
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
