const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
  try{
    for(const width of [1440,768,390]){
      const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<900});
      const page=await context.newPage();
      await page.setContent('<html class="theme-dark"><body><main style="height:3000px">Background</main><dialog id="outer"><header>Alarmas</header><div id="inside" style="height:240px;overflow:auto;overscroll-behavior:contain"><div style="height:1600px">Programación</div></div><button id="nested">Ayuda</button></dialog><dialog id="inner"><p>Confirmación</p><button id="close">Cerrar</button></dialog></body></html>');
      await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles/professional.css'),'utf8')});
      await page.evaluate(()=>{window.scrollTo(0,350);document.querySelector('#nested').onclick=()=>document.querySelector('#inner').showModal();document.querySelector('#close').onclick=()=>document.querySelector('#inner').close();document.querySelector('#outer').showModal();});
      const top=await page.evaluate(()=>scrollY);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
      const box=await page.locator('#inside').boundingBox();await page.mouse.move(box.x+20,box.y+30);await page.mouse.wheel(0,500);
      await page.waitForFunction(()=>document.querySelector('#inside').scrollTop>0);
      assert.equal(await page.evaluate(()=>scrollY),top,'the form scrolls but its background does not');
      await page.mouse.move(3,830);await page.mouse.wheel(0,700);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await page.evaluate(()=>scrollY),top,'backdrop wheel cannot scroll the background');
      await page.locator('#nested').click();await page.locator('#close').click();
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden','closing a nested modal keeps the parent locked');
      await page.locator('#outer').press('Escape');
      await page.waitForFunction(()=>!document.querySelector('dialog:modal'));
      assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
      await page.mouse.move(3,830);await page.mouse.wheel(0,500);await page.waitForFunction(before=>scrollY>before,top);
      await context.close();console.log('PASS modal scroll, nested close and restored background: '+width);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
