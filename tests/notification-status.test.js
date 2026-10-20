const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/pomodoro.js'),'utf8');
const status=source.slice(source.indexOf('  function requestAndroidNotificationStatus()'),source.indexOf('  async function showDeviceNotification('));
function fixture({native=true,permission='default',alert='unknown',browser='default'}={}){
  const sent=[],indicator={hidden:false,dataset:{},setAttribute(key,value){this[key]=value;}},row={dataset:{}},button={};
  const notification={permission:browser};
  const context={androidNotificationPermission:permission,androidAlertPermission:alert,
    Notification:notification,navigator:{serviceWorker:{}},
    window:{Notification:notification},document:{querySelector:selector=>selector==='[data-streak-notification-enable]'?indicator:selector==='[data-pomodoro-device-alerts-row]'?row:selector==='[data-pomodoro-device-alerts]'?button:null}};
  if(native)context.window.EstudiemosAndroid={postMessage:value=>sent.push(JSON.parse(value))};
  vm.createContext(context);vm.runInContext(status,context);
  return {context,indicator,row,button,sent,notification};
}
test('enabled Inbox notifications hide the warning even when streak reminders remain off',()=>{
  const h=fixture({permission:'default',alert:'granted'});
  h.context.renderNotificationAlert();h.context.renderDeviceAlerts();
  assert.equal(h.indicator.hidden,true);
  assert.equal(h.row.dataset.status,'default','hiding the warning does not enable streak reminders');
  assert.equal(h.button.disabled,false);
});
test('the latest explicit Android permission wins, not an older status from another feature',()=>{
  const h=fixture();
  for(const permission of ['granted','denied','granted']){
    h.context.updateAndroidNotificationAlert(permission);
    assert.equal(h.indicator.hidden,permission==='granted');
    assert.equal(h.indicator.dataset.permission,permission);
  }
  assert.equal(h.sent.length,0,'updating the icon never enables or schedules notifications');
});
test('a disabled optional reminder does not overwrite confirmed system permission',()=>{
  const h=fixture({alert:'granted'});
  for(const permission of ['default','unknown',undefined,'unexpected'])h.context.updateAndroidNotificationAlert(permission);
  assert.equal(h.indicator.hidden,true);assert.equal(h.indicator.dataset.permission,'granted');
});
test('a fresh app reads both native statuses without asking for permissions or enabling reminders',()=>{
  const h=fixture();
  h.context.refreshDeviceNotificationStatus();
  assert.deepEqual(h.sent.map(value=>value.type),['pomodoro-notification-status','inbox-notifications-status']);
  assert.equal(h.indicator.hidden,false,'unknown permission does not pretend to be enabled');
});
test('browser status uses the actual Notification permission, never the native cache',()=>{
  const h=fixture({native:false,alert:'granted'});
  for(const permission of ['default','granted','denied']){
    h.notification.permission=permission;h.context.refreshDeviceNotificationStatus();
    assert.equal(h.indicator.hidden,permission==='granted');
  }
  assert.equal(h.sent.length,0);
});
test('permission status listeners refresh the indicator on resume and on mobile activation',()=>{
  assert.match(source,/window\.addEventListener\("estudiemos-android-inbox-status"/);
  assert.match(source,/window\.addEventListener\("pageshow", refreshDeviceNotificationStatus\)/);
  assert.match(source,/window\.addEventListener\("estudiemos:mobile-notifications", renderNotificationAlert\)/);
});
