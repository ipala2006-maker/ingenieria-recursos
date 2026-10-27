const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../scripts/course-invitation.js'),'utf8');
function boot(local=new Map(),session=new Map()){const wrap=values=>({getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}),window={localStorage:wrap(local),sessionStorage:wrap(session)};vm.runInNewContext(source,{window,URL,Date,document:{readyState:'loading',currentScript:{src:'https://app.test/scripts/course-invitation.js'},addEventListener(){}}});return {api:window.EstudiemosCourseInvitation,window,local,session};}
test('pending course invitations survive a restart, expire, and stay bound to their intended account',()=>{
  const h=boot();h.api.save('ABCDEFGHJK','alice',{title:'Shared class',calendar:[]});h.session.clear();assert.equal(h.api.pending('alice').preview.title,'Shared class');assert.equal(h.api.pending('bob'),null);assert.equal(h.api.pending(),null);h.api.clear();assert.equal(h.local.size,0);
  h.api.save('BAD');assert.equal(h.api.pending(),null);h.api.save('ABCDEFGHJK');assert.equal(h.api.pending('alice').auto,true);
  const key='estudiemos_class_invite_v1';for(const map of[h.local,h.session]){const value=JSON.parse(map.get(key));value.expires=1;map.set(key,JSON.stringify(value));}assert.equal(boot(h.local,h.session).api.pending('alice'),null);
});
test('the continue link preserves the code on the same app origin and never silently installs software',()=>{const h=boot(),url=h.api.appUrl('ABCDEFGHJK');assert.equal(url.origin,'https://app.test');assert.equal(url.searchParams.get('unirme'),'1');assert.equal(url.hash,'#materia=ABCDEFGHJK');assert.doesNotMatch(source,/\.download\s*\(|requestPermission\s*\(/);});

test('confirmation emails carry the invitation in the query without conflicting with the auth hash',()=>{
  const h=boot(),rules=require('../shared/classrooms');h.api.save('ABCDEFGHJK');
  const url=h.api.confirmationUrl('https://app.test/');assert.equal(url.searchParams.get('unirme'),'1');
  url.hash='access_token=fixture&refresh_token=fixture&type=signup';
  assert.equal(rules.invitation(url.href,'https://app.test'),'ABCDEFGHJK');
  assert.equal(h.api.confirmationUrl('https://other.test/').href,'https://app.test/');
  h.api.save('ABCDEFGHJK','alice');assert.equal(h.api.confirmationUrl('https://app.test/').search,'');
  h.window.EstudiemosAccount={getUser:()=>({id:'alice'})};assert.equal(h.api.confirmationUrl('https://app.test/').searchParams.get('materia'),'ABCDEFGHJK');
  h.window.EstudiemosAccount={getUser:()=>({id:'bob'})};assert.equal(h.api.confirmationUrl('https://app.test/').search,'');
});

test('canonical links contain only the validated course code',()=>{
  const h=boot();assert.equal(h.api.canonicalUrl('ABCDEFGHJK').href,'https://app.test/materia/ABCDEFGHJK');
  for(const value of ['BAD','https://other.test','ABCDEFGHJK?access_token=secret']){
    assert.equal(h.api.appUrl(value).href,'https://app.test/');assert.equal(h.api.canonicalUrl(value).href,'https://app.test/');
  }
});
