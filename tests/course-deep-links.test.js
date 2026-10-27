const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rules=require('../shared/classrooms'),{verifySigners}=require('../scripts/verify-android-links.cjs');
const associations=require('../.well-known/assetlinks.json'),code='ABCDEFGHJK';

test('only official or same-origin invitation URLs can enroll, with one unambiguous code',()=>{
  for(const url of [
    'https://estudiemos-app.vercel.app/materia/'+code+'?utm_source=whatsapp',
    'https://estudiemos-app.vercel.app/materia/'+code.toLowerCase(),
    'https://app.test/?materia='+code+'#access_token=fixture',
    'https://app.test/?materia='+code+'#materia='+code
  ])assert.equal(rules.invitation(url,'https://app.test'),code,url);
  assert.equal(rules.invitation('http://127.0.0.1:8159/materia/'+code,'http://127.0.0.1:8159'),code);
  for(const url of [
    'javascript:alert(1)', 'https://attacker.test/materia/'+code,
    'https://estudiemos-app.vercel.app.attacker.test/materia/'+code,
    'https://user@estudiemos-app.vercel.app/materia/'+code,
    'http://estudiemos-app.vercel.app/materia/'+code,
    'https://app.test/?materia='+code+'&materia=KLMNPQRSTU',
    'https://app.test/?materia='+code+'&materia=',
    'https://app.test/materia/'+code+'#materia=KLMNPQRSTU'
  ])assert.equal(rules.invitation(url,'https://app.test'),'',url);
});

test('release signature must match the published URL-only domain association',()=>{
  const digest=associations[0].target.sha256_cert_fingerprints[0].replace(/:/g,'').toLowerCase();
  assert.equal(verifySigners('Signer #1 certificate SHA-256 digest: '+digest+'\n',associations),1);
  assert.throws(()=>verifySigners('Signer #1 certificate SHA-256 digest: '+'a'.repeat(64),associations),/does not match/);
  assert.throws(()=>verifySigners('SHA-256 file digest: '+digest,associations),/No APK certificate/);
  assert.throws(()=>verifySigners('Signer #1 public key SHA-256 digest: '+digest,associations),/No APK certificate/);
  assert.throws(()=>verifySigners('Source Stamp Signer certificate SHA-256 digest: '+digest,associations),/No APK certificate/);
  const rotation='Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ';
  assert.equal(verifySigners(rotation+digest+'\nSigner (minSdkVersion=26, maxSdkVersion=32) certificate SHA-256 digest: '+digest,associations),2);
  assert.throws(()=>verifySigners(rotation+'a'.repeat(64),associations),/does not match/);
  assert.throws(()=>verifySigners('Signer #1 certificate SHA-256 digest: '+digest,[{...associations[0],relation:['delegate_permission/common.get_login_creds']}]),/URL-handling/);
  const manifest=fs.readFileSync(require.resolve('../android-app/app/src/main/AndroidManifest.xml'),'utf8');
  assert.match(manifest,/<intent-filter android:autoVerify="true">/);
  assert.match(manifest,/android:host="estudiemos-app.vercel.app" android:pathPrefix="\/materia\/"/);
  const handler=fs.readFileSync(require.resolve('../android-app/app/src/main/java/com/estudiemos/app/MainActivity.java'),'utf8');
  assert.match(handler,/CourseLinks.appUrl/);assert.doesNotMatch(handler,/clearCache\(|removeAllCookies\(/);
  assert.match(handler,/getString\("course_launch_url", ""\)/);assert.match(handler,/!incomingCourse\.equals\(previousCourse\)/);
  assert.match(handler,/outState\.putString\("course_launch_url"/,'Recreation preserves a later screen rather than reopening the original invitation');
  const workflow=fs.readFileSync(require.resolve('../.github/workflows/android-app.yml'),'utf8');
  assert.match(workflow,/build-tools\/35\.0\.0\/apksigner/);assert.doesNotMatch(workflow,/sort -V/);
});

test('PWA protocol launches retain a validated course while existing tool targets still work',()=>{
  const source=fs.readFileSync(require.resolve('../scripts/theme-init.js'),'utf8');
  const fn=source.slice(source.indexOf('  function normalizeAppLaunch()'),source.indexOf('  function getRootPath()'));
  const launch=value=>{const page=new URL('https://app.test/');page.searchParams.set('app_launch',value);let output=page.href;
    vm.runInNewContext(fn+';normalizeAppLaunch();',{URL,window:{location:{href:page.href}},history:{state:{},replaceState:(_state,_title,url)=>{output=new URL(url,page).href;}}});return new URL(output);};
  const url=launch('web+estudiemos://open?materia=abcdefghjk');assert.equal(url.searchParams.get('materia'),code);assert.equal(url.searchParams.get('unirme'),'1');assert.equal(url.searchParams.has('app_launch'),false);
  assert.equal(launch('web+estudiemos://open?target=pomodoro').searchParams.get('pomodoro'),'1');
  assert.equal(launch('web+estudiemos://open?target=agenda&date=2026-10-26').searchParams.get('agenda'),'1');
  for(const value of ['https://other.test/?materia='+code,'web+estudiemos://user@open?materia='+code,'web+estudiemos://open/other?materia='+code,'web+estudiemos://open?materia='+code+'&materia=KLMNPQRSTU'])assert.equal(launch(value).searchParams.has('materia'),false);
});
