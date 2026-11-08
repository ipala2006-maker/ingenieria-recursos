const test=require('node:test'),assert=require('node:assert/strict');
const {verify,assets,ORIGIN}=require('../scripts/verify-public-origin.cjs');

function fixture(patch=()=>null){
  return async(input,options)=>{
    const override=patch(input);if(override)return override;
    const url=new URL(input);
    assert.equal(options.redirect,'manual');assert.ok(options.signal);
    if(url.protocol==='http:')return new Response(null,{status:301,headers:{Location:ORIGIN+url.pathname+url.search}});
    assert.equal(url.origin,ORIGIN);
    const descriptor=assets.find(([pathname])=>pathname===url.pathname+url.search);
    assert.ok(descriptor,input);
    const body=url.pathname==='/ads.txt'?'google.com, pub-9605920128105982, DIRECT, f08c47fec0942fa0':url.pathname==='/'?'<meta name="google-adsense-account" content="ca-pub-9605920128105982" />':'fixture';
    return new Response(body,{headers:{'Content-Type':descriptor[2]+'; charset=utf-8','Strict-Transport-Security':'max-age=63072000','Cache-Control':'public, max-age=0, must-revalidate'}});
  };
}
test('public-origin check verifies HTTPS upgrade, MIME types, nonempty assets, HSTS and publisher identity',async()=>{
  const reports=[];await verify({request:fixture(),report:item=>reports.push(item)});
  assert.equal(reports.length,assets.length+4);
});
test('plain HTTP, wrong-domain redirects and missing files cannot pass the origin check',async()=>{
  for(const response of [new Response('plain HTML'),new Response(null,{status:301,headers:{Location:'https://example.org/'}})]){
    await assert.rejects(verify({request:fixture(url=>url.startsWith('http:')?response:null)}),/HTTPS_REDIRECT_FAILED/);
  }
  await assert.rejects(verify({request:fixture(url=>url.endsWith('/scripts/dashboard.js')?new Response('not found',{status:404}):null)}),/ASSET_STATUS_OR_TYPE/);
  await assert.rejects(verify({request:fixture(url=>url.endsWith('/scripts/vendor/driver/driver.js.mjs')?new Response('not found',{status:404}):null)}),/ASSET_STATUS_OR_TYPE/);
});

test('the production check catches a service worker with a stale browser cache policy',async()=>{
  await assert.rejects(verify({request:fixture(url=>url.endsWith('/service-worker.js')?new Response('fixture',{headers:{
    'Content-Type':'text/javascript','Cache-Control':'public, max-age=31536000, immutable'
  }}):null)}),/CACHE_REVALIDATION_MISSING/);
});
test('HTML fallback for CSS, empty assets and invalid ads.txt fail explicitly',async()=>{
  for(const [route,response,reason] of [
    ['/styles/dashboard.css',new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}}),/ASSET_STATUS_OR_TYPE/],
    ['/scripts/dashboard.js',new Response('',{headers:{'Content-Type':'text/javascript'}}),/EMPTY_ASSET/],
    ['/ads.txt',new Response('wrong publisher',{headers:{'Content-Type':'text/plain'}}),/ADS_TXT_INVALID/]
  ])await assert.rejects(verify({request:fixture(url=>url===ORIGIN+route?response:null)}),reason);
});
