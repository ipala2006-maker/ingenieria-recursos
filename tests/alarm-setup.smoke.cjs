const {chromium}=require('../tmp/ui-check/node_modules/playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8149/';
(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
    const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>{
      window.nativeLinks=[];window.notificationRequests=0;
      window.EstudiemosAccount={whenReady:async()=>{},getClient:()=>null,getUser:()=>({id:'pilot'}),getSession:()=>({access_token:'test-session'}),sync:()=>{}};
      document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.href.startsWith('estudiemos-alarms:')){e.preventDefault();window.nativeLinks.push(a.href);}},true);
      if(window.Notification)Notification.requestPermission=async()=>{window.notificationRequests++;return 'denied';};
    });
    await page.route('**/api/**',route=>{
      const req=route.request(),body=req.postDataJSON();
      if(body?.action==='alarms-connect'){calls.push(body);return route.fulfill({json:{token:'pilot.signature'}});}
      if(body?.action==='alarms-confirm'){calls.push(body);return route.fulfill({json:{connected:true,userId:'pilot',version:'1.6.1',expiresAt:Math.floor(Date.now()/1000)+3600}});}
      return route.fulfill({json:{enabled:false}});
    });
    await page.goto(new URL('?alarms-setup=1',base).href,{waitUntil:'networkidle'});
    const dialog=page.locator('.alarm-setup');assert.ok(await dialog.isVisible());
    assert.match(await dialog.locator('a[download]').getAttribute('href'),/downloads\/Activar-Alarmas-Estudiemos\.exe$/);
    assert.ok(await dialog.locator('[data-alarm-native-test]').isDisabled());
    await dialog.locator('[data-alarm-activate]').click();
    await page.waitForFunction(()=>window.nativeLinks.length===1);
    assert.deepEqual(await page.evaluate(()=>nativeLinks),['estudiemos-alarms://connect?link=pilot.signature']);
    assert.ok(await dialog.locator('[data-alarm-native-test]').isDisabled(),'opening a protocol is not installation proof');
    assert.match(await dialog.locator('[data-alarm-native-status]').textContent(),/Todavía no confirmamos/);
    assert.equal(await page.evaluate(()=>localStorage.getItem('estudiemos_windows_alarm_connection')),null);
    await page.goto(new URL('?windows-alarms-ready=receipt',base).href,{waitUntil:'networkidle'});
    assert.equal(await dialog.getAttribute('data-ready'),'true');
    await dialog.locator('[data-alarm-native-test]').click();
    assert.deepEqual(await page.evaluate(()=>nativeLinks),['estudiemos-alarms://test']);
    assert.equal(await page.evaluate(()=>notificationRequests),0);
    assert.equal(calls.length,2);assert.equal(calls[0].consent,true);assert.equal(calls[1].proof,'receipt');
    await page.screenshot({path:'tmp/ui-check/alarm-setup-ready.png'});
    await page.evaluate(()=>{
      window.savedSession=window.EstudiemosAccount.getSession;
      window.EstudiemosAccount.getSession=()=>null;
      window.EstudiemosAccount.open=()=>{window.signInOpened=true;};
      localStorage.removeItem('estudiemos_windows_alarm_connection');
      window.EstudiemosInboxAlarms.showSetup();
    });
    await dialog.locator('[data-alarm-activate]').click();
    assert.equal(await dialog.isVisible(),false,'setup must not block the sign-in interface');
    assert.ok(await page.evaluate(()=>window.signInOpened));
    await page.evaluate(()=>{window.EstudiemosAccount.getSession=window.savedSession;window.dispatchEvent(new Event('estudiemos:account-change'));});
    assert.ok(await dialog.isVisible(),'resume setup after sign-in');
    assert.deepEqual(errors,[]);console.log('PASS setup, explicit consent, verified receipt and native test action (protocol mocked)');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
