const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8133/';
const output=path.join(__dirname,'../tmp/ui-check');
const sizes=[[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[390,844],[360,640],[320,568],[844,390]];
async function fits(page,label) {
  const result=await page.evaluate(()=>{
    const doc=document.documentElement,main=document.querySelector('.workspace-page');
    return {width:doc.scrollWidth,height:doc.scrollHeight,vw:innerWidth,vh:innerHeight,main:main.scrollHeight,client:main.clientHeight};
  });
  assert.ok(result.width<=result.vw+1 && result.height<=result.vh+1,`${label}: page overflow ${JSON.stringify(result)}`);
  assert.ok(result.main<=result.client+1,`${label}: main requires scrolling ${JSON.stringify(result)}`);
}
async function reachable(page,selector) {
  const el=page.locator(selector).first();
  assert.ok(await el.isVisible(),`${selector} visible`);
  const result=await el.evaluate(e=>{
    const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {fits:r.x>=-1 && r.y>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1,hit:!!hit && (e===hit || e.contains(hit))};
  });
  assert.ok(result.fits && result.hit,`${selector} clipped or covered: ${JSON.stringify(result)}`);
}
(async()=>{
const browser=process.env.TEST_WEBKIT==='1' ? await webkit.launch() : await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const report=[];
try {
for(const [width,height] of sizes) {
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
  await page.addInitScript(()=>{
    localStorage.setItem('estudiemos_theme','dark');
    const days={};[40,80,30,0,65,25,50].forEach((minutes,i)=>{
      const d=new Date();d.setDate(d.getDate()-i);
      days[[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')]=minutes;
    });
    localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days}));
    localStorage.setItem('bandeja_agenda',JSON.stringify(Array.from({length:35},(_,i)=>({id:'task-'+i,title:'Actividad de prueba '+(i+1),type:'Tarea',date:'',done:false,createdAt:Date.now()-i}))));
    const items=Array.from({length:30},(_,i)=>({id:'folder-'+i,name:'Carpeta de estudio '+(i+1),kind:'folder',parent_id:null,updated_at:new Date(Date.now()-i).toISOString()}));
    const query={select(){return this},eq(){return this},order:async()=>({data:items})};
    window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>({from:()=>query}),getUser:()=>({id:'test-user'}),getSession:()=>null,open:()=>{}};
  });
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('[data-home-timer]:not([disabled])').waitFor();
  await page.locator('[data-progress-scene]').waitFor();await page.waitForTimeout(800);
  const compact=await page.locator('[data-home-navigation]').isVisible();
  await fits(page,'overview');
  const modules=await page.locator('.study-focus,.study-progress,.study-assistant,.workspace-section,.dashboard-calendar,.dashboard-agenda').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.equal(modules.length,compact?3:6);
  modules.forEach((r,i)=>modules.slice(i+1).forEach(s=>assert.ok(r.x+r.w<=s.x+1 || s.x+s.w<=r.x+1 || r.y+r.h<=s.y+1 || s.y+s.h<=r.y+1,'modules overlap')));
  for(const selector of ['[data-home-timer]','[data-home-dial]','[data-home-session] summary','[data-home-open="streak"]','[data-home-range="week"]','[data-home-range="month"]','[data-progress-reset]','[data-home-day-scrubber]','#homeAiPrompt','[data-home-ai-form] button']) await reachable(page,selector);
  const dial=await page.locator('[data-home-dial]').boundingBox();assert.ok(dial.width>=98,'dial must remain usable');
  const pixels=await page.locator('[data-progress-scene]').evaluate(canvas=>{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let blue=0,orange=0;
    for(let i=0;i<data.length;i+=4){if(data[i+3]<100)continue;if(data[i+2]>data[i]+25)blue++;if(data[i]>data[i+2]+35 && data[i]>120)orange++;}return {blue,orange};
  });
  assert.ok(pixels.blue>100 && pixels.orange>30,'study data must be visible');
  await page.screenshot({path:path.join(output,`console-final-${width}x${height}.png`)});
  await page.locator('[data-home-session] summary').click();
  await reachable(page,'[data-home-session-close]');
  await page.locator('[data-home-preset="50,10,2"]').click();
  assert.equal(await page.locator('[data-home-config="study"]').inputValue(),'50');
  await page.locator('[data-home-alarm]').selectOption('bell');
  await page.locator('[data-home-preset="25,5,4"]').click();
  if(width===1440) {
    await page.reload({waitUntil:'networkidle'});
    await page.locator('.study-session-dialog').waitFor({state:'visible'});
  }
  await page.goBack();
  await page.locator('.study-session-dialog').waitFor({state:'hidden'});
  assert.ok(page.url().startsWith(base));
  await fits(page,'after settings');
  if(compact) await page.locator('[data-home-view="inbox"]').click();
  assert.equal(await page.locator('[data-dashboard-agenda-done]').count(),35);
  await page.locator('[data-dashboard-agenda-done="task-34"]').scrollIntoViewIfNeeded();
  await reachable(page,'[data-dashboard-agenda-done="task-34"]');
  await page.locator('[data-dashboard-agenda-done="task-34"]').click();
  assert.equal(await page.locator('[data-dashboard-agenda-done]').count(),34);
  await fits(page,'Inbox long list');
  if(compact) await page.locator('[data-home-view="space"]').click();
  await page.locator('[data-workspace-open="folder-29"]').scrollIntoViewIfNeeded();
  await reachable(page,'[data-workspace-open="folder-29"]');
  await reachable(page,'.workspace-console-add');
  await page.locator('.workspace-console-add').click();
  await page.locator('[data-workspace-add-action="folder"]').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await fits(page,'files long list');
  if(compact) await page.locator('[data-home-view="calendar"]').click();
  await page.locator('[data-dashboard-calendar-view="month"]').click();
  await fits(page,'monthly calendar');
  const calendar=await page.locator('[data-dashboard-calendar]').boundingBox();
  assert.ok(calendar.height>=100,'calendar remains visible');
  if(compact) await page.locator('[data-home-view="overview"]').click();
  await page.locator('[data-theme-toggle]').click();await page.waitForTimeout(300);
  await fits(page,'light');
  await page.screenshot({path:path.join(output,`console-light-${width}x${height}.png`)});
  if(width===1440) {
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-home-navigation]').waitFor({state:'visible'});
    await fits(page,'resize to phone');
    await page.locator('[data-home-view="calendar"]').click();
    await page.setViewportSize({width:1440,height:900});
    await page.locator('[data-home-navigation]').waitFor({state:'hidden'});
    await page.locator('.study-focus').waitFor({state:'visible'});
    await fits(page,'resize to desktop');
    assert.equal(await page.locator('.study-focus:visible,.workspace-section:visible,.dashboard-calendar:visible,.dashboard-agenda:visible').count(),4);
  }
  assert.deepEqual(errors,[]);report.push({width,height,compact,pixels});console.log(JSON.stringify(report.at(-1)));
  await context.close();
}
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
