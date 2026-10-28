const crypto=require('node:crypto'),http=require('node:http'),{execFileSync}=require('node:child_process'),webpush=require('web-push');
const root=require('node:path').resolve(__dirname,'..'),url='https://estudiemos-provider-probe.estudiemos-services.workers.dev';
function wrangler(args,input){return execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--config','wrangler.provider.jsonc'],{cwd:root,input,windowsHide:true,stdio:['pipe','pipe','pipe']});}
try{
  const token=crypto.randomBytes(32).toString('hex'),vapid=webpush.generateVAPIDKeys();
  wrangler(['deploy']);
  wrangler(['secret','bulk'],JSON.stringify({PROBE_TOKEN:token,PROBE_VAPID_PUBLIC_KEY:vapid.publicKey,PROBE_VAPID_PRIVATE_KEY:vapid.privateKey,PROBE_RECEIPT_NONCE:crypto.randomBytes(24).toString('hex')}));
  wrangler(['deploy','--var','PROBE_ENABLED:true','--var','PROBE_EXPIRES_AT:'+String(Date.now()+3600000)]);
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    if(req.headers.host!=='127.0.0.1:8192')return res.writeHead(403).end();
    const sameOrigin=req.headers.origin==='http://127.0.0.1:8192'||req.headers['sec-fetch-site']==='same-origin';
    if(req.method==='POST'&&req.url==='/start'&&sameOrigin){res.writeHead(303,{Location:url+'/#'+token});return res.end();}
    if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba aislada de Estudiemos</title><h1>Prueba de entrega desde Workers</h1><p>Sin cuentas ni tareas reales. La autorización de prueba vence en una hora.</p><form method="post" action="/start"><button>Abrir prueba de notificación</button></form></html>');}
    res.writeHead(404).end();
  });
  server.listen(8192,'127.0.0.1',()=>console.log(JSON.stringify({localAssistant:'http://127.0.0.1:8192',productionChanged:false,expiresInMinutes:60})));
  const close=()=>server.close(()=>process.exit());process.on('SIGINT',close);process.on('SIGTERM',close);
  setTimeout(close,3600000).unref();
}catch(error){console.error(JSON.stringify({stage:'provider-probe-unavailable',type:error.name,commandStatus:error.status}));process.exitCode=1;}
