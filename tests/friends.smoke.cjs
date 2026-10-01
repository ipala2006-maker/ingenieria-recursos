const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const {PGlite}=require('@electric-sql/pglite');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/friends-check');
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
(async()=>{
  fs.mkdirSync(output,{recursive:true});const db=new PGlite();let browser,server;
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table user_states(user_id uuid primary key,state jsonb);');
    await db.exec(fs.readFileSync(path.join(root,'supabase/friends.sql'),'utf8'));
    for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
    const today=(await db.query("select to_char(now() at time zone 'UTC','YYYY-MM-DD') as day")).rows[0].day;
    await db.query('insert into user_states values($1,$2)',[ids[0],{values:{estudiemos_pomodoro_streak:{days:{[today]:30}}}}]);
    const sandbox={module:{exports:{}},require:name=>name==='./supabase-admin'?{
      authenticateBearer:async auth=>ids.includes(auth?.slice(7))?{id:auth.slice(7)}:null,
      adminRequest:async(_url,options)=>{const p=JSON.parse(options.body);return (await db.query('select friends_action($1,$2,$3) as result',[p.p_user,p.p_action,p.p_data])).rows[0].result;}
    }:require('../api/_lib/request-security')};
    vm.runInNewContext(fs.readFileSync(path.join(root,'api/_lib/friends.js'),'utf8'),sandbox);
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
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
    browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
    const pages=[],errors=[];
    for(const [i,id] of ids.entries()){
      const context=await browser.newContext({viewport:i?{width:390,height:844}:{width:1366,height:768}});
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      await context.addInitScript(id=>{window.EstudiemosAccount={getUser:()=>({id}),getSession:()=>({access_token:id}),getClient:()=>null,whenReady:async()=>{},open:()=>{}};localStorage.setItem('estudiemos_theme','dark');},id);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('[data-friends-open]').click();await page.locator('[data-my-link]').waitFor({state:'visible'});pages.push(page);
    }
    const [alice,bob]=pages;
    await alice.getByText('Mi nombre y privacidad',{exact:true}).click();await alice.locator('#friendName').fill('Alex');await alice.locator('[data-share]').check();await alice.getByRole('button',{name:'Guardar cambios'}).click();await alice.getByText('Nombre y privacidad guardados.').waitFor();
    const link=await alice.locator('[data-my-link]').inputValue();
    await bob.locator('#friendInvite').fill(link);await bob.getByRole('button',{name:'Enviar solicitud',exact:true}).click();await bob.getByText('Solicitud enviada.',{exact:false}).waitFor();
    await alice.locator('[data-refresh]').click();await alice.getByRole('button',{name:'Aceptar',exact:true}).click();await alice.getByText('Solicitud aceptada.',{exact:true}).waitFor();
    await bob.locator('[data-refresh]').click();await bob.locator('[data-list]').getByText('1 día de racha',{exact:true}).waitFor();
    await alice.getByText('Mi nombre y privacidad',{exact:true}).click();
    await alice.screenshot({path:path.join(output,'friends-desktop-dark.png')});
    await bob.screenshot({path:path.join(output,'friends-mobile-dark.png')});
    for(const page of pages){assert.ok(await page.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal overflow');}
    await alice.getByText('Mi nombre y privacidad',{exact:true}).click();await alice.locator('[data-share]').uncheck();await alice.getByRole('button',{name:'Guardar cambios'}).click();await alice.getByText('Nombre y privacidad guardados.').waitFor();
    await bob.locator('[data-refresh]').click();await bob.getByText('Racha privada',{exact:true}).waitFor();assert.equal(await bob.getByText('1 día de racha',{exact:true}).count(),0);
    await bob.evaluate(()=>{document.documentElement.classList.remove('theme-dark');document.documentElement.classList.add('theme-light');});
    await bob.waitForTimeout(500);
    assert.equal(await bob.locator('.friends-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','light theme has an opaque light surface');
    await bob.screenshot({path:path.join(output,'friends-mobile-light.png')});
    await bob.setViewportSize({width:320,height:640});assert.ok(await bob.locator('.friends-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await bob.evaluate(()=>{window.EstudiemosAccount.getUser=()=>null;window.EstudiemosAccount.getSession=()=>null;window.dispatchEvent(new CustomEvent('estudiemos:account-change'));});
    await bob.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    assert.equal(await bob.locator('[data-content]').isVisible(),false,'logout hides all prior-account data');
    await bob.getByRole('button',{name:'Cerrar amigos',exact:true}).click();assert.equal(await bob.locator('.friends-dialog').isVisible(),false);
    const guestContext=await browser.newContext({viewport:{width:390,height:844}});
    await guestContext.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await guestContext.addInitScript(()=>{window.EstudiemosAccount={getUser:()=>null,getSession:()=>null,whenReady:async()=>{},getClient:()=>null,open:()=>{}};});
    const guest=await guestContext.newPage();await guest.goto(link);await guest.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    assert.ok(!guest.url().includes('friend='),'invitation is removed from the address bar');
    await guest.evaluate(id=>{window.EstudiemosAccount.getUser=()=>({id});window.EstudiemosAccount.getSession=()=>({access_token:id});window.dispatchEvent(new CustomEvent('estudiemos:account-change'));},ids[1]);
    await guest.locator('[data-content]').waitFor({state:'visible'});assert.equal(await guest.locator('#friendInvite').inputValue(),link,'invitation survives sign-in');
    assert.deepEqual(errors,[]);console.log('PASS: two-account invite, acceptance, server ranking, privacy revocation, desktop/mobile/light, dismissal.');
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
