const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    const logo=fs.readFileSync(path.join(__dirname,'../assets/icons/graduation-cap.svg')).toString('base64');
    await page.setContent(`<html lang="es"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#101725;color:#f3f6fc;font-family:Arial,sans-serif}main{padding:66px 78px;height:630px;display:flex;flex-direction:column}header{display:flex;align-items:center;gap:16px;font-size:27px;font-weight:600}.mark{display:grid;place-items:center;width:48px;height:48px;border:1px solid #435470;border-radius:8px;color:#9abfff}h1{font-size:65px;line-height:1.1;max-width:900px;margin:66px 0 22px;font-weight:600}p{margin:0;font-size:25px;color:#b5c4da}footer{margin-top:auto;padding-top:30px;border-top:1px solid #354056;display:flex;justify-content:space-between;align-items:center;color:#9abfff;font-size:19px}img{width:43px;height:43px;filter:invert(.8)}</style></head><body><main><header><span class="mark">Σ</span>Estudiemos</header><h1>Te invitaron<br>a una cátedra.</h1><p>Tu comisión. Sus fechas. Sus materiales.</p><footer><span>Una invitación. Toda la cursada.</span><img src="data:image/svg+xml;base64,${logo}" alt=""></footer></main></body></html>`);
    await page.screenshot({path:path.join(__dirname,'../assets/course-invite-preview.png')});
    console.log('Created course invitation artwork: 1200 x 630');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
