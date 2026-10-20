const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),owner='11111111-1111-4111-8111-111111111111';
const folder='drive-root-folder',mime='application/vnd.google-apps.folder';
const headers=require('../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers;
(async()=>{
  let browser,releaseList;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      for(const {key,value} of headers)res.setHeader(key,key==='Content-Security-Policy'?value.replace(/;\s*upgrade-insecure-requests/,''):value);
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
      res.end(fs.readFileSync(file));
    }catch(_){res.writeHead(404).end();}
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'chrome'});
    const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    let connected=true,holdList=false;
    const requests=[],files=[{id:folder,name:'Estudiemos',mimeType:mime,parents:['root']},{id:'folder-other',name:'Apuntes',mimeType:mime,parents:['root']},{id:'child-file',name:'Guia.pdf',mimeType:'application/pdf',parents:['folder-other'],size:'3000'}];
    await context.addInitScript(({owner})=>{
      window.__user={id:owner};
      window.EstudiemosAccount={getUser:()=>window.__user,getSession:()=>window.__user?{access_token:'fixture-session'}:null,getClient:()=>null,whenReady:async()=>({session:{user:window.__user}}),isSynchronized:()=>true};
      window.__bridge=[];
      window.EstudiemosAndroid={postMessage:value=>window.__bridge.push(JSON.parse(value))};
    },{owner});
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());requests.push(url.href);
      if(url.origin===base){
        if(!url.pathname.startsWith('/api/'))return route.continue();
        const action=url.searchParams.get('drive');
        if(action==='config')return route.fulfill({json:{enabled:true,browseEnabled:true}});
        if(action==='status')return route.fulfill({json:{connected,browse:true}});
        if(action==='token')return route.fulfill({json:{accessToken:'fixture-google-secret',expiresAt:Date.now()+3600000}});
        if(action==='disconnect'){connected=false;return route.fulfill({json:{connected:false}});}
        return route.fulfill({json:{enabled:false}});
      }
      if(url.origin!=='https://www.googleapis.com')return route.abort();
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      if(url.pathname.endsWith('/about'))return route.fulfill({json:{user:{emailAddress:'private@example.test'}}});
      const fileId=url.pathname.split('/')[4];
      if(fileId)return route.fulfill({json:files.find(item=>item.id===fileId)||{}});
      const q=url.searchParams.get('q')||'';
      if(q.includes('estudiemosRoot'))return route.fulfill({json:{files:[files[0]]}});
      if(holdList){holdList=false;await new Promise(resolve=>{releaseList=resolve;});}
      const parent=/'([A-Za-z0-9_-]+)' in parents/.exec(q)?.[1];
      let visible=files.filter(item=>item.parents.includes(parent));
      if(q.includes("name contains"))visible=visible.filter(item=>item.name==='Guia.pdf');
      return route.fulfill({json:{files:visible}});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const snapshots=()=>page.evaluate(()=>window.__bridge.filter(item=>item.type==='drive-workspace-sync'));
    await page.goto(base+'/mi-espacio.html');
    await page.locator('[data-workspace-open="folder-other"]').waitFor();
    assert.equal((await snapshots()).length,0,'Old APK does not receive unsupported Drive messages');
    await page.evaluate(()=>{
      const android=document.createElement('button');android.dataset.accountWidget='workspace';document.body.append(android);
      const windows=document.createElement('button');windows.dataset.accountDesktopWidget='workspace';document.body.append(windows);
    });
    await page.waitForFunction(()=>document.querySelector('[data-account-widget="workspace"]').hasAttribute('data-release-unavailable'));
    await page.evaluate(()=>{window.EstudiemosAndroidDriveWidget=true;window.dispatchEvent(new CustomEvent('estudiemos-android-ready'));});
    await page.waitForFunction(()=>window.__bridge.some(item=>item.type==='drive-workspace-sync'&&item.items.length===2));
    assert.equal(await page.locator('[data-account-widget="workspace"]').getAttribute('data-release-unavailable'),null);
    assert.notEqual(await page.locator('[data-account-desktop-widget="workspace"]').getAttribute('data-release-unavailable'),null);
    const first=(await snapshots()).at(-1);
    assert.equal(first.owner,owner);assert.equal(first.location,'unit');
    assert.ok(!JSON.stringify(first).includes('secret')&&!JSON.stringify(first).includes('private@example.test'));
    let count=(await snapshots()).length;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-widget-account-ready')));
    assert.equal((await snapshots()).length,count+1,'Native session acknowledgement resends metadata');
    await page.locator('[data-workspace-open="folder-other"]').click();
    await page.locator('[data-workspace-open="child-file"]').waitFor();
    count=(await snapshots()).length;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-widget-account-ready')));
    assert.equal((await snapshots()).length,count,'Nested folders never replace the root preview');
    holdList=true;
    await page.locator('[data-workspace-folder="root"]').click();
    const rootDeadline=Date.now()+5000;
    while(!releaseList&&Date.now()<rootDeadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(releaseList,'Root navigation starts a bounded Drive request');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('estudiemos-android-widget-account-ready')));
    assert.equal((await snapshots()).length,count,'Changing directory cannot mislabel old child entries as a root preview');
    releaseList();releaseList=null;
    await page.locator('[data-workspace-open="folder-other"]').waitFor();
    count=(await snapshots()).length;
    await page.locator('[data-workspace-search]').fill('Guia');
    await page.waitForTimeout(450);
    assert.equal((await snapshots()).length,count,'Search results never replace the root preview');
    await page.locator('[data-workspace-search]').fill('');
    await page.locator('[data-workspace-open="folder-other"]').waitFor();
    await page.locator('[data-drive-settings]').click();await page.locator('[data-drive-disconnect]').click();
    await page.locator('[data-drive-connect]').waitFor();
    assert.deepEqual((await snapshots()).at(-1).items,[]);
    assert.equal((await snapshots()).at(-1).connected,false);
    connected=true;
    await page.reload();await page.locator('[data-workspace-open="folder-other"]').waitFor();
    await page.evaluate(()=>{window.EstudiemosAndroidDriveWidget=true;window.dispatchEvent(new CustomEvent('estudiemos-android-ready'));});
    count=(await snapshots()).length;holdList=true;
    await page.locator('[data-drive-refresh]').click();
    const deadline=Date.now()+5000;
    while(!releaseList&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(releaseList,'Refresh starts a bounded Drive request');
    await page.evaluate(()=>{window.__user=null;window.dispatchEvent(new CustomEvent('estudiemos:account-change'));});
    releaseList();releaseList=null;
    await page.locator('[data-drive-connect]').waitFor();
    await page.waitForTimeout(150);
    assert.equal((await snapshots()).length,count,'Late response from a signed-out account cannot republish private metadata');
    assert.ok(!await page.locator('body').textContent().then(text=>text.includes('Apuntes')));
    assert.ok(!requests.some(url=>url.includes('workspace_items')||url.includes('/storage/v1/')));
    assert.deepEqual(errors,[]);
    console.log('PASS Android Drive bridge: old/new APK gating, root preview, account acknowledgement, no credentials, search/folder safety, disconnect and stale response');
    await context.close();
  }finally{
    releaseList?.();await browser?.close();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
