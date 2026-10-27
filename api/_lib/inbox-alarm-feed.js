const crypto = require('node:crypto');
const {adminRequest,authenticateBearer} = require('./supabase-admin');
const {isSameOriginRequest,requireJsonRequest} = require('./request-security');
const rules = require('../../shared/inbox-alarms');
const goals = require('../../shared/study-goal');
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
async function snapshot(userId, requestedDate) {
  const date = goals.validDate(requestedDate) ? requestedDate : new Date().toISOString().slice(0,10);
  const value=await adminRequest('/rest/v1/rpc/get_windows_local_setup_snapshot', {
    method:'POST', body:JSON.stringify({p_user_id:userId,p_date:date})
  });
  const items=value?.items || [];
  let study = null;
  const progress=value?.study;
  if (progress?.date===date && Number.isSafeInteger(progress.minutes) && progress.minutes>=0 && progress.minutes<=1440 && goals.validMinutes(progress.goalMinutes) && typeof progress.configured==='boolean') {
    study={date,minutes:progress.minutes,goalMinutes:progress.goalMinutes,configured:progress.configured};
  }
  return {version:1,study,updatedAt:value?.updatedAt || null,items:(Array.isArray(items)?items:[]).slice(0,500).flatMap(item=>{
    const alarm=rules.normalize(item?.alarm);
    if(!alarm||item.done||typeof item.id!=='string')return [];
    // Consent belongs to the connected Windows device, not the device creating the task.
    return [{id:item.id.slice(0,180),title:String(item.title||'Tarea pendiente').slice(0,90),alarm:{...alarm,windows:true}}];
  })};
}
module.exports = async function alarmFeed(request,response) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST'].includes(request.method)){
    response.setHeader('Allow','GET, POST');return response.status(405).json({error:'Método no permitido.'});
  }
  if(request.method==='GET' && !request.query.alarmSetup) return retired(response);
  if(request.method==='POST'){
    if(!isSameOriginRequest(request))return response.status(403).json({error:'Origen no permitido.'});
    if(!requireJsonRequest(request,response))return;
    const user=await authenticateBearer(request.headers.authorization);
    if(!user?.id)return response.status(401).json({error:'Ingresá a tu cuenta para conectar las alarmas.'});
    if(request.body.action==='alarms-confirm'){
      const proof=verify(request.body.proof,'alarm-receipt');
      if(!proof||proof.sub!==user.id)return response.status(400).json({error:'No pudimos confirmar la conexión. Volvé a conectarla.'});
      if(proof.version!=='2.0.0')return retired(response);
      return response.status(200).json({connected:true,version:proof.version,userId:user.id,expiresAt:proof.feedExpiresAt,...(proof.version==='2.0.0'?{mode:'local'}:{})});
    }
    if(request.body.consent!==true)return response.status(400).json({error:'Confirmá que querés recibir alarmas en esta PC.'});
    return response.status(200).json({token:sign(user.id,'alarm-setup',120)});
  }
  if(request.method==='GET' && request.query.alarmSetup){
    if(request.query.clientVersion!=='2.0.0')return retired(response);
    const setup=verify(request.query.alarmSetup,'alarm-setup');
    if(!setup)return response.status(401).json({error:'El enlace venció. Conectá las alarmas de nuevo desde Estudiemos.'});
    const feedExpiresAt=seconds()+90*86400;
    const version='2.0.0';
    return response.status(200).json({userId:setup.sub,snapshot:await snapshot(setup.sub,request.query.localDate),
      confirmation:sign(setup.sub,'alarm-receipt',600,{version,feedExpiresAt})});
  }
  return retired(response);
};
function retired(response){return response.status(410).json(require('../../.well-known/windows-alarms-retired.json'));}
module.exports.verify=verify;
module.exports.sign=sign;
module.exports.snapshot=snapshot;
