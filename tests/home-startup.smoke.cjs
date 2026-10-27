const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const board=require('../shared/home-board');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/home-startup');
const base=process.env.TEST_URL||'http://127.0.0.1:8183/';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  let browser;
  try {
    fs.mkdirSync(out,{recursive:true});
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:390,height:844}])for(const preset of ['light','custom']) {
      const mobile=viewport.width<=700;
      const context=await browser.newContext({viewport,hasTouch:mobile,serviceWorkers:'block',reducedMotion:'reduce',...(process.env.TEST_WEBKIT==='1'?{}:{isMobile:mobile})});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      let releaseCustomizer;
      const gate=new Promise(resolve=>{releaseCustomizer=resolve;});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==new URL(base).origin)return route.abort();
        if(url.pathname==='/scripts/onboarding.js')return route.fulfill({contentType:'text/javascript',body:''});
        if(url.pathname==='/scripts/home-customizer.js')await gate;
        return route.continue();
      });
      const tree=board.defaults(),visible={focus:true,progress:true,assistant:false,workspace:true,classes:true,calendar:true,inbox:true};
      const placement=board.remember(board.freeLayout(null,tree,viewport.width-24,viewport.height-121,visible),null,tree);
      placement.boxes.focus.y+=4;placement.boxes.focus.h-=8;
      await context.addInitScript(({preset,placement})=>{
        const today=new Date(),day=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:30,updatedAt:Date.now()}}));
        localStorage.setItem('bandeja_agenda',JSON.stringify([{id:'local-task',title:'Repasar para el parcial',date:day,done:false}]));
        localStorage.setItem('estudiemos_home_layout_local',JSON.stringify(preset==='light'?{version:5,preset:'light',visible:{focus:false,progress:false,workspace:false,assistant:false,classes:false,calendar:true,inbox:true}}:{version:5,preset:'custom',visible:{focus:true,progress:true,assistant:false,workspace:true,classes:true,calendar:true,inbox:true},density:'compact',placement}));
        window.__shifts=[];
        try {new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__shifts.push({value:entry.value,time:entry.startTime,nodes:entry.sources?.map(source=>source.node?.className)});}).observe({type:'layout-shift',buffered:true});}catch(_){}
      },{preset,placement});
      await page.goto(base,{waitUntil:'commit'});
      await page.waitForFunction(()=>document.querySelector('[data-home-space=inbox]')&&document.documentElement.classList.contains('home-starting'));
      await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,500))]));
      await sleep(250);
      const measure=()=>page.evaluate(()=>({
        starting:document.documentElement.classList.contains('home-starting'),
        boxes:Object.fromEntries([...document.querySelectorAll('[data-home-space]')].filter(node=>node.getClientRects().length).map(node=>{const r=node.getBoundingClientRect();return[node.dataset.homeSpace,{x:r.x,y:r.y,w:r.width,h:r.height}];})),
        header:document.querySelector('.topbar').getBoundingClientRect().height,
        width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
        shifts:window.__shifts
      }));
      const before=await measure();assert.equal(before.starting,true,'Boot geometry must exist while the full customizer is delayed');
      if(!mobile)assert.ok(before.boxes.calendar&&before.boxes.inbox,'Actual tools stay visible during slow startup');
      releaseCustomizer();await page.waitForFunction(()=>!document.documentElement.classList.contains('home-starting'));
      await page.waitForLoadState('networkidle');await sleep(300);
      const after=await measure();
      if(!mobile)for(const key of Object.keys(after.boxes)) {
        assert.ok(before.boxes[key],`${key} must not appear late`);
        for(const dim of ['x','y','w','h'])assert.ok(Math.abs(before.boxes[key][dim]-after.boxes[key][dim])<=1,`${viewport.width}/${preset}: ${key}.${dim} changed from ${before.boxes[key][dim]} to ${after.boxes[key][dim]}`);
      }
      assert.ok(after.width<=viewport.width+1,'No horizontal overflow');
      if(!mobile){assert.ok(after.height<=viewport.height+1,'Desktop fits the viewport');assert.equal(after.header,57);}
      let max=0,total=0,start=0,last=0;
      for(const shift of after.shifts){if(shift.time-last>1000||shift.time-start>5000){total=0;start=shift.time;}total+=shift.value;last=shift.time;max=Math.max(max,total);}
      if(process.env.TEST_WEBKIT!=='1')assert.ok(max<=0.1,`CLS ${max}: ${JSON.stringify(after.shifts)}`);
      console.log(JSON.stringify({browser:process.env.TEST_WEBKIT?'webkit':'chrome',viewport:viewport.width,preset,cls:max,boxes:after.boxes}));
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-${viewport.width}-${preset}.png`)});
      await context.close();
    }
    console.log('Stable startup: delayed customizer, visible tools, saved geometry, viewport fit and CLS passed.');
  }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
