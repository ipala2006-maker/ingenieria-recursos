const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const installMockTcf = require('./fixtures/ad-tcf.cjs');

const origin = 'https://estudiemos.ar';
const live = process.argv.includes('--live');
const root = path.join(__dirname,'../dist-cloudflare');
const mime = {'.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.js':'text/javascript','.png':'image/png','.webp':'image/webp'};
const key = 'sb-gxilgicgxhkdjmmyhrdd-auth-token';

async function fixture(browser, width, {scripts=true, ad=false, pro=false, consent='granted', empty=false, member=false, native=false, adult=true}={}) {
  const context=await browser.newContext({viewport:{width,height:880},isMobile:width<600,hasTouch:width<600,
    javaScriptEnabled:scripts,serviceWorkers:'block',acceptDownloads:true});
  const requests=[],errors=[];
  if(ad)await context.addInitScript(installMockTcf);
  if(scripts)await context.addInitScript(({key,consent,empty,member,native})=>{
    window.__consent=sessionStorage.getItem('mock-consent')||consent;
    if(native)window.EstudiemosAndroid={};
    if(!member||sessionStorage.getItem('mock-seeded'))return;
    sessionStorage.setItem('mock-seeded','1');
    const now=new Date(), today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    localStorage.setItem(key,JSON.stringify({access_token:'mock-token',expires_at:Date.now()/1000+500,user:{id:'account-fixture'}}));
    localStorage.setItem('estudiemos_cloud_user','account-fixture');
    localStorage.setItem('bandeja_agenda',JSON.stringify(empty?[]:[{id:'a',title:'Parcial de física',date:today,horaInicio:'09:30',note:'oculta'}]));
    localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:empty?{}:{[today]:55}}));
  },{key,consent,empty,member,native});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push(url);
    if(ad&&url.host==='pagead2.googlesyndication.com'){
      return route.fulfill({contentType:'text/javascript',body:`window.adsbygoogle={push(){
        document.querySelector('ins.adsbygoogle').setAttribute('data-ad-status','filled');
        window.mockImpressions=(window.mockImpressions||0)+1;
      }};`});
    }
    if(ad&&url.host==='gxilgicgxhkdjmmyhrdd.supabase.co'){
      return route.fulfill({json:{id:'account-fixture',app_metadata:{estudiemos_ads_pilot_adult:adult,estudiemos:{status:'active',planId:pro?'pro':'initial'}}}});
    }
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/api/account-config')return route.fulfill({json:ad?{url:'https://gxilgicgxhkdjmmyhrdd.supabase.co',publishableKey:'public-fixture'}:{enabled:false}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:401,json:{}});
    if(live&&!ad)return route.continue();
    if(ad&&url.pathname==='/scripts/inmobi-choice-tag.js')return route.fulfill({contentType:'text/javascript',body:''});
    const name=url.pathname==='/'?'/index.html':path.extname(url.pathname)?url.pathname:url.pathname+'.html';
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep))return route.abort();
    try{
      let body=await fs.readFile(file);
      if(ad&&url.pathname==='/shared/release.js')body=body.toString().replace('ads: false','ads: true');
      if(ad&&url.pathname==='/shared/study-ad-config.js')body=body.toString().replaceAll(': false',': true').replaceAll("slot:'', evaluated:false","slot:'1234567890', evaluated:true");
      return route.fulfill({body,contentType:mime[path.extname(file)]||'application/octet-stream'});
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      return route.fulfill({status:404,body:''});
    }
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return {page,context,requests,errors,ads:()=>requests.filter(url=>url.host==='pagead2.googlesyndication.com').length};
}

