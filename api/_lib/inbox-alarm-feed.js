const crypto = require('node:crypto');
const {adminRequest,authenticateBearer} = require('./supabase-admin');
const {isSameOriginRequest,requireJsonRequest} = require('./request-security');
const rules = require('../../shared/inbox-alarms');
const seconds = () => Math.floor(Date.now()/1000);
const secret = () => {
  if(!process.env.SUPABASE_SECRET_KEY)throw new Error('Alarm connection is not configured');
  return `${process.env.SUPABASE_SECRET_KEY}:inbox-alarm-feed:v1`;
};
function sign(sub,scope,lifetime,extra={}) {
  const body=Buffer.from(JSON.stringify({sub,scope,exp:seconds()+lifetime,...extra})).toString('base64url');
  return `${body}.${crypto.createHmac('sha256',secret()).update(body).digest('base64url')}`;
}
function verify(token,scope) {
  if(typeof token!=='string'||token.length>2048)return null;
  const [body,sig,extra]=token.split('.');if(!body||!sig||extra)return null;
  const expected=crypto.createHmac('sha256',secret()).update(body).digest();
  const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  try{const data=JSON.parse(Buffer.from(body,'base64url').toString());
    return data.scope===scope && typeof data.sub==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.sub) && Number.isSafeInteger(data.exp) && data.exp>seconds()?data:null;
  }catch(_){return null;}
}
async function snapshot(userId) {
  const rows=await adminRequest(`/rest/v1/user_states?user_id=eq.${encodeURIComponent(userId)}&select=state,updated_at&limit=1`);
  let items=rows?.[0]?.state?.values?.bandeja_agenda || [];
  if(typeof items==='string'){try{items=JSON.parse(items);}catch(_){items=[];}}
  return {version:1,updatedAt:rows?.[0]?.updated_at || null,items:(Array.isArray(items)?items:[]).slice(0,500).flatMap(item=>{
    const alarm=rules.normalize(item?.alarm);
    if(!alarm?.windows||item.done||typeof item.id!=='string')return [];
    return [{id:item.id.slice(0,180),title:String(item.title||'Tarea pendiente').slice(0,90),alarm}];
  })};
}
module.exports = async function alarmFeed(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST'].includes(request.method)){
    response.setHeader('Allow','GET, POST');return response.status(405).json({error:'Método no permitido.'});
  }
  if(request.method==='POST'){
    if(!isSameOriginRequest(request))return response.status(403).json({error:'Origen no permitido.'});
    if(!requireJsonRequest(request,response))return;
    const user=await authenticateBearer(request.headers.authorization);
    if(!user?.id)return response.status(401).json({error:'Ingresá a tu cuenta para conectar las alarmas.'});
    if(request.body.action==='alarms-confirm'){
      const proof=verify(request.body.proof,'alarm-receipt');
      if(!proof||proof.sub!==user.id)return response.status(400).json({error:'No pudimos confirmar la conexión. Volvé a conectarla.'});
      return response.status(200).json({connected:true,version:proof.version,userId:user.id,expiresAt:proof.feedExpiresAt});
    }
    if(request.body.consent!==true)return response.status(400).json({error:'Confirmá que querés recibir alarmas en esta PC.'});
    return response.status(200).json({token:sign(user.id,'alarm-setup',120)});
  }
  if(request.method==='GET' && request.query.alarmSetup){
    const setup=verify(request.query.alarmSetup,'alarm-setup');
    if(!setup)return response.status(401).json({error:'El enlace venció. Conectá las alarmas de nuevo desde Estudiemos.'});
    const feedExpiresAt=seconds()+90*86400;
    return response.status(200).json({feedToken:sign(setup.sub,'alarm-feed',90*86400),snapshot:await snapshot(setup.sub),
      confirmation:sign(setup.sub,'alarm-receipt',600,{version:'1.6.0',feedExpiresAt})});
  }
  const feed=verify(String(request.headers.authorization||'').replace(/^Bearer /i,''),'alarm-feed');
  if(!feed)return response.status(401).json({error:'Volvé a conectar las alarmas desde Estudiemos.'});
  return response.status(200).json(await snapshot(feed.sub));
};
module.exports.verify=verify;
module.exports.sign=sign;
module.exports.snapshot=snapshot;
