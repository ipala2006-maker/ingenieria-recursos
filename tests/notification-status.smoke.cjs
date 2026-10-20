const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),live=process.env.TEST_BASE_URL;
if(live)assert.equal(new URL(live).origin,'https://estudiemos-app.vercel.app');
const output=path.join(root,'tmp/notification-status',live?'live':'local');
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
    for(const [width,height,native] of [[800,1280,true],[1280,800,true],[390,844,false]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});
      await context.addInitScript(native=>{
        window.EstudiemosAccount={getUser:()=>null,getSession:()=>null,getClient:()=>null,whenReady:async()=>({session:null}),open(){}};
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
        const permission=()=>localStorage.getItem('pilot_notification_permission')||'default';
        window.__pilotSent=[];
        if(native)window.EstudiemosAndroid={postMessage:text=>{
          const message=JSON.parse(text);window.__pilotSent.push(message.type);
          const type=message.type==='pomodoro-notification-status'?'estudiemos-android-notification-status':message.type==='inbox-notifications-status'?'estudiemos-android-inbox-status':null;
          if(type)queueMicrotask(()=>window.dispatchEvent(new CustomEvent(type,{detail:{permission:message.type==='pomodoro-notification-status'?'default':permission(),exact:true}})));
        }};
        else Object.defineProperty(window,'Notification',{configurable:true,value:class{static get permission(){return permission();}static requestPermission(){throw new Error('The test must never request real OS permission');}}});
      },native);
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(!url.pathname.startsWith('/api/'))return route.continue();
        return route.fulfill({json:{enabled:false}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base);await page.locator('[data-home-timer]:enabled').waitFor();
      const warning=page.locator('[data-streak-notification-enable]');
      await warning.waitFor();
      await page.evaluate(native=>{
        localStorage.setItem('pilot_notification_permission','granted');
        window.dispatchEvent(new CustomEvent(native?'estudiemos-android-inbox-status':'estudiemos:mobile-notifications',{detail:{permission:'granted',exact:true}}));
      },native);
      await warning.waitFor({state:'hidden'});
      if(native){
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-notification-status',{detail:{permission:'default'}})));
        assert.equal(await warning.isVisible(),false,'streak reminders staying off cannot leave a red warning');
      }
      await page.reload();await page.locator('[data-home-timer]:enabled').waitFor();await warning.waitFor({state:'hidden'});
      await page.locator('.topbar').screenshot({path:path.join(output,`${engine}-${width}-enabled.png`)});
      await page.evaluate(()=>{localStorage.setItem('pilot_notification_permission','denied');window.dispatchEvent(new Event('focus'));});
      await warning.waitFor();assert.equal(await warning.getAttribute('data-permission'),'denied');
      assert.match(await warning.getAttribute('aria-label'),/bloqueadas/);
      await page.evaluate(()=>{localStorage.setItem('pilot_notification_permission','granted');window.dispatchEvent(new Event('pageshow'));});
      await warning.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.__pilotSent.some(type=>type.endsWith('-enable'))),false,'read-only checks do not enable any additional reminder');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine} ${width}x${height}: ${native?'Android bridge':'browser permission'}, activation, reload, revoked permission and resume`);
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
