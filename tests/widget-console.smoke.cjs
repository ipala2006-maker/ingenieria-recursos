const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8134/';
const sizes=[{width:260,height:210},{width:320,height:320},{width:390,height:520},{width:540,height:240},{width:640,height:600}];
function seed(){
  const key=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const today=key(new Date()),days={};
  [35,80,45,110,70,40,95].forEach((minutes,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);days[key(d)]=minutes;});
  localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days}));
  localStorage.setItem('bandeja_agenda',JSON.stringify(Array.from({length:25},(_,i)=>({id:'qa-'+i,title:'Repasar ejercicios de sistemas de ecuaciones '+i,type:'Tarea',date:i%2?today:'',horaInicio:'09:00',done:false}))));
  localStorage.setItem('estudiemos_pomodoro',JSON.stringify({config:{study:25,break:5,blocks:4},phase:'study',currentBlock:1,remaining:1500,running:false}));
  const query={select(){return this},eq(){return this},order:async()=>({data:Array.from({length:20},(_,i)=>({id:'folder-'+i,name:'Apuntes de computacion y calculo numerico '+i,kind:'folder',parent_id:null}))})};
  window.EstudiemosAccount={getUser:()=>({id:'widget-qa'}),getSession:()=>null,whenReady:async()=>{},getClient:()=>({from:()=>query}),open:()=>{}};
}
async function pixels(page,selector){
  return page.locator(selector).evaluate(canvas=>{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let n=0;for(let i=3;i<data.length;i+=4)if(data[i]>20)n++;return n;
  });
}
(async()=>{
  const browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  const report=[];
  try {
    for(const viewport of sizes)for(const view of ['workspace','inbox','calendar','pomodoro','streak']){
      const context=await browser.newContext({viewport});await context.addInitScript(seed);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
      await page.goto(base+`widget.html?source=desktop-app&view=${view}`,{waitUntil:'networkidle'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const section=await page.locator('.widget-section').boundingBox();assert.ok(section.y+section.height<=viewport.height+1);
      if(view==='pomodoro'){
        await page.waitForSelector('.has-scene canvas');assert.ok(await pixels(page,'canvas')>100);
        const ring=await page.locator('.pomodoro-widget-ring').boundingBox(),clock=await page.locator('[data-widget-clock]').boundingBox(),actions=await page.locator('.pomodoro-widget-actions').boundingBox();
        assert.ok(clock.x>=ring.x&&clock.x+clock.width<=ring.x+ring.width,'clock inside ring');
        assert.ok(ring.y+ring.height<=actions.y||ring.x+ring.width<=actions.x,'no control overlap');
        assert.ok(actions.y+actions.height<=viewport.height);
        await page.evaluate(()=>window.originalCanvas=document.querySelector('canvas'));
        await page.locator('[data-widget-pomodoro=toggle]').click();
        await page.waitForFunction(()=>document.querySelector('[data-widget-clock]').textContent!=='25:00');
        assert.equal(await page.evaluate(()=>originalCanvas===document.querySelector('canvas')),true);
        await page.locator('[data-widget-pomodoro=toggle]').click();
        await page.locator('[data-widget-pomodoro=reset]').click();assert.equal(await page.locator('[data-widget-clock]').innerText(),'25:00');
      }else if(view==='streak'){
        await page.waitForSelector('.has-progress-depth canvas');assert.ok(await pixels(page,'canvas')>100);
        const days=page.locator('[data-widget-study-day]');await days.nth(2).click();
        assert.match(await page.locator('[data-widget-study-detail]').innerText(),/45 min/);
        await days.nth(2).press('ArrowRight');assert.equal(await days.nth(3).getAttribute('aria-pressed'),'true');
        const canvas=await page.locator('canvas').boundingBox();
        await page.mouse.move(canvas.x+canvas.width*.4,canvas.y+canvas.height*.45);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.7,canvas.y+canvas.height*.6,{steps:8});await page.mouse.up();
        assert.ok(await pixels(page,'canvas')>100);
        await page.locator('[data-widget-graph-reset]').click();
        const cta=await page.locator('.streak-action').boundingBox();assert.ok(cta.y+cta.height<=viewport.height);
      }else if(view==='calendar'){
        await page.locator('[data-widget-calendar-view=month]').click();
        assert.equal(await page.locator('.calendar-day').count(),42);
        await page.locator('[data-widget-calendar-view=week]').click();
        const rows=await page.locator('.calendar-day').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));
        assert.ok(rows.every((y,i)=>!i||y>rows[i-1]));
      }else{
        const selector=view==='inbox'?'.task-list':'.workspace-widget-list';
        await page.locator(selector).evaluate(n=>n.scrollTop=180);
        await page.evaluate(()=>{const items=JSON.parse(localStorage.getItem('bandeja_agenda'));items[0].title='Cambio remoto';localStorage.setItem('bandeja_agenda',JSON.stringify(items));window.dispatchEvent(new Event('estudiemos:data-change'));});
        await page.waitForTimeout(600);assert.ok(await page.locator(selector).evaluate(n=>n.scrollTop)>50,'keep list position');
        if(view==='inbox') {
          const before=await page.locator('.task-row').count();
          await page.locator('.task-row input').nth(4).click();
          assert.equal(await page.locator('.task-row').count(),before-1);
          assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bandeja_agenda')).filter(x=>x.done).length),1);
        }
      }
      await page.screenshot({path:path.join(__dirname,`../tmp/ui-check/console-${process.env.TEST_WEBKIT?'webkit':'chrome'}-${view}-${viewport.width}.png`)});
      assert.deepEqual(errors,[]);report.push({view,...viewport});await context.close();
    }
    // Reduced motion remains fully functional without allocating 3D scenes.
    const context=await browser.newContext({viewport:{width:300,height:240},reducedMotion:'reduce'});await context.addInitScript(seed);
    const page=await context.newPage();await page.route('**/api/**',r=>r.fulfill({json:{enabled:false}}));
    await page.goto(base+'widget.html?embed=rainmeter&view=streak',{waitUntil:'networkidle'});
    assert.equal(await page.locator('canvas').count(),0);await page.locator('[data-widget-study-day="1"]').click();
    assert.match(await page.locator('[data-widget-study-detail]').innerText(),/1 h 20 min/);
    await context.close();console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