async function planner(browser,width,name){
  const f=await fixture(browser,width),{page}=f;
  try{
    assert.equal((await page.goto(origin+'/planificador')).status(),200);
    await page.getByRole('button',{name:'Empezar en blanco'}).click();
    await page.getByRole('button',{name:'Agregar laboratorio'}).click();
    await page.getByRole('button',{name:'Guardar horario'}).click();
    assert.equal(await page.getByRole('button',{name:/Editar Física I · .*10:00/}).count(),2);
    await page.getByRole('button',{name:'Agregar horario'}).click();
    await page.getByRole('textbox',{name:'Actividad'}).fill('Álgebra práctica');
    await page.getByText('Mar',{exact:true}).click();
    await page.locator('[name=start]').fill('10:30');
    await page.locator('[name=end]').fill('11:30');
    await page.getByRole('button',{name:'Guardar horario'}).click();
    assert.match(await page.locator('[data-planner-status]').innerText(),/superpone con Física I/);
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Exportar .ics'}).click();
    assert.equal((await download).suggestedFilename(),'estudiemos-semana.ics');
    await page.reload();
    await page.getByRole('button',{name:'Editar Álgebra práctica · Martes 10:30'}).click();
    await page.getByRole('button',{name:'Quitar horario'}).click();
    assert.equal(await page.getByRole('button',{name:/Editar Álgebra/}).count(),0);
    await page.getByRole('button',{name:'Ver ejemplo'}).click();
    const output=path.join(__dirname,'../tmp/product-ads');
    await fs.mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,name+'-'+width+'-planner.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(!f.requests.some(url=>url.origin!==origin||url.pathname.startsWith('/api/')));
    assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
  const noJs=await fixture(browser,width,{scripts:false});
  try{
    await noJs.page.goto(origin+'/');
    await noJs.page.locator('.study-home__head').getByRole('link',{name:'Planificador'}).click();
    assert.equal(new URL(noJs.page.url()).pathname,'/planificador');
    await noJs.page.getByText('Física I',{exact:true}).first().waitFor();
  }finally{await noJs.context.close();}
  console.log(`PASS ${name} ${width}: public HTML, weekly editor, conflicts, export, no network or ads`);
}

async function reports(browser,width){
  const f=await fixture(browser,width,{member:true});
  try{
    const {page}=f;
    await page.goto(origin+'/semana');
    await page.getByText('Parcial de física',{exact:true}).waitFor();
    assert.equal(await page.getByText('oculta',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Semana siguiente'}).click();
    assert.equal(await page.getByText('Parcial de física',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Hoy',exact:true}).click();
    await page.getByText('Parcial de física',{exact:true}).waitFor();
    await page.getByRole('link',{name:'Progreso',exact:true}).click();
    await page.getByRole('button',{name:'30 días'}).click();
    assert.equal(await page.locator('meter').count(),30);
    assert.match(await page.locator('[data-report-totals]').innerText(),/55 min/);
    const other=await f.context.newPage();
    await other.goto(origin+'/planificador');
    await other.evaluate(key=>localStorage.removeItem(key),key);
    await page.getByText('Abrí Estudiemos para iniciar sesión o volver a sincronizar tus datos.').waitFor();
    assert.equal(await page.locator('meter').count(),0);
    assert.equal(f.ads(),0);
    assert.ok(!f.requests.some(url=>url.pathname.startsWith('/api/')));
    assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
  console.log(`PASS ${width}: account-bound reports, logout clearing, no new API calls or ads in shipping build`);
}

async function adPolicy(browser){
  const f=await fixture(browser,1280,{member:true,ad:true});
  try{
    const {page}=f;
    await page.goto(origin+'/semana');
    await page.waitForFunction(()=>window.mockImpressions===1);
    await page.getByRole('button',{name:'Semana siguiente'}).click();
    await page.getByRole('button',{name:'Hoy',exact:true}).click();
    assert.equal(f.ads(),1);
    assert.equal(await page.evaluate(()=>window.mockImpressions),1);
    const config=f.requests.filter(url=>url.pathname==='/api/account-config');
    assert.equal(config.length,1);
    await page.evaluate(()=>{sessionStorage.setItem('mock-consent','denied');window.__emitTcf('denied');});
    await page.waitForFunction(()=>window.__consent==='denied'&&!document.querySelector('ins.adsbygoogle'));
    assert.equal(f.ads(),1);
    assert.deepEqual(f.errors,[]);
  }finally{await f.context.close();}
  for(const options of [{pro:true},{consent:'denied'},{consent:'unknown'},{empty:true},{member:false},{native:true},{adult:false}]){
    const no=await fixture(browser,1280,{member:true,ad:true,...options});
    try{
      await no.page.goto(origin+'/progreso',{waitUntil:'networkidle'});
      assert.equal(no.ads(),0,JSON.stringify(options));
      assert.equal(await no.page.locator('ins.adsbygoogle').count(),0);
    }finally{await no.context.close();}
  }
  console.log('PASS isolated fixture: one manual impression, no refresh, consent revocation, Pro, empty, guest and native exclusions');
}

(async()=>{
  const chrome=await chromium.launch({channel:'chrome'});
  try{await planner(chrome,1366,'chrome');await reports(chrome,1366);if(!live)await adPolicy(chrome);}finally{await chrome.close();}
  const safari=await webkit.launch();
  try{await planner(safari,390,'webkit');await planner(safari,320,'webkit');await reports(safari,390);}finally{await safari.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
