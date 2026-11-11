const { chromium, webkit } = require('../tmp/ui-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../dist-cloudflare');
const origin = 'https://estudiemos.ar';
const otp = 'ab'.repeat(32);
const base = origin + '/widget.html?embed=rainmeter&view=';
const output = path.join(__dirname, '../tmp/classrooms');
const engine = process.env.TEST_WEBKIT ? 'webkit' : 'chromium';

(async () => {
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({channel:'chrome'});
  try {
    for (const mode of ['unlinked', 'expired', 'success']) {
      const context = await browser.newContext({ viewport:{width:260,height:210}, reducedMotion:'reduce' });
      await context.addInitScript(({mode,otp}) => {
        const user = {id:'widget-fixture',email:'fixture@example.test'};
        const session = {user,access_token:'test-only'};
        const items=[{id:'long-task',title:'Repasar la guía de ecuaciones diferenciales y preparar el resumen para el parcial del jueves',type:'Tarea',done:false,createdAt:1}];
        const query = {select(){return this;},eq(){return this;},neq(){return this;},
          maybeSingle:async()=>({data:{state:{values:{bandeja_agenda:items}},updated_at:'2026-11-11T00:00:00Z'}}),upsert:async()=>({error:null})};
        let active = null;
        localStorage.setItem('estudiemos_cloud_user',user.id);
        localStorage.setItem('bandeja_agenda',JSON.stringify(items));
        window.RainmeterAPI={Bang: command => {window.__widgetCommand=command;}};
        window.supabase={createClient:()=>({
          auth:{
            verifyOtp: async value => {
              window.__widgetVerified=value;
              window.__cleanDuringVerify=!location.hash;
              if(value.token_hash!==otp||mode==='expired')return {error:{code:'otp_expired'}};
              active=session;return {data:{session}};
            },
            getSession: async () => ({data:{session:active}}),
            onAuthStateChange(){}
          },
          from:()=>query,rpc:async()=>({error:{code:'PGRST202'}}),
          channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}
        })};
      },{mode,otp});
      await context.route('**/*',route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/api/account-config' && !url.search) {
          return route.fulfill({json:{enabled:true,url:'https://fixture.supabase.co',publishableKey:'test-only'}});
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({json:{}});
        const file = path.resolve(root,'.'+url.pathname);
        if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.fulfill({status:404});
        return route.fulfill({path:file});
      });
      const page = await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'inbox'+(mode==='unlinked'?'':'&linked=1#widget_otp='+otp));
      if (mode === 'success') {
        const title=page.locator('.task-row strong');
        await title.waitFor({timeout:8000}).catch(async error=>{
          throw new Error(`${error.message}\n${await page.locator('#widgetContent').innerText()}\n${errors.join('\n')}`);
        });
        assert.ok(await title.evaluate(node=>node.getBoundingClientRect().height>32),'long Inbox title wraps without clipping');
        const redeemed=await page.evaluate(()=>({verified:window.__widgetVerified,clean:window.__cleanDuringVerify}));
        assert.deepEqual(redeemed,{verified:{token_hash:otp,type:'email'},clean:true});
        assert.equal(await page.locator('[data-widget-reconnect]').count(),0);
      } else {
        const reconnect=page.getByRole('button',{name:'Conectar desde Estudiemos'});
        await reconnect.waitFor();
        assert.equal(await page.locator('.task-row').count(),0,'no private data appears before a verified link');
        if(mode==='expired')await page.getByText('No se pudo vincular el widget.').waitFor();
        await reconnect.click();
        assert.equal(await page.evaluate(()=>window.__widgetCommand),'["https://estudiemos.ar/?windows-widgets-ready=1&setup-widget=inbox"]');
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(output,`windows-widget-${engine}-${mode}.png`)});
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log(`${engine}: widget linkage, recovery and compact inbox passed.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
