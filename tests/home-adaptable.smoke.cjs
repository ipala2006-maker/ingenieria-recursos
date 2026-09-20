const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8149/';
const sizes=[[1440,900],[1366,768],[1280,600],[1024,768],[390,844],[320,568],[844,390]];
async function noOverflow(page){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
  const boxes=await page.locator('[data-home-space]:visible').evaluateAll(nodes=>nodes.filter(n=>n.dataset.homeSpace!=='shortcuts').map(n=>{
    const r=n.getBoundingClientRect();return {name:n.dataset.homeSpace,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>assert.ok(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,`${a.name} overlaps ${b.name}`)));
  if(await page.locator('body').evaluate(n=>n.classList.contains('home-board'))){
    const height=await page.evaluate(()=>innerHeight);
    for(const box of boxes)assert.ok(box.y>=0&&box.bottom<=height+1,`${box.name} outside desktop screen`);
    assert.ok(await page.locator('.workspace-page').evaluate(n=>n.scrollHeight<=n.clientHeight+1),'desktop board cannot scroll vertically');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'desktop page cannot scroll vertically');
  }
}
async function contained(page,child,parent){
  await page.locator(child).scrollIntoViewIfNeeded();
  const box=await page.locator(child).boundingBox(),outer=await page.locator(parent).boundingBox();
  assert.ok(box&&outer&&box.x>=outer.x-2&&box.y>=outer.y-2&&box.x+box.width<=outer.x+outer.width+2&&box.y+box.height<=outer.y+outer.height+2,`${child} clipped: ${JSON.stringify({box,outer})}`);
}
(async()=>{
  const browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try{for(const [width,height] of sizes){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
    await context.addInitScript(()=>{
      const key=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
      const days={};[15,120,30,0,65,25,50].forEach((n,i)=>{const d=new Date();d.setDate(d.getDate()-i);days[key(d)]=n;});
      localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days}));
      localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'test-task',title:'Preparar guía piloto',date:'',type:'Tarea'}]));
      window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>null,getUser:()=>null,getSession:()=>null,open:()=>{}};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.study-chart-plot').waitFor({state:'attached'});
    await noOverflow(page);
    await contained(page,'.study-progress__foot','.study-progress');
    for(const mode of ['bars','line','depth']){
      await page.locator(`.study-chart-modes [data-chart-mode=${mode}]`).click();
      assert.equal(await page.locator('.study-progress__chart').getAttribute('data-chart-mode'),mode);
      if(mode==='depth'){
        await page.locator('[data-progress-scene]').waitFor();
        await page.waitForFunction(()=>{const c=document.querySelector('[data-progress-scene]');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>20);});
        assert.ok(await page.locator('[data-progress-scene]').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4===3&&v>20);}),'3D chart not blank');
      }else assert.ok(await page.locator('.chart-grid text').count()>=3);
    }
    await page.locator('.study-chart-modes [data-chart-mode=line]').click();
    await page.locator('[data-home-customize]').click();
    const handle=page.locator('[data-home-resize=focus]');await handle.scrollIntoViewIfNeeded();
    const before=await page.locator('.study-focus').boundingBox();
    const r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
    await page.mouse.move(r.x+r.width/2+60,r.y+r.height/2+60,{steps:8});await page.mouse.up();
    const after=await page.locator('.study-focus').boundingBox();assert.ok(after.height>before.height,'drag increases tool height');
    await noOverflow(page);
    await page.locator('.home-layout-done').click();
    await page.reload({waitUntil:'networkidle'});
    assert.ok((await page.locator('.study-focus').boundingBox()).height>=after.height-2,'size persists');
    await page.locator('[data-home-customize]').click();await page.locator('.home-layout-manage').click();await page.locator('[data-home-customizer-reset]').click();await page.locator('.home-customizer__done').click();await page.locator('.home-layout-done').click();
    const compact=await page.locator('[data-home-navigation]').isVisible();
    if(compact){
      for(const view of ['inbox','calendar','space','overview']){await page.locator(`[data-home-view=${view}]`).click();await noOverflow(page);}
    }
    for(const theme of ['dark','light']){
      const current=await page.locator('[data-theme-toggle]').getAttribute('aria-label');
      if(current?.includes(theme==='dark'?'oscuro':'claro'))await page.locator('[data-theme-toggle]').click();
      const ink=await page.locator('.study-focus__clock strong').evaluate(el=>getComputedStyle(el).color.match(/\d+/g).slice(0,3).map(Number));
      assert.ok(theme==='light'?Math.max(...ink)<130:Math.min(...ink)>160,`readable ${theme} clock: ${ink}`);
      await noOverflow(page);
      await page.locator('.study-focus').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(__dirname,`../tmp/ui-check/adaptable-${process.env.TEST_WEBKIT?'webkit':'chrome'}-${width}-${theme}.png`)});
    }
    assert.deepEqual(errors,[]);console.log(`PASS ${width}x${height}`);await context.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
