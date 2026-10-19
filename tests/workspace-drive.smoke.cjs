const {chromium,webkit}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/workspace-drive');
const owner='11111111-1111-4111-8111-111111111111',folder='drive-root-folder',mime='application/vnd.google-apps.folder';
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  fs.mkdirSync(out,{recursive:true});let browser;
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    try{for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch(_){res.writeHead(404).end();}
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    const engine=process.env.TEST_WEBKIT==='1'?'webkit':'chrome';browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
    for(const width of process.env.TEST_WIDTH ? [Number(process.env.TEST_WIDTH)] : [1440,390,320]){
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
      let connected=false,enabled=true,next=0,uploaded='',files=[{id:'root-folder-file',name:'An\u00e1lisis matem\u00e1tico',mimeType:mime,parents:[folder],modifiedTime:'2026-10-19',appProperties:{estudiemosSpace:folder,estudiemosOwner:owner}},{id:'root-pdf-file',name:'Gu\u00eda de ejercicios.pdf',mimeType:'application/pdf',size:'1000000',parents:[folder],modifiedTime:'2026-10-19',appProperties:{estudiemosSpace:folder,estudiemosOwner:owner}}];
      const requests=[];
      await context.addInitScript(({owner})=>{
        const originalFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(String(url).startsWith('https://www.googleapis.com/upload/')&&options?.method==='PUT'&&options.body instanceof Blob)window.__uploadedBlob=await options.body.text();return originalFetch(url,options);};
        window.__pilotUser={id:owner,email:'estudiante@example.test'};
        window.EstudiemosAccount={getUser:()=>window.__pilotUser,getSession:()=>window.__pilotUser?{access_token:'pilot-session'}:null,getClient:()=>null,whenReady:async()=>({session:{user:window.__pilotUser}}),isSynchronized:()=>true,open:()=>{window.__loginOpened=true;}};
        localStorage.setItem('estudiemos_pomodoro_streak',JSON.stringify({days:{},goal:{minutes:25,updatedAt:1}}));
      },{owner});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());requests.push({url:url.href,method:request.method(),body:request.postData()});
        if(url.origin===base){
          if(url.pathname.startsWith('/api/')){
            const action=url.searchParams.get('drive');
            if(action==='config')return route.fulfill({json:{enabled}});
            if(action==='status')return route.fulfill({json:{connected}});
            if(action==='token')return route.fulfill({json:{accessToken:'pilot-google-access',expiresAt:Date.now()+3600000}});
            if(action==='disconnect'){connected=false;return route.fulfill({json:{connected:false}});}
            if(action==='start')return route.fulfill({json:{url:'https://accounts.google.com/o/oauth2/v2/auth?scope='+encodeURIComponent('https://www.googleapis.com/auth/drive.file')}});
            return route.fulfill({json:{enabled:false}});
          }
          return route.continue();
        }
        if(url.origin==='https://accounts.google.com')return route.fulfill({contentType:'text/html',body:'<h1>Google authorization pilot</h1>'});
        if(url.origin!=='https://www.googleapis.com')return route.abort();
        if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS','Access-Control-Allow-Headers':'*','Access-Control-Max-Age':'600'}});
        assert.equal(request.headers().authorization,'Bearer pilot-google-access');
        if(url.pathname.endsWith('/about'))return route.fulfill({json:{user:{emailAddress:'estudiante@example.test'},storageQuota:{limit:'15000000000',usage:'2000000000'}}});
        if(url.pathname.startsWith('/upload/')){
          if(request.method()==='POST')return route.fulfill({status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=pilot','Access-Control-Expose-Headers':'Location,Range','Access-Control-Allow-Origin':'*'}});
          uploaded=request.postDataBuffer()?.toString()||'';const item={id:'uploaded-file',name:'Mi apunte.pdf',mimeType:'application/pdf',size:'20',parents:[folder],appProperties:{estudiemosOwner:owner,estudiemosSpace:folder}};files.push(item);return route.fulfill({json:item});
        }
        const fileId=url.pathname.split('/')[4];
        if(fileId){
          const item=files.find(item=>item.id===fileId);if(!item)return route.fulfill({status:404,json:{}});
          if(request.method()==='PATCH'){Object.assign(item,JSON.parse(request.postData()||'{}'));if(url.searchParams.get('addParents'))item.parents=[url.searchParams.get('addParents')];}
          return route.fulfill({json:item});
        }
        if(request.method()==='POST'){const data=JSON.parse(request.postData());const item={...data,id:'new-folder-'+(++next),modifiedTime:'2026-10-19'};files.push(item);return route.fulfill({json:item});}
        const q=url.searchParams.get('q')||'';
        if(q.includes('estudiemosRoot'))return route.fulfill({json:{files:[{id:folder,name:'Estudiemos',mimeType:mime}]}});
        let visible=files.filter(item=>!item.trashed);
        const parent=/'([A-Za-z0-9_-]+)' in parents/.exec(q);if(parent)visible=visible.filter(item=>item.parents.includes(parent[1]));
        if(q.includes('mimeType ='))visible=visible.filter(item=>item.mimeType===mime);
        const search=/name contains '([^']*)'/.exec(q);if(search)visible=visible.filter(item=>item.name.includes(search[1]));
        return route.fulfill({json:{files:visible}});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('crash',()=>console.error('PAGE CRASH',page.url()));
      await page.goto(base+'/mi-espacio.html');const connect=page.locator('[data-drive-connect]');await connect.waitFor();
      assert.equal(await connect.isEnabled(),true);assert.equal(requests.filter(r=>r.url.startsWith('https://www.googleapis.com')).length,0,'Disconnected users do not touch Google files');
      for(const theme of ['dark','light']){await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);await page.waitForTimeout(300);await page.screenshot({path:path.join(out,`${engine}-${width}-connect-${theme}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
      await connect.click();await page.waitForURL('https://accounts.google.com/**');assert.ok(page.url().includes('drive.file'));
      connected=true;await page.goto(base+'/mi-espacio.html?drive=connected');
      const body=page.locator('[data-workspace-items]');await body.getByText('Gu\u00eda de ejercicios.pdf',{exact:true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.has('drive'),false,'Callback markers are removed from the page URL');
      await page.locator('[data-workspace-add]').first().click();await page.locator('[data-drive-add-folder]').click();
      await page.locator('.drive-dialog input').fill('Qu\u00edmica');await page.locator('.drive-dialog [type=submit]').click();await body.getByText('Qu\u00edmica',{exact:true}).waitFor();
      await page.locator('[data-workspace-menu="new-folder-1"]').click();await page.locator('[data-drive-rename]').click();await page.locator('.drive-dialog input').fill('Qu\u00edmica II');await page.locator('.drive-dialog [type=submit]').click();await body.getByText('Qu\u00edmica II',{exact:true}).waitFor();
      await page.locator('[data-workspace-open="new-folder-1"]').click();await page.waitForFunction(()=>document.querySelector('[data-workspace-breadcrumbs]').textContent.includes('Qu\u00edmica II'));await page.locator(`[data-workspace-folder="${folder}"]`).click();await body.getByText('Gu\u00eda de ejercicios.pdf',{exact:true}).waitFor();
      await page.locator('[data-workspace-file-input]').setInputFiles({name:'Mi apunte.pdf',mimeType:'application/pdf',buffer:Buffer.from('original file bytes')});
      try{await body.getByText('Mi apunte.pdf',{exact:true}).waitFor();}catch(error){console.error('UPLOAD STATUS',await page.locator('[data-workspace-status]').textContent(),requests.slice(-8));throw error;}
      assert.equal(await page.evaluate(()=>window.__uploadedBlob),'original file bytes');if(engine==='chrome')assert.equal(uploaded,'original file bytes');
      await page.locator('[data-workspace-menu="uploaded-file"]').click();await page.locator('[data-drive-move]').click();await page.locator('.drive-dialog select').selectOption('new-folder-1');await page.locator('.drive-dialog [type=submit]').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.workspace-item__name')).some(el=>el.textContent==='Mi apunte.pdf'));
      await page.locator('[data-workspace-open="new-folder-1"]').click();await body.getByText('Mi apunte.pdf',{exact:true}).waitFor();await page.locator('[data-workspace-menu="uploaded-file"]').click();await page.locator('[data-drive-trash]').click();await page.locator('[data-drive-trash-confirm]').click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.workspace-item__name')).some(el=>el.textContent==='Mi apunte.pdf'));assert.equal(files.find(item=>item.id==='uploaded-file').trashed,true);
      await page.locator(`[data-workspace-folder="${folder}"]`).click();await body.getByText('Gu\u00eda de ejercicios.pdf',{exact:true}).waitFor();
      await page.locator('[data-workspace-search]').fill('Qu\u00edmica');await page.waitForFunction(()=>document.querySelectorAll('.workspace-item').length===1);await page.locator('[data-workspace-search]').fill('');await page.waitForFunction(()=>document.querySelectorAll('.workspace-item').length===3);
      for(const theme of ['dark','light']){await page.evaluate(theme=>window.EstudiemosTheme.set(theme),theme);await page.waitForTimeout(300);await page.screenshot({path:path.join(out,`${engine}-${width}-files-${theme}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
      assert.ok(!await page.evaluate(()=>JSON.stringify(localStorage).includes('pilot-google-access')));
      assert.ok(!requests.some(r=>r.url.includes('workspace_items')||r.url.includes('/storage/v1/')),'Drive files never use Supabase storage');
      assert.ok(!requests.some(r=>r.url.startsWith(base)&&r.body?.includes('original file bytes')),'No file bytes pass through Estudiemos');
      await page.evaluate(()=>{window.__pilotUser=null;window.dispatchEvent(new CustomEvent('estudiemos:account-change',{detail:{user:null}}));});await connect.waitFor();
      assert.ok(!await page.locator('body').textContent().then(text=>text.includes('estudiante@example.test')||text.includes('Qu\u00edmica II')),'Signing out clears private file names and Drive identity from DOM');
      await page.evaluate(owner=>{window.__pilotUser={id:owner,email:'estudiante@example.test'};window.dispatchEvent(new CustomEvent('estudiemos:account-change',{detail:{user:window.__pilotUser}}));},owner);await page.locator('[data-drive-settings]').waitFor();
      await page.locator('[data-drive-settings]').click();await page.locator('[data-drive-disconnect]').click();await connect.waitFor();assert.equal(files.filter(item=>!item.trashed).length,3,'Disconnect preserves files');
      await page.goto(base+'/');await page.waitForLoadState('networkidle');await page.locator(width<500?'[data-home-view="space"]':'[data-drive-library-link]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width===1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'Restoring Mi espacio keeps the desktop board within its viewport');
      await page.screenshot({path:path.join(out,`${engine}-${width}-home.png`)});
      if(width<500)await page.locator('[data-home-view="space"]').click();else await page.locator('[data-drive-library-link]').click();await connect.waitFor();
      enabled=false;await page.reload();await connect.waitFor();assert.equal(await connect.isEnabled(),false,'Missing deployment configuration never fakes a working connection');
      assert.deepEqual(errors,[]);console.log(`PASS ${engine} ${width}: consent handoff, direct upload, folders, rename, move, search, recoverable trash, disconnect, no storage/token leak, light/dark`);
      await context.close();
    }
  }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
