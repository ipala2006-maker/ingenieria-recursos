// Bake the shared Three.js model once for Android RemoteViews (no runtime GPU).
const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:512,height:512}});
    await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:8134/')+'404.html');
    await page.evaluate(async()=>{
      document.body.innerHTML='<div id="model"><div class="study-dial" style="--dial-angle:0deg"></div></div>';
      const style=document.createElement('style');
      style.textContent='body{margin:0}#model{position:absolute;inset:0;--border:#536987;--accent:#8bb5ff;--panel:#101827}.study-dial{width:470px;height:470px;position:absolute;inset:21px}canvas{position:absolute;inset:0;width:100%;height:100%}';
      document.head.appendChild(style);
      const {createTimerDepth}=await import('/scripts/timer-depth.js?v=20260910-widgets');
      window.assetScene=createTimerDepth(document.querySelector('#model'),{home:true});window.assetScene.update();
    });
    await page.waitForSelector('.has-scene canvas');
    const data=await page.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
    const out=path.join(__dirname,'../android-app/app/src/main/res/drawable-nodpi/widget_focus_dial.png');
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(data,'base64'));
    console.log(out);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
