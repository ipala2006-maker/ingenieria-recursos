const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const {PGlite}=require('@electric-sql/pglite'),{createRequire}=require('node:module');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/classrooms');
const teacher='00000000-0000-4000-8000-000000000001',student='00000000-0000-4000-8000-000000000002';
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser,server,lastPage;const db=new PGlite();
  try{
    fs.mkdirSync(out,{recursive:true});
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table friend_profiles(user_id uuid primary key,username text);');
    for(const [id,name]of[[teacher,'Teacher'],[student,'Student']]){await db.query('insert into auth.users values($1,$2,now())',[id,name+'@example.test']);await db.query('insert into friend_profiles values($1,$2)',[id,name]);}
    await db.exec(fs.readFileSync(path.join(root,'supabase/classrooms.sql'),'utf8'));
    const file=path.join(root,'api/_lib/classrooms.js'),localRequire=createRequire(file),sandbox={module:{exports:{}},require(name){
      if(name==='./supabase-admin')return {authenticateBearer:async auth=>[teacher,student].includes(auth?.replace('Bearer ',''))?{id:auth.replace('Bearer ','')}:null,adminRequest:async(_url,options)=>{const v=JSON.parse(options.body);return(await db.query('select classroom_action($1,$2,$3) as data',[v.p_user,v.p_action,v.p_data])).rows[0].data;}};
      if(name==='./request-security')return {...localRequire(name),enforceRateLimit:async()=>true};return localRequire(name);
    }};vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/account-config'&&url.searchParams.get('classes')==='1'){
        let raw='';for await(const chunk of req)raw+=chunk;req.query=Object.fromEntries(url.searchParams);try{req.body=raw?JSON.parse(raw):{};}catch(_){return res.writeHead(400).end();}
        res.status=code=>{res.statusCode=code;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};return sandbox.module.exports(req,res);
      }
      if(url.pathname.startsWith('/api/'))return res.writeHead(200,{'Content-Type':'application/json'}).end('{"enabled":false}');
      const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))return res.writeHead(403).end();
      try{for(const{key,value}of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));}catch(_){res.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    browser=process.env.TEST_WEBKIT==='1'?await webkit.launch():await chromium.launch({channel:'chrome'});
    async function context(user,width,role='student',driveFixture=false){
      const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
      const driveItems=new Map(),driveCalls=[];let driveId=0,pendingUpload;
      const driveRoot={id:'course-root',name:'Estudiemos',mimeType:'application/vnd.google-apps.folder'};ctx.courseDriveCalls=driveCalls;
      await ctx.addInitScript(({user,role})=>{localStorage.setItem('estudiemos_onboarding_v1',JSON.stringify({status:'completed'}));if(user)localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));if(role){localStorage.setItem('estudiemos_course_role:'+(user||'guest'),role);if(user)localStorage.setItem('estudiemos_course_role:owner',user);}window.__classUser=user;},{user,role});
      await ctx.route('**/*',route=>{
        const url=new URL(route.request().url()),request=route.request(),method=request.method();
        if(driveFixture&&url.origin==='https://www.googleapis.com'){
          driveCalls.push({path:url.pathname,method,body:method==='PUT'?'PDF bytes':request.postData()});
          const send=data=>route.fulfill({json:data});
          if(url.pathname==='/drive/v3/about')return send({user:{emailAddress:'teacher@example.test'},storageQuota:{limit:'15000000000',usage:'1000'}});
          if(url.pathname==='/drive/v3/files'&&method==='GET')return send({files:(url.searchParams.get('q')||'').includes('estudiemosRoot')?[driveRoot]:[...driveItems.values()].filter(item=>item.mimeType===driveRoot.mimeType)});
          if(url.pathname==='/drive/v3/files'&&method==='POST'){const item={id:'folder-'+(++driveId),...request.postDataJSON()};driveItems.set(item.id,item);return send(item);}
          if(url.pathname==='/upload/drive/v3/files'&&method==='POST'){pendingUpload=request.postDataJSON();return route.fulfill({status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture','Access-Control-Expose-Headers':'Location'},body:''});}
          if(url.pathname==='/upload/drive/v3/files'&&method==='PUT'){const item={id:'pdf-'+(++driveId),mimeType:'application/pdf',...pendingUpload};driveItems.set(item.id,item);return send(item);}
          const fileId=url.pathname.split('/')[4],item=driveItems.get(fileId);
          if(url.pathname.endsWith('/permissions')&&method==='POST')return send({id:'permission-fixture'});
          if(item){if(method==='PATCH')Object.assign(item,request.postDataJSON());return send(item);}
          return route.fulfill({status:404,json:{error:{message:'Fixture file missing'}}});
        }
        if(url.origin!==base)return route.abort();
        if(url.searchParams.get('drive')==='status')return route.fulfill({json:{connected:driveFixture}});
        if(url.searchParams.get('drive')==='token')return route.fulfill({json:{accessToken:'fixture-only',expiresAt:Date.now()+3600000}});
        if(url.pathname==='/scripts/account.js')return route.fulfill({contentType:'text/javascript',body:`window.EstudiemosAccount={getUser:()=>window.__classUser?{id:window.__classUser}:null,getSession:()=>window.__classUser?{access_token:window.__classUser}:null,whenReady:()=>Promise.resolve({session:window.__classUser?{access_token:window.__classUser}:null}),isSynchronized:()=>true,getClient:()=>null,open:()=>{window.__loginOpened=true},refresh:async()=>{}};window.dispatchEvent(new CustomEvent('estudiemos:account-ready'));`});
        return route.continue();
      });return ctx;
    }
    const tc=await context(teacher,1440),sc=await context(student,390),tp=await tc.newPage(),sp=await sc.newPage(),errors=[];lastPage=tp;
    for(const page of[tp,sp])page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
    await tp.goto(base);await tp.locator('[data-classes-open]').waitFor();assert.notEqual(await tp.locator('[data-classes-open] img').evaluate(el=>getComputedStyle(el).filter),'none','The class icon is visible before loading the optional dialog stylesheet');await tp.locator('[data-classes-open]').click();const td=tp.locator('.classroom-dialog');await td.waitFor({state:'visible'});await tp.locator('[data-class-create]').first().click();
    const form=tp.locator('[data-class-form=create]');await form.locator('[name=title]').fill('Física · 1.º año');await form.locator('[name=teacherName]').fill('Prof. Ana');await form.locator('summary').click();await form.locator('[name=institution]').fill('Universidad piloto');await form.locator('[type=submit]').click();
    await tp.locator('[data-class-code]').waitFor();await tp.waitForFunction(()=>document.querySelector('.classroom-dialog').getAttribute('aria-busy')==='false');
    const state=await tp.evaluate(()=>EstudiemosClasses.snapshot()),code=state.classes[0].code,id=state.classes[0].id;assert.match(code,/^[A-HJ-NP-Z2-9]{10}$/);
    await tp.locator('[data-class-event]').click();const ef=tp.locator('[data-class-form=event_save]'),today=new Date().toISOString().slice(0,10);
    await ef.locator('[name=title]').fill('Parcial de física');await ef.locator('[name=date]').fill(today);await ef.locator('[name=start]').fill('10:00');await ef.locator('[name=end]').fill('12:00');await ef.locator('[name=type]').selectOption('Examen');await ef.locator('[type=submit]').click();await tp.locator('.classroom-row strong').filter({hasText:'Parcial de física'}).waitFor();
    await tp.locator('[data-class-tab=materials]').click();await tp.locator('[data-class-material]').click();const mf=tp.locator('[data-class-form=material_save]');await mf.locator('[name=title]').fill('Guía de ejercicios');await mf.locator('[name=url]').fill('https://drive.google.com/file/d/FILE_123/view');await mf.locator('[type=submit]').click();await tp.locator('.classroom-material-link').waitFor();
    await tp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-teacher-materials.png`)});
    lastPage=sp;await sp.goto(base+'/#clase='+code);const sd=sp.locator('.classroom-dialog');await sd.waitFor({state:'visible'});await sp.locator('[data-class-form=join] [type=submit]').click();await sp.locator('.classroom-course-head h3').waitFor();await sp.locator('.classroom-row strong').filter({hasText:'Parcial de física'}).waitFor();
    assert.equal(await sp.locator('[data-class-code]').count(),0);assert.equal(await sp.locator('[data-class-event]').count(),0);assert.equal(await sp.locator('[data-class-tab=members]').count(),0);
    assert.equal(await sp.evaluate(()=>JSON.parse(localStorage.getItem('bandeja_agenda')||'[]').some(item=>item.title==='Parcial de física')),false,'Class dates never become editable personal copies');
    await sp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-student-dates.png`)});
    for(const page of[tp,sp])assert.equal(await page.locator('.classroom-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'No dialog overflow');
    await sp.locator('[data-class-calendar]').click();await sp.locator('[data-calendar-reader]').waitFor({state:'visible'});const calendar=sp.locator('[data-calendar-reader]');await calendar.locator('[data-calendar-class]').waitFor();assert.equal(await calendar.locator('[data-calendar-edit-entry]').count(),0);assert.equal(await calendar.locator('[data-calendar-day-items]').innerText().then(text=>text.includes('Parcial de física')),true);
    await sp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-student-calendar.png`)});
    await calendar.locator('[data-calendar-class]').click();await sd.waitFor({state:'visible'});await sp.locator('[data-class-tab=materials]').click();await sp.locator('.classroom-material-link').waitFor();assert.equal(await sp.locator('.classroom-material-link').getAttribute('href'),'https://drive.google.com/file/d/FILE_123/view');
    lastPage=tp;await tp.locator('[data-class-tab=events]').click();await tp.locator('[data-class-event]').filter({hasText:'Editar'}).click();await tp.locator('[data-class-form=event_save] [name=title]').fill('Parcial actualizado');await tp.locator('[data-class-form=event_save] [type=submit]').click();await tp.locator('.classroom-row strong').filter({hasText:'Parcial actualizado'}).waitFor();
    lastPage=sp;await sp.locator('[data-class-tab=events]').click();await sp.locator('[data-class-refresh]').click();await sp.locator('.classroom-row strong').filter({hasText:'Parcial actualizado'}).waitFor();
    const dc=await context(teacher,1440,'teacher',true),dp=await dc.newPage();lastPage=dp;dp.on('pageerror',error=>errors.push(error.message));
    await dp.goto(base);await dp.waitForURL('**/materias.html');await dp.locator('[data-class-select="'+id+'"]').click();await dp.locator('.classroom-course-head h3').waitFor();
    assert.equal(await dp.locator('.classroom-tools button').count(),3);assert.equal(await dp.locator('[data-dashboard-widget], [data-study-goal-dialog], [data-pomodoro]').count(),0);
    assert.equal(await dp.locator('dialog.classroom-dialog').count(),0,'Teacher account controls must not be blocked by a native modal');
    await dp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-dedicated-teacher.png`)});
    await dp.locator('[data-class-share]').click();const link=await dp.locator('[data-class-link]').inputValue();assert.match(link,/#materia=/);assert.equal(require('../shared/classrooms').invitation(link,base),code);await dp.locator('[data-class-back]').click();
    await dp.locator('[data-class-material]').first().click();const uploadForm=dp.locator('[data-class-form=material_save]');
    assert.equal(await uploadForm.locator('[name=shareByLink]').isChecked(),false);await uploadForm.locator('[name=pdf]').setInputFiles({name:'Guia privada.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture course material')});await uploadForm.locator('[type=submit]').click();await dp.locator('.classroom-material-link').filter({hasText:'Guia privada'}).waitFor();assert.equal(dc.courseDriveCalls.filter(call=>call.path.endsWith('/permissions')).length,0);
    await dp.locator('[data-class-material]').first().click();await uploadForm.locator('[name=pdf]').setInputFiles({name:'Guia compartida.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture shared material')});await uploadForm.locator('[name=shareByLink]').check();await uploadForm.locator('[type=submit]').click();await dp.locator('.classroom-confirm').waitFor();assert.equal(dc.courseDriveCalls.filter(call=>call.path.endsWith('/permissions')).length,0,'Checkbox is not sufficient without the per-file confirmation');await dp.locator('.classroom-confirm button').filter({hasText:'Cancelar'}).click();await dp.waitForFunction(()=>document.querySelector('.classroom-dialog').getAttribute('aria-busy')==='false');assert.equal(dc.courseDriveCalls.filter(call=>call.path.endsWith('/permissions')).length,0);
    await uploadForm.locator('[type=submit]').click();await dp.locator('.classroom-confirm button').filter({hasText:'Confirmar'}).click();await dp.locator('.classroom-material-link').filter({hasText:'Guia compartida'}).waitFor();assert.equal(dc.courseDriveCalls.filter(call=>call.path.endsWith('/permissions')).length,1);assert.deepEqual(JSON.parse(dc.courseDriveCalls.find(call=>call.path.endsWith('/permissions')).body),{type:'anyone',role:'reader',allowFileDiscovery:false});
    await dp.setViewportSize({width:390,height:844});await dp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-dedicated-mobile.png`)});assert.equal(await dp.locator('.classroom-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await dp.evaluate(()=>window.EstudiemosTheme.set('light'));await dp.waitForFunction(()=>getComputedStyle(document.querySelector('.classroom-dialog')).backgroundColor==='rgb(255, 255, 255)');await dp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-teacher-light.png`)});
    const rc=await context(student,390,''),rp=await rc.newPage();lastPage=rp;await rp.goto(base+'/?materias=1');await rp.locator('[data-class-role-choice=student]').waitFor();await rp.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-role-choice.png`)});await rp.locator('[data-class-role-choice=student]').click();assert.equal(new URL(rp.url()).pathname,'/');await rp.locator('[data-class-create]').first().click();const own=rp.locator('[data-class-form=create]');await own.locator('[name=title]').fill('Comisión entre compañeros');await own.locator('[name=teacherName]').fill('Estudiante coordinador');await own.locator('[type=submit]').click();await rp.locator('.classroom-tools').waitFor();assert.equal((await rp.evaluate(()=>EstudiemosClasses.snapshot())).classes.find(item=>item.title==='Comisión entre compañeros').role,'teacher');await rc.close();await dc.close();
    await sp.evaluate(()=>{window.__classUser='';window.dispatchEvent(new CustomEvent('estudiemos:account-change'));});assert.equal(await sp.locator('.classroom-main').innerText().then(text=>text.includes('Parcial actualizado')),false);assert.equal(await sp.evaluate(()=>EstudiemosClasses.snapshot()),null);assert.equal(await sp.evaluate(()=>localStorage.getItem('estudiemos_classes_v1')),null);
    const guest=await context('',320),gp=await guest.newPage();lastPage=gp;await gp.goto(base+'/#clase='+code);await gp.locator('[data-class-login]').click();assert.equal(await gp.evaluate(()=>window.__loginOpened),true);assert.equal(await gp.locator('.classroom-dialog').isVisible(),false,'Account sign-in is not hidden behind a native modal');assert.equal(await gp.locator('[data-study-goal-dialog][open]').count(),0);await guest.close();
    const direct=await context('',320),directPage=await direct.newPage();lastPage=directPage;await directPage.goto(base+'/?clase=');await directPage.locator('[data-class-login]').click();assert.equal(await directPage.locator('[data-study-goal-dialog][open]').count(),0,'A direct class link must also defer the daily goal until after sign-in');await direct.close();
    assert.deepEqual(errors,[]);console.log('PASS real HTTP + SQL: teacher creates class/date/Drive material; student joins by link, sees read-only calendar, receives edits, opens materials; owner privacy, logout, guest login and responsive UI verified.');
    await tc.close();await sc.close();
  }catch(error){if(lastPage&&!lastPage.isClosed())await lastPage.screenshot({path:path.join(out,`${process.env.TEST_WEBKIT?'webkit':'chrome'}-failure.png`)});throw error;}
  finally{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
