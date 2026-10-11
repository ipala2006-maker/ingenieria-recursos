const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const {PGlite}=require('@electric-sql/pglite');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/friends-check');
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
(async()=>{
  fs.mkdirSync(output,{recursive:true});const db=new PGlite();let browser,server;
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create table user_states(user_id uuid primary key,state jsonb);');
    await db.exec(fs.readFileSync(path.join(root,'supabase/friends.sql'),'utf8'));
    for(const [i,id] of ids.entries())await db.query('insert into auth.users values($1,$2,now())',[id,`student${i+1}@example.test`]);
    const today=(await db.query("select to_char(now() at time zone 'UTC','YYYY-MM-DD') as day")).rows[0].day;
    await db.query('insert into user_states values($1,$2)',[ids[0],{values:{estudiemos_pomodoro_streak:{days:{[today]:30}}}}]);
    const sandbox={module:{exports:{}},require:name=>name==='./supabase-admin'?{
      authenticateBearer:async auth=>ids.includes(auth?.slice(7))?{id:auth.slice(7)}:null,
      adminRequest:async(_url,options)=>{const p=JSON.parse(options.body);return (await db.query('select friends_action($1,$2,$3) as result',[p.p_user,p.p_action,p.p_data])).rows[0].result;}
    }:require('../api/_lib/request-security')};
    vm.runInNewContext(fs.readFileSync(path.join(root,'api/_lib/friends.js'),'utf8'),sandbox);
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(/^\/amistad\/[^/]+$/.test(url.pathname)){
        req.query={friendInvitation:url.pathname.split('/').pop()};
        res.status=code=>{res.statusCode=code;return res;};res.send=body=>res.end(body);res.json=data=>{res.setHeader('Content-Type','application/json');return res.send(JSON.stringify(data));};
        await require('../api/account-config')(req,res);return;
      }
      if(url.pathname==='/api/account-config'&&url.searchParams.get('friends')==='1'){
        let raw='';for await(const chunk of req)raw+=chunk;
        req.body=raw?JSON.parse(raw):{};res.status=code=>{res.statusCode=code;return res;};res.json=data=>res.end(JSON.stringify(data));
        try{await sandbox.module.exports(req,res);}catch(e){res.status(500).json({message:e.message});}return;
      }
      if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"enabled":false}');return;}
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      try{const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/`;
    browser=process.env.FRIENDS_BROWSER==='webkit'
      ? await webkit.launch({headless:true})
      : await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
    const pages=[],errors=[];
    for(const [i,id] of ids.entries()){
      const context=await browser.newContext({serviceWorkers:'block',timezoneId:'UTC',viewport:i?{width:390,height:844}:{width:1366,height:768}});
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      await context.addInitScript(id=>{window.EstudiemosAccount={getUser:()=>({id}),getSession:()=>({access_token:id}),getClient:()=>null,whenReady:async()=>({session:{user:{id}}}),isSynchronized:()=>true,open:()=>{}};localStorage.setItem('estudiemos_theme','dark');localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedInvitation=text;}}});Object.defineProperty(navigator,'share',{writable:true,value:async data=>{window.sharedInvitation=data;}});},id);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('[data-friends-open]').click();await page.locator('[data-content]').waitFor({state:'visible'});pages.push(page);
    }
    const [alice,bob]=pages;
    await bob.getByRole('button',{name:'Mi nombre y privacidad',exact:true}).click();
    await bob.locator('#friendName').fill('@BRUNO_ESTUDIA');
    await bob.getByRole('button',{name:'Guardar cambios'}).click();await bob.getByText('Nombre y privacidad guardados.').waitFor();
    await bob.locator('[data-back]').click();
    await bob.getByRole('button',{name:'Cerrar amigos',exact:true}).click();
    await alice.getByRole('button',{name:'Agregar amigos',exact:true}).click();
    assert.equal(await alice.locator('[data-invite-form],#friendInvite,.friends-paste').count(),0,'links are handled automatically, with no paste form');
    await alice.locator('[data-copy]').click();await alice.getByText('Invitación copiada.',{exact:false}).waitFor();
    const copied=await alice.evaluate(()=>window.copiedInvitation);
    assert.match(copied,/¡Estudiemos juntos! Te invito a ser mi amigo en Estudiemos/);assert.match(copied,/\/amistad\/[a-f0-9]{32}$/);
    await alice.locator('[data-native-share]').click();
    const shared=await alice.evaluate(()=>window.sharedInvitation);assert.equal(shared.title,'Solicitud de amistad en Estudiemos');assert.ok(copied.endsWith(shared.url));assert.ok(copied.startsWith(shared.text));
    await alice.evaluate(()=>{navigator.share=async()=>{throw new DOMException('Canceled','AbortError');};window.copiedInvitation=null;});
    await alice.locator('[data-native-share]').click();assert.equal(await alice.evaluate(()=>window.copiedInvitation),null,'canceling native share never copies or sends an invitation');
    await alice.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Denied');};});
    await alice.locator('[data-copy]').click();await alice.locator('[data-invitation-fallback]').waitFor();assert.equal(await alice.locator('[data-invitation-fallback]').inputValue(),copied);
    await alice.locator('#friendContact').fill('STUDENT2@example.test');
    await alice.locator('[data-contact-form]').getByRole('button',{name:'Enviar solicitud',exact:true}).click();
    await alice.getByText('Si corresponde a una cuenta confirmada',{exact:false}).waitFor();
    assert.equal(await alice.locator('[data-outgoing] .friends-request').count(),1);
    assert.equal(await alice.getByRole('button',{name:'Aceptar',exact:true}).count(),0,'sender never sees an accept action for their own email request');
    assert.equal(await alice.getByRole('button',{name:'Rechazar',exact:true}).count(),0);
    assert.equal(await alice.locator('[data-install-suggestion]').isVisible(),false,'manual contact requests do not interrupt with an install suggestion');
    await bob.locator('[data-friends-open]').click();await bob.locator('[data-incoming] .friends-request').waitFor();
    assert.equal(await bob.locator('[data-incoming] .friends-request').count(),1,'email request arrives in the recipient app without a link or manual refresh');
    await bob.locator('[data-incoming]').getByRole('button',{name:'Aceptar',exact:true}).waitFor();
    await alice.getByRole('button',{name:'Cancelar',exact:true}).click();await alice.getByText('Solicitud cancelada.',{exact:true}).waitFor();
    await alice.getByRole('button',{name:'Agregar amigos',exact:true}).click();
    await alice.locator('#friendContact').fill('@BRUNO_ESTUDIA');
    await alice.locator('[data-contact-form]').getByRole('button',{name:'Enviar solicitud',exact:true}).click();
    await alice.getByText('Si corresponde a una cuenta confirmada',{exact:false}).waitFor();
    await alice.locator('[data-outgoing]').getByText('@bruno_estudia',{exact:true}).waitFor();
    assert.equal(await alice.getByRole('button',{name:'Aceptar',exact:true}).count(),0,'sender only has Cancelar for username requests');
    await alice.reload();await alice.locator('[data-friends-open]').click();await alice.locator('[data-outgoing] .friends-request').waitFor();
    assert.equal(await alice.locator('[data-incoming] .friends-request').count(),0,'outgoing requests stay outgoing after a reload');
    await alice.screenshot({path:path.join(output,'friend-request-sender.png')});
    await bob.locator('[data-refresh]').click();await bob.locator('[data-incoming] .friends-request').waitFor();
    assert.equal(await bob.locator('[data-incoming] .friends-request').count(),1,'username routes to the same recipient in-app');
    await bob.locator('[data-incoming]').getByRole('button',{name:'Aceptar',exact:true}).waitFor();
    await bob.screenshot({path:path.join(output,'friend-request-recipient.png')});
    await alice.getByRole('button',{name:'Cancelar',exact:true}).click();await alice.getByText('Solicitud cancelada.',{exact:true}).waitFor();
    await bob.getByRole('button',{name:'Agregar amigos',exact:true}).click();
    await bob.screenshot({path:path.join(output,'friends-email-mobile.png')});
    assert.ok(await bob.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await bob.locator('[data-back]').click();
    await alice.getByRole('button',{name:'Mi nombre y privacidad',exact:true}).click();await alice.locator('#friendName').fill('alex');await alice.locator('[data-share]').check();await alice.getByRole('button',{name:'Guardar cambios'}).click();await alice.getByText('Nombre y privacidad guardados.').waitFor();await alice.locator('[data-back]').click();
    const link=await alice.locator('[data-my-link]').inputValue();
    const token=new URL(link).pathname.split('/').pop(),legacyLink=base+'#friend='+token;
    const preview=await (await fetch(link,{headers:{'User-Agent':'facebookexternalhit/1.1'}})).text();
    assert.match(preview,/og:title" content="Solicitud de amistad en Estudiemos/);assert.ok(preview.includes('https://estudiemos-app.vercel.app/amistad/'+token));
    const noJSContext=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),noJS=await noJSContext.newPage();
    await noJS.goto(link);assert.equal(await noJS.title(),'Solicitud de amistad en Estudiemos');
    assert.equal(await noJS.locator('[data-invitation-open]').getAttribute('href'),'/#friend='+token);
    assert.ok(await noJS.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),'invitation fallback fits mobile');
    await noJS.screenshot({path:path.join(output,'invitation-fallback-mobile.png')});await noJSContext.close();
    assert.equal((await db.query('select count(*)::int as n from friend_links')).rows[0].n,0,'preview crawlers cannot create a request');
    await bob.goto(link);await bob.getByText('¡Ya son amigos! La invitación quedó aceptada.',{exact:true}).waitFor();
    await bob.locator('[data-install-suggestion]').waitFor();
    await bob.screenshot({path:path.join(output,'friend-install-suggestion-mobile.png')});
    await bob.setViewportSize({width:320,height:640});assert.ok(await bob.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await bob.screenshot({path:path.join(output,'friend-install-suggestion-320.png')});await bob.setViewportSize({width:390,height:844});
    await bob.getByRole('button',{name:'Ahora no',exact:true}).click();assert.equal(await bob.locator('[data-install-suggestion]').isVisible(),false);
    assert.equal(await bob.evaluate(id=>localStorage.getItem('estudiemos_friend_install_v1:'+id),ids[1]),'dismissed');
    assert.equal(await bob.locator('[data-list]').getByText('@alex',{exact:true}).count(),1,'opening an invitation completes the friendship');
    assert.equal(await bob.locator('[data-requests]').isVisible(),false,'no extra request remains for either side');
    assert.equal(await bob.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')),null,'success consumes pending invite');
    await bob.goto(link);await bob.getByText('Ya son amigos. Esta invitación ya estaba aceptada.',{exact:true}).waitFor();
    assert.equal(await bob.locator('[data-install-suggestion]').isVisible(),false,'reopening the same link does not insist on installation');
    assert.equal((await db.query('select count(*)::int as n from friend_links')).rows[0].n,1,'repeat opens are idempotent');
    await alice.locator('[data-refresh]').click();await alice.locator('[data-list]').getByText('@bruno_estudia',{exact:true}).waitFor();
    assert.equal(await alice.locator('[data-requests]').isVisible(),false,'inviter does not have to accept their own shared link');
    await bob.locator('[data-refresh]').click();await bob.locator('[data-list]').getByText('1 día de racha',{exact:true}).waitFor();
    await alice.screenshot({path:path.join(output,'friends-desktop-dark.png')});
    await bob.screenshot({path:path.join(output,'friends-mobile-dark.png')});
    for(const page of pages){assert.ok(await page.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal overflow');}
    await alice.getByRole('button',{name:'Mi nombre y privacidad',exact:true}).click();await alice.locator('[data-share]').uncheck();await alice.getByRole('button',{name:'Guardar cambios'}).click();await alice.getByText('Nombre y privacidad guardados.').waitFor();
    await bob.locator('[data-refresh]').click();await bob.getByText('Racha privada',{exact:true}).waitFor();assert.equal(await bob.getByText('1 día de racha',{exact:true}).count(),0);
    await bob.locator('[data-view="ranking"]').click();await bob.getByText('Todavía no hay rachas compartidas.',{exact:true}).waitFor();await bob.locator('[data-view="all"]').click();await bob.getByText('Racha privada',{exact:true}).waitFor();
    await bob.evaluate(()=>{document.documentElement.classList.remove('theme-dark');document.documentElement.classList.add('theme-light');});
    await bob.waitForTimeout(500);
    assert.equal(await bob.locator('.friends-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','light theme has an opaque light surface');
    await bob.screenshot({path:path.join(output,'friends-mobile-light.png')});
    await bob.setViewportSize({width:320,height:640});assert.ok(await bob.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await bob.evaluate(()=>{window.EstudiemosAccount.getUser=()=>null;window.EstudiemosAccount.getSession=()=>null;window.dispatchEvent(new CustomEvent('estudiemos:account-change'));});
    await bob.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    assert.equal(await bob.locator('[data-content]').isVisible(),false,'logout hides all prior-account data');
    await bob.getByRole('button',{name:'Cerrar amigos',exact:true}).click();assert.equal(await bob.locator('.friends-dialog').isVisible(),false);
    const guestContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'});
    await guestContext.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await guestContext.addInitScript(()=>{window.EstudiemosAccount={getUser:()=>null,getSession:()=>null,whenReady:async()=>({session:null}),getClient:()=>null,open:()=>{}};localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));});
    await db.query('delete from friend_links');
    const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(link);await guest.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    assert.ok(!guest.url().includes('friend='),'invitation is removed from the address bar');
    await guest.reload();await guest.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    await guest.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await guest.evaluate(id=>{window.EstudiemosAccount.getUser=()=>({id});window.EstudiemosAccount.getSession=()=>({access_token:id});window.dispatchEvent(new CustomEvent('estudiemos:account-ready'));},ids[1]);
    await guest.getByText('¡Ya son amigos! La invitación quedó aceptada.',{exact:true}).waitFor();
    assert.equal(await guest.locator('[data-list]').getByText('@alex',{exact:true}).count(),1,'invite survives reload and account-ready accepts after login');
    await guest.locator('[data-install-suggestion]').waitFor();
    await guest.route('**/downloads/Estudiemos-Para-Windows.exe',route=>route.fulfill({contentType:'application/octet-stream',headers:{'Content-Disposition':'attachment; filename="Estudiemos-Para-Windows.exe"'},body:'Disposable installer fixture; never run.'}));
    const downloaded=guest.waitForEvent('download');downloaded.catch(()=>{});await guest.locator('[data-friend-install]').click();await downloaded;
    await guest.getByText('Incluye la app, los widgets y el soporte de alarmas.',{exact:false}).waitFor();
    assert.equal(await guest.locator('.friends-dialog').isVisible(),false,'install guide is not hidden under the friends modal');
    assert.equal((await db.query('select count(*)::int as n from friend_links where accepted')).rows[0].n,1,'the friendship stays saved after choosing installation');
    await guest.getByRole('button',{name:'Entendido',exact:true}).click();await guest.locator('[data-friends-open]').click();await guest.locator('.friends-row').waitFor();
    guest.once('dialog',dialog=>dialog.accept());await guest.locator('.friends-row-menu summary').click();await guest.getByRole('button',{name:'Quitar',exact:true}).click();await guest.getByText('Amigo eliminado.',{exact:true}).waitFor();
    // Retry retains the invitation if the request fails, but not after a successful retry.
    await guest.route('**/api/account-config?friends=1',route=>route.request().postDataJSON()?.action==='accept_invite'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Conexión interrumpida.'})}):route.continue());
    await guest.evaluate(url=>{location.hash=new URL(url).hash;},legacyLink);await guest.getByText('Conexión interrumpida.',{exact:true}).waitFor();
    assert.ok(await guest.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')));
    await guest.unroute('**/api/account-config?friends=1');await guest.getByRole('button',{name:'Volver a intentar'}).click();await guest.getByText('¡Ya son amigos! La invitación quedó aceptada.',{exact:true}).waitFor();
    assert.equal(await guest.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')),null);
    const ownLink=await guest.locator('[data-my-link]').inputValue();await guest.evaluate(url=>{location.hash='friend='+new URL(url).pathname.split('/').pop();},ownLink);await guest.getByText('Este es tu propio enlace.',{exact:false}).waitFor();
    assert.equal(await guest.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')),null);
    await guest.evaluate(()=>{location.hash='friend='+'0'.repeat(32);});await guest.locator('[data-status].is-error').waitFor();assert.equal(await guest.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')),null,'invalid token is not retried forever');
    const lateId='00000000-0000-4000-8000-000000000003';ids.push(lateId);await db.query('insert into auth.users(id) values($1)',[lateId]);
    const lateContext=await browser.newContext({serviceWorkers:'block'});await lateContext.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/fixture.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><nav class="topbar__nav"></nav><script src="/scripts/page-shell.js"></script><script src="/scripts/friends.js"></script></body></html>'});
      return url.origin===new URL(base).origin?route.continue():route.abort();
    });
    const late=await lateContext.newPage();late.on('pageerror',e=>errors.push(e.message));await late.goto(base+'fixture.html'+new URL(legacyLink).hash);await late.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    await late.evaluate(id=>{window.EstudiemosAccount={getUser:()=>({id}),getSession:()=>({access_token:id}),whenReady:async()=>{}};window.dispatchEvent(new Event('estudiemos:account-ready'));},lateId);
    await late.getByText('¡Ya son amigos! La invitación quedó aceptada.',{exact:true}).waitFor();
    assert.equal(await late.locator('.friends-row').count(),1,'account script can arrive after the invitation script');
    // A saved request belongs to its original account, not the next one using this browser.
    await late.evaluate(({token,userId})=>{localStorage.setItem('estudiemos_friend_invite_v2',JSON.stringify({token,userId,expires:Date.now()+86400000}));window.dispatchEvent(new Event('estudiemos:account-change'));},{token,userId:ids[1]});
    await late.getByText('Volvé a abrir la invitación con esta cuenta.',{exact:true}).waitFor();assert.equal(await late.evaluate(()=>localStorage.getItem('estudiemos_friend_invite_v2')),null);
    await late.evaluate(token=>{localStorage.setItem('estudiemos_friend_invite_v2',JSON.stringify({token,userId:'',expires:Date.now()-1}));},token);await late.reload();assert.equal(await late.locator('.friends-dialog').isVisible(),false,'expired invites do not reopen or send');
    // A populated list stays readable and searchable, including long aliases and private streaks.
    const sqlCall=async(user,action,data={})=>(await db.query('select friends_action($1,$2,$3) as result',[user,action,data])).rows[0].result;
    for(let n=10;n<16;n++){
      const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;await db.query('insert into auth.users(id) values($1)',[id]);
      const profile=await sqlCall(id,'profile',{name:n===10?'María Victoria Fernández López':['Sofía','Lucas','Valentina','Tomás','Camila'][n-11],share:n%2===0,timezone:'UTC'});
      await sqlCall(ids[0],'accept_invite',{invite:profile.me.invite});
    }
    await alice.locator('[data-back]').click();await alice.locator('[data-refresh]').click();await alice.locator('[data-search]').waitFor({state:'visible'});
    await alice.screenshot({path:path.join(output,'friends-populated-desktop.png')});await alice.locator('#friendSearch').fill('Fernández');assert.equal(await alice.locator('.friends-row').count(),1);await alice.locator('#friendSearch').fill('');
    await alice.setViewportSize({width:320,height:640});await alice.screenshot({path:path.join(output,'friends-populated-mobile.png')});assert.ok(await alice.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    for(const [n,platform,userAgent] of [
      [50,'iphone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'],
      [51,'android','Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36']
    ]){
      const id=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;ids.push(id);await db.query('insert into auth.users values($1,$2,now())',[id,platform+'@example.test']);
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},userAgent});
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      await context.addInitScript(({id,platform})=>{window.EstudiemosAccount={getUser:()=>({id}),getSession:()=>({access_token:id}),getClient:()=>null,whenReady:async()=>({session:{user:{id}}}),isSynchronized:()=>true,open:()=>{}};localStorage.setItem('estudiemos_theme','dark');localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));if(platform==='android')Object.defineProperty(document,'referrer',{get:()=> 'android-app://com.whatsapp'});},{id,platform});
      const page=await context.newPage();let downloads=0;page.on('download',()=>downloads++);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(link);await page.getByText('¡Ya son amigos! La invitación quedó aceptada.',{exact:true}).waitFor();await page.locator('[data-install-suggestion]').waitFor();
      assert.equal(downloads,0,'opening an invitation cannot download an installer');assert.ok(await page.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      await page.screenshot({path:path.join(output,'friend-install-suggestion-'+platform+'.png')});
      if(platform==='iphone'){
        await page.locator('[data-friend-install]').click();await page.getByText('En iPhone no se descarga desde App Store.',{exact:false}).waitFor();
        assert.equal(await page.locator('.friends-dialog').isVisible(),false);assert.equal(downloads,0,'iPhone shows the Safari guide, not a Windows/Android download');
        await page.screenshot({path:path.join(output,'friend-install-iphone-guide.png')});
      }
      await context.close();
    }
    assert.deepEqual(errors,[]);console.log('PASS: automatic link, sign-in/reload, requests/privacy, install suggestion/dismissal, Windows explicit package, iPhone guide, Android browser, mobile/light.');
  }catch(error){
    for(const [i,context] of (browser?.contexts()||[]).entries())for(const page of context.pages()){
      await page.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});
      console.error('Pilot UI:',await page.locator('.friends-dialog').innerText().catch(()=>''));
    }
    console.error('Pilot profiles:',(await db.query('select user_id,name,share_streak,timezone from friend_profiles')).rows);
    throw error;
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
