const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8134/';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
    await page.goto(base+'404.html');
    await page.evaluate(()=>{
      window.EstudiemosAccount={getUser:()=>({id:'popup-qa'}),getSession:()=>null,whenReady:async()=>{},getClient:()=>null};
      const d=new Date(),key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
      localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days:{[key]:90}}));
      document.body.innerHTML='<button id="open">Open widget</button>';
    });
    await page.addScriptTag({url:base+'scripts/desktop-widgets.js?v=20260910-widgets'});
    assert.equal(await page.evaluate(()=>!!window.documentPictureInPicture),true,'Real Document Picture-in-Picture required for this test');
    await page.evaluate(()=>document.querySelector('#open').onclick=()=>{window.EstudiemosDesktopWidgets.open('pomodoro').then(value=>window.widgetOpened=value)});
    await page.locator('#open').click();
    await page.waitForFunction(()=>window.widgetOpened===true);
    await page.waitForFunction(()=>documentPictureInPicture.window.document.querySelector('.has-scene canvas'));
    assert.ok(await page.evaluate(()=>{
      const canvas=documentPictureInPicture.window.document.querySelector('canvas');return canvas.width>0&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0);
    }));
    await page.evaluate(()=>documentPictureInPicture.window.document.querySelector('[data-widget-pomodoro=toggle]').click());
    await page.waitForFunction(()=>documentPictureInPicture.window.document.querySelector('[data-widget-clock]').textContent!=='25:00');
    await page.evaluate(()=>documentPictureInPicture.window.document.querySelector('[data-widget-pomodoro=reset]').click());
    await page.evaluate(()=>document.documentElement.classList.add('theme-light'));
    await page.waitForFunction(()=>documentPictureInPicture.window.document.documentElement.dataset.theme==='light');
    await page.evaluate(()=>window.EstudiemosDesktopWidgets.open('streak'));
    await page.waitForFunction(()=>documentPictureInPicture.window.document.querySelector('.has-progress-depth canvas'));
    await page.evaluate(()=>documentPictureInPicture.window.close());
    await page.waitForTimeout(600);
    assert.deepEqual(errors,[]);console.log('Real Chrome PiP: timer, scene, ticking, reset, light theme, streak switch and cleanup passed.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
