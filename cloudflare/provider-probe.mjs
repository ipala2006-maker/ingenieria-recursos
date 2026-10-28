import {timingSafeEqual} from 'node:crypto';
import {preparePush} from './push.mjs';

const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const response=(value,status=200,type='application/json')=>new Response(type==='application/json'?JSON.stringify(value):value,{status,headers:{...headers,'Content-Type':type+'; charset=utf-8'}});
const page=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba de entrega | Estudiemos</title><link rel="stylesheet" href="/probe.css"><main><p>Estudiemos · Entorno aislado</p><h1>Prueba de notificación</h1><p>Solo este navegador. No usa tareas, cuentas ni alarmas de producción.</p><button id="send" disabled>Permitir y enviar una prueba</button><p id="status" role="status">Preparando prueba…</p><button id="finish" disabled>Finalizar y quitar el permiso de envío</button></main><script src="/client.js"></script></html>`;
const client=`let token=location.hash.slice(1);history.replaceState(null,'',location.pathname);let registration,expected='',received='';const status=document.querySelector('#status'),send=document.querySelector('#send'),finish=document.querySelector('#finish');
function report(){if(expected&&received===expected){status.textContent='Recibida desde el proveedor por el Service Worker. La notificación del sistema fue solicitada correctamente.';status.dataset.delivery='received';}}
navigator.serviceWorker.addEventListener('message',event=>{if(event.source===registration?.active&&event.data?.type==='probe-received'){received=event.data.nonce;report();}});
(async()=>{if(!/^[a-f0-9]{64}$/.test(token))throw Error('Abrí esta prueba desde el asistente local.');const config=await fetch('/config').then(r=>r.json());registration=await navigator.serviceWorker.register('/sw.js');registration=await navigator.serviceWorker.ready;send.disabled=false;status.textContent='Se enviará un único aviso real, sin datos personales.';send.onclick=async()=>{send.disabled=true;try{if(await Notification.requestPermission()!=='granted')throw Error('El navegador no autorizó las notificaciones.');const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});finish.disabled=false;status.textContent='Enviando al proveedor…';const result=await fetch('/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(subscription)}).then(r=>r.json());if(!result.accepted)throw Error('El proveedor rechazó la prueba (HTTP '+result.status+').');expected=result.nonce;status.textContent='Proveedor aceptó el envío (HTTP '+result.status+'). Esperando recepción real…';status.dataset.delivery='accepted';report();}catch(error){status.textContent=error.message;status.dataset.delivery='failed';}};finish.onclick=async()=>{const sub=await registration.pushManager.getSubscription();if(sub)await sub.unsubscribe();await registration.unregister();token='';send.disabled=true;finish.disabled=true;status.textContent='Prueba finalizada. Suscripción de prueba eliminada; producción intacta.';status.dataset.cleaned='true';};})().catch(error=>{status.textContent=error.message;status.dataset.delivery='unavailable';});`;
const worker=`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('push',event=>{event.waitUntil((async()=>{const data=event.data.json();await self.registration.showNotification(data.title,{body:data.body,tag:'estudiemos-provider-probe'});for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'probe-received',nonce:data.probeReceipt});})());});`;
const css=':root{color-scheme:dark;font:16px/1.6 system-ui;background:#101722;color:#ecf1fa}main{max-width:640px;margin:10vh auto;padding:24px}h1{font-size:28px}p{color:#bcc9da}button{min-height:44px;border:1px solid #59718f;border-radius:6px;padding:10px 16px;background:#213149;color:#ecf1fa;font:inherit;cursor:pointer}button:disabled{opacity:.5}#finish{margin-top:24px;background:transparent}';

export default {async fetch(request,env){
  const expires=Number(env.PROBE_EXPIRES_AT);
  if(env.PROBE_ENABLED!=='true'||!Number.isFinite(expires)||Date.now()>=expires)return response({enabled:false},410);
  const url=new URL(request.url);
  if(request.method==='GET'){
    if(url.pathname==='/')return response(page,200,'text/html');
    if(url.pathname==='/client.js')return response(client,200,'text/javascript');
    if(url.pathname==='/sw.js')return response(worker,200,'text/javascript');
    if(url.pathname==='/probe.css')return response(css,200,'text/css');
    if(url.pathname==='/config')return response({publicKey:env.PROBE_VAPID_PUBLIC_KEY});
  }
  if(request.method!=='POST'||url.pathname!=='/send')return response({},404);
  const token=String(request.headers.get('authorization')||'').replace(/^Bearer /,''),secret=env.PROBE_TOKEN||'';
  if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(secret)||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return response({},401);
  if(request.headers.get('origin')!==url.origin)return response({},403);
  const reader=request.body?.getReader();if(!reader)return response({},400);
  let bytes=0,chunks=[];
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return response({},413);}chunks.push(value);}
    const sub=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const details=await preparePush(sub,{title:'Estudiemos: prueba de Workers',body:'Aviso de prueba, sin datos de tu cuenta.',probeReceipt:env.PROBE_RECEIPT_NONCE},
      {subject:url.origin,publicKey:env.PROBE_VAPID_PUBLIC_KEY,privateKey:env.PROBE_VAPID_PRIVATE_KEY});
    const result=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(10000)});
    try{await result.body?.cancel();}catch{}
    console.log(JSON.stringify({event:'provider_probe',accepted:result.ok,status:result.status}));
    return response({accepted:result.ok,status:result.status,...(result.ok?{nonce:env.PROBE_RECEIPT_NONCE}:{})});
  }catch{return response({accepted:false,status:503},503);}
}};
