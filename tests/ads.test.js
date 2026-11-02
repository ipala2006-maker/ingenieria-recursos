const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ads=require('../shared/ads'),release=require('../shared/release');
const now=Date.parse('2026-11-02T12:00:00Z');
const user=access=>({id:'pilot',app_metadata:{estudiemos:access}});
test('AdSense is configured only for the public custom domain with bottom non-expanding anchors',()=>{
  assert.equal(release.enabled('ads'),true);
  const provider=fs.readFileSync(path.join(__dirname,'../scripts/ad-provider.js'),'utf8');
  assert.match(provider,/export const configured=true/);
  assert.match(provider,/origin==='https:\/\/estudiemos\.ar'/);
  assert.match(provider,/data-overlays','collapsed-bottom'/);
  assert.match(provider,/script\.async=true;script\.crossOrigin='anonymous'/);
  assert.doesNotMatch(provider,/createElement\('iframe'\)|data-ad-slot|adsbygoogle\.push/);
  assert.equal(fs.readFileSync(path.join(__dirname,'../ads.txt'),'utf8').trim(),'google.com, pub-9605920128105982, DIRECT, f08c47fec0942fa0');
  for(const page of ['index.html','mi-espacio.html','materias.html']){
    const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
    assert.match(html,/type="module" src="\.\/scripts\/ad-banner.js/);
    assert.match(html,/<meta name="google-adsense-account" content="ca-pub-9605920128105982"\s*\/?>/);
  }
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
