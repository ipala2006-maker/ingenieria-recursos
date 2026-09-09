const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8132/';
const output=path.join(__dirname,'../tmp/ui-check');
(async()=>{
  const browser=process.env.TEST_WEBKIT==='1' ? await webkit.launch() : await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  const results=[];
  try {
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]) {
      const context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**',route=>route.fulfill({json:{enabled:false}}));
      await page.addInitScript(()=>{
        localStorage.setItem('estudiemos_theme','dark');
        const days={};
        [40,80,30,0,65,25,50].forEach((minutes,index)=>{
          const d=new Date();d.setDate(d.getDate()-index);
          const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');days[key]=minutes;
        });
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({version:2,days}));
        const items=['Apuntes','Proyecto','Lecturas'].map((name,index)=>({id:'folder-'+index,name,kind:'folder',parent_id:null,updated_at:new Date().toISOString()}));
        const query={select(){return this},eq(){return this},order:async()=>({data:items})};
        window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>({from:()=>query}),getUser:()=>({id:'test-user'}),getSession:()=>null,open:()=>{}};
      });
      await page.goto(base,{waitUntil:'networkidle'});
      await page.locator('[data-progress-scene]').waitFor();
      await page.waitForTimeout(700);
      if(viewport.width<500) {
        const homeBox=await page.locator('[data-study-home]').boundingBox();
        const progressBox=await page.locator('.study-progress').boundingBox();
        assert.ok(progressBox.width>homeBox.width-25,'mobile tools must use the available width');
      }
      const saved=await page.evaluate(()=>localStorage.getItem('estudiemos_pomodoro_streak'));
      for(const selector of ['[data-home-dial]','[data-pomodoro-dial]']) {
        if(selector.includes('pomodoro')) await page.locator('[data-home-open="pomodoro"]').click();
        const dial=page.locator(selector); await dial.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        const box=await dial.boundingBox(), r=box.width/2-8;
        const point=angle=>({x:box.x+box.width/2+r*Math.sin(angle*Math.PI/180),y:box.y+box.height/2-r*Math.cos(angle*Math.PI/180)});
        const start=point(90);await page.mouse.move(start.x,start.y);await page.mouse.down();
        for(const angle of [105.3,135.7,180,220.2,270,315,348]) {
          const p=point(angle);await page.mouse.move(p.x,p.y,{steps:4});
          const actual=await dial.evaluate(el=>parseFloat(el.style.getPropertyValue('--dial-angle')));
          assert.ok(Math.abs(actual-angle)<1.5,`${selector}: cursor angle ${angle} != ${actual}`);
        }
        for(const angle of [357,2,8]) {
          const p=point(angle);await page.mouse.move(p.x,p.y);
          assert.equal(await dial.getAttribute('aria-valuenow'),'59','no jump across twelve');
        }
        for(const angle of [2,357,348,330]) {
          const p=point(angle);await page.mouse.move(p.x,p.y);
          const actual=await dial.evaluate(el=>parseFloat(el.style.getPropertyValue('--dial-angle')));
          const expected=angle<10 ? 354 : Math.min(354,angle);
          assert.ok(Math.abs(actual-expected)<1.5,'reversing at the limit must stay aligned');
        }
        const limit=point(354);await page.mouse.move(limit.x,limit.y);
        await page.mouse.up();
        assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),3540);
        const previous=await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining);
        const p=point(180);await page.mouse.move(p.x,p.y);await page.mouse.down();
        await dial.focus();await page.keyboard.press('Escape');await page.mouse.up();
        assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),previous,'cancel must not persist');
        if(viewport.width<500) {
          const p=point(90);await page.touchscreen.tap(p.x,p.y);assert.equal(await dial.getAttribute('aria-valuenow'),'15');
          if(process.env.TEST_WEBKIT!=='1') {
            const session=await context.newCDPSession(page);
            await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
            for(const angle of [105,120,135,150,165,180]) {
              const next=point(angle);
              await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:next.x,y:next.y}]});
              await page.waitForFunction(({selector,angle})=>Math.abs(Number(document.querySelector(selector).getAttribute('aria-valuenow'))-angle/6)<=.55,{selector,angle},{timeout:250});
              const actual=Number(await dial.getAttribute('aria-valuenow'));
              assert.ok(Math.abs(actual-angle/6)<=.55,`${selector} finger at ${angle} degrees, value ${actual}`);
            }
            await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            assert.equal(await page.evaluate(()=>window.EstudiemosStudy.snapshot().remaining),1800);
            await session.detach();
          }
        }
        if(selector.includes('pomodoro')) await page.locator('[data-pomodoro-close]').click();
      }
      const chart=page.locator('[data-home-chart]');await chart.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
      const colored=await page.locator('[data-progress-scene]').evaluate(canvas=>{
        const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let blue=0,orange=0;
        for(let i=0;i<p.length;i+=4) {if(p[i+3]<100)continue;if(p[i+2]>p[i]+25)blue++;if(p[i]>p[i+2]+35 && p[i]>120)orange++;}
        return {blue,orange};
      });
      assert.ok(colored.blue>200 && colored.orange>100,'actual data bars must render, not just the floor');
      const before=await chart.screenshot(), rect=await chart.boundingBox();
      await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.6,{steps:12});await page.mouse.up();
      await page.waitForTimeout(400);
      assert.notEqual(before.toString('base64'),(await chart.screenshot()).toString('base64'),'3D responds to drag');
      await page.locator('[data-progress-reset]').click();
      await page.locator('[data-home-chart] button').nth(1).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-home-chart] button').nth(2).getAttribute('aria-pressed'),'true');
      await page.locator('[data-home-range="month"]').click();
      assert.equal(await page.locator('[data-home-chart] button:visible').count(),30);
      await page.locator('[data-home-day-scrubber]').focus();
      await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-home-chart] button').nth(1).getAttribute('aria-pressed'),'true');
      assert.equal(await page.evaluate(()=>localStorage.getItem('estudiemos_pomodoro_streak')),saved,'interactions cannot change study history');
      await page.locator('[data-home-range="week"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.locator('[data-study-home]').screenshot({path:path.join(output,`depth-home-${viewport.width}.png`)});
      await page.locator('[data-home-destination="inbox"]').click();
      await page.locator('.dashboard-agenda').waitFor({state:'visible'});
      if(viewport.width<500) await page.locator('[data-home-view="overview"]').click();
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('[data-progress-scene]').waitFor({state:'detached'});
      assert.equal(await page.locator('[data-progress-scene]').count(),0);
      assert.equal(await page.locator('[data-home-chart] button:visible').count(),7);
      await page.locator('[data-theme-toggle]').click();
      await page.screenshot({path:path.join(output,`depth-light-${viewport.width}.png`)});
      assert.deepEqual(errors,[]);results.push({viewport,colored,errors});await context.close();
    }
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
