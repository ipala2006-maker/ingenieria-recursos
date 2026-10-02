const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  let browser;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"enabled":false}');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
    browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:1366,height:768}});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'instalar.html?local=1#pc');
    const link=page.locator('[data-install-pc]');
    assert.match(await link.getAttribute('href'),/Estudiemos-Para-Windows.exe$/);
    await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await link.textContent(),'Descargar para Windows ↓','PWA state must not hide the complete installer');
    await link.scrollIntoViewIfNeeded();
    fs.mkdirSync(path.join(root,'tmp/bundle-check'),{recursive:true});
    await page.screenshot({path:path.join(root,'tmp/bundle-check/download-desktop.png')});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.screenshot({path:path.join(root,'tmp/bundle-check/download-mobile.png')});
    await page.setViewportSize({width:1366,height:768});
    await page.goto(base+'?windows-bundle=1&alarms-setup=1');
    const dialog=page.locator('.alarm-setup');await dialog.waitFor({state:'visible'});
    assert.ok(await dialog.locator('[data-alarm-stage="install"]').isHidden(),'no repeated download');
    assert.ok(await dialog.locator('[data-alarm-stage="connect"]').isVisible());
    assert.ok(await dialog.locator('[data-alarm-activate]').isDisabled(),'explicit consent still required');
    assert.equal(await page.evaluate(()=>localStorage.getItem('estudiemos_windows_widgets_ready')),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('estudiemos_windows_alarm_connection')),null);
    assert.equal(await page.locator('dialog[open]').count(),1,'no competing modal on first launch');
    await page.screenshot({path:path.join(root,'tmp/bundle-check/first-launch.png')});
    await dialog.locator('[data-alarm-consent]').check();
    await dialog.locator('[data-alarm-activate]').click();
    await page.waitForFunction(()=>document.querySelector('.account-shell')?.hidden===false);
    assert.ok(await dialog.isHidden(),'sign-in is accessible to a new user');
    assert.deepEqual(errors,[]);
    console.log('PASS unified download, responsive layouts, first-run connection, consent and sign-in');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
