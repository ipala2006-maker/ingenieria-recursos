const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ads=require('../shared/ads'),release=require('../shared/release');
const now=Date.parse('2026-11-02T12:00:00Z');
const user=access=>({id:'pilot',app_metadata:{estudiemos:access}});
test('ads remain off in the public pilot and no provider is configured',()=>{
  assert.equal(release.enabled('ads'),false);
  assert.match(fs.readFileSync(path.join(__dirname,'../scripts/ad-provider.js'),'utf8'),/export const configured=false/);
  for(const page of ['index.html','mi-espacio.html','materias.html'])assert.match(fs.readFileSync(path.join(__dirname,'..',page),'utf8'),/type="module" src="\.\/scripts\/ad-banner.js/);
});
test('active Pro and No Ads use only server-managed metadata and honor expiration',()=>{
  for(const access of [{status:'active',planId:'pro'},{status:'active',noAds:true},{status:'active',planId:'pro',currentPeriodEnd:'2026-12-01T00:00:00Z'}])assert.equal(ads.adFree(user(access),now),true);
  for(const access of [null,{planId:'pro'},{status:'test',planId:'pro'},{status:'cancelled',noAds:true},{status:'past_due',planId:'pro'},{status:'active',planId:'initial'},{status:'active',noAds:'true'},{status:'active',noAds:true,currentPeriodEnd:'bad'},{status:'active',noAds:true,currentPeriodEnd:'2026-11-02T12:00:00Z'}])assert.equal(ads.adFree(user(access),now),false);
  assert.equal(ads.adFree({id:'pilot',is_pro:true,user_metadata:{estudiemos:{status:'active',noAds:true}}},now),false,'editable user data is not a subscription');
});
test('unknown accounts, consent denial and unintegrated native WebViews never render an ad',()=>{
  const base={enabled:true,user:user({status:'active',planId:'initial'}),consent:'granted',now};
  assert.equal(ads.eligible(base),true);
  for(const patch of [{enabled:false},{user:null},{user:{id:''}},{consent:'unknown'},{consent:'denied'},{nativeWebView:true},{user:user({status:'active',planId:'pro'})}])assert.equal(ads.eligible({...base,...patch}),false);
});
test('ad controller does not query servers, poll, count impressions or receive profile data in the adapter',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/ad-banner.js'),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|\bsetInterval\s*\(|localStorage|\.rpc\s*\(/);
  assert.match(source,/provider.mount\(\{slot,signal:abort.signal\}\)/);
  assert.match(source,/requestIdleCallback/);assert.match(source,/result\?\.destroy\(\)/);
});
