const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../scripts/account.js'),'utf8'),start=source.indexOf('  function showResumeNotice()');
const helper=source.slice(start,source.indexOf('\n  function ',start+10));
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  for(const width of [1440,320]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:width===320?'reduce':'no-preference'});
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:8183')return route.abort();if(url.pathname==='/scripts/onboarding.js')return route.fulfill({body:''});return route.continue();});
   await context.addInitScript(()=>localStorage.setItem('estudiemos_pomodoro_streak','{"goal":{"minutes":30,"updatedAt":1},"days":{}}'));
   const page=await context.newPage();await page.goto('http://127.0.0.1:8183/',{waitUntil:'networkidle'});
   if(width===320)await page.evaluate(()=>EstudiemosTheme.set('light'));
   const before=await page.locator('.study-home__head').boundingBox();
   await page.evaluate('(()=>{'+helper+'\nshowResumeNotice();showResumeNotice();})()');
   const notice=page.locator('[data-resume-sync-notice]');assert.equal(await notice.count(),1);assert.equal(await notice.getAttribute('role'),'status');
   const rect=await notice.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=900);
   assert.deepEqual(await page.locator('.study-home__head').boundingBox(),before);
   fs.mkdirSync('tmp/resume-notice',{recursive:true});await page.screenshot({path:`tmp/resume-notice/${width}.png`});
   await notice.waitFor({state:'detached',timeout:6000});console.log('PASS resume notice '+width+': single, accessible, no layout shift and automatic dismissal');await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
