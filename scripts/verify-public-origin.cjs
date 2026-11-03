const ORIGIN='https://estudiemos.ar';
const assets=[
  ['/',200,'text/html'],['/mi-espacio',200,'text/html'],['/materias',200,'text/html'],
  ['/styles/app.css?v=origin-check',200,'text/css'],['/styles/dashboard.css',200,'text/css'],
  ['/scripts/theme-init.js',200,'text/javascript'],['/scripts/dashboard.js',200,'text/javascript'],
  ['/scripts/ad-banner.js',200,'text/javascript'],['/scripts/ad-provider.js',200,'text/javascript'],
  ['/shared/ads.js',200,'text/javascript'],['/assets/fonts/space-grotesk-latin.woff2',200,'font/woff2'],
  ['/assets/favicon.svg',200,'image/svg+xml'],['/service-worker.js',200,'text/javascript'],
  ['/site.webmanifest',200,'application/manifest+json'],['/ads.txt',200,'text/plain']
];

async function verify({request=fetch,report=()=>{}}={}){
  for(const pathname of ['/','/styles/app.css?v=origin-check','/ads.txt','/materia/ABCDEFGHJK?unirme=1']){
    const response=await request('http://estudiemos.ar'+pathname,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(![301,307,308].includes(response.status)||response.headers.get('location')!==ORIGIN+pathname)throw new Error('HTTPS_REDIRECT_FAILED: '+pathname);
    await response.body?.cancel();report({path:pathname,check:'HTTP upgrade',status:response.status});
  }
  for(const [pathname,status,type] of assets){
    const response=await request(ORIGIN+pathname,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    const actualType=(response.headers.get('content-type')||'').split(';')[0].trim();
    if(response.status!==status||actualType!==type)throw new Error('ASSET_STATUS_OR_TYPE: '+pathname);
    const body=new Uint8Array(await response.arrayBuffer());
    if(!body.length)throw new Error('EMPTY_ASSET: '+pathname);
    if(pathname==='/'){
      if(!response.headers.get('strict-transport-security')?.includes('max-age='))throw new Error('HSTS_MISSING');
      if(!new TextDecoder().decode(body).includes('name="google-adsense-account" content="ca-pub-9605920128105982"'))throw new Error('ADSENSE_OWNERSHIP_MISSING');
    }
    if(pathname==='/ads.txt'&&new TextDecoder().decode(body).trim()!=='google.com, pub-9605920128105982, DIRECT, f08c47fec0942fa0')throw new Error('ADS_TXT_INVALID');
    report({path:pathname,check:'HTTPS asset',status:response.status,type:actualType,bytes:body.length});
  }
}

if(require.main===module)verify({report:item=>console.log(JSON.stringify(item))}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verify,assets,ORIGIN};
