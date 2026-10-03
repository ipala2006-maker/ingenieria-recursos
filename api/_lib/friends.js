const { authenticateBearer, adminRequest } = require('./supabase-admin');
const { setSecurityHeaders, isSameOriginRequest, requireJsonRequest, rejectOversizedBody, enforceRateLimit } = require('./request-security');
const actions = new Set(['profile','request','request_email','request_username','accept','decline','remove','block','unblock','rotate']);
const normalizeUsername=value=>value.trim().toLowerCase().replace(/^@/,'');
const errors = {
  TOO_MANY_ACTIONS:'Hiciste varios cambios seguidos. Esperá un minuto e intentá de nuevo.',
  INVALID_INVITE:'El enlace no es válido, ya cambió o no está disponible.',
  INVALID_EMAIL:'Ingresá un correo electrónico válido.',
  EMAIL_VERIFICATION_REQUIRED:'Confirmá tu correo antes de enviar solicitudes por usuario o correo.',
  EMAIL_REQUEST_LIMIT:'Ya enviaste varias solicitudes. Volvé a intentar en diez minutos.',
  INVALID_USERNAME:'Usá de 3 a 24 letras sin tildes, números o guion bajo para el usuario.',
  USERNAME_TAKEN:'Ese usuario ya está en uso. Elegí otro.',
  INVALID_PROFILE:'Elegí un nombre de 1 a 32 caracteres y la privacidad de tu racha.',
  INVALID_TIMEZONE:'No pudimos reconocer la zona horaria del dispositivo.',
  FRIEND_LIMIT:'Alcanzaste el límite de amigos o solicitudes. Revisá las pendientes.',
  REQUEST_NOT_FOUND:'La solicitud ya no está disponible. Actualizá la lista.',
  INVALID_TARGET:'Ese usuario no está disponible.'
};
module.exports = async function friends(request,response) {
  setSecurityHeaders(response);
  if (!['GET','POST'].includes(request.method)) return response.status(405).json({message:'Método no permitido.'});
  if (!isSameOriginRequest(request)) return response.status(403).json({message:'Origen no permitido.'});
  if (rejectOversizedBody(request,response,2048)) return;
  if (request.method==='POST' && !requireJsonRequest(request,response)) return;
  if (!(await enforceRateLimit(request,response,{route:'friends',limit:60,windowSeconds:60}))) return;
  const user = await authenticateBearer(request.headers.authorization);
  if (!user) return response.status(401).json({message:'Iniciá sesión para ver tus amigos.'});
  const body = request.body || {};
  const action = request.method==='GET' ? 'list' : body.action;
  if ((action!=='list' && !actions.has(action)) || (request.method==='POST' && action==='list')) return response.status(400).json({message:'Acción inválida.'});
  const data={};
  if(action==='profile') {
    if(typeof body.name!=='string' || body.name.trim().length<1 || body.name.length>32 || /[\u0000-\u001f\u007f]/.test(body.name) || typeof body.share!=='boolean' || typeof body.timezone!=='string' || body.timezone.length>80) return response.status(400).json({message:errors.INVALID_PROFILE});
    Object.assign(data,{name:body.name.trim(),share:body.share,timezone:body.timezone});
    if(Object.hasOwn(body,'username')) {
      if(typeof body.username!=='string' || body.username.length>25) return response.status(400).json({message:errors.INVALID_USERNAME});
      data.username=normalizeUsername(body.username);
      if(data.username && !/^[a-z0-9_]{3,24}$/.test(data.username)) return response.status(400).json({message:errors.INVALID_USERNAME});
    }
  } else if(action==='request') {
    if(typeof body.invite!=='string' || !/^[a-f0-9]{32}$/.test(body.invite)) return response.status(400).json({message:errors.INVALID_INVITE});
    data.invite=body.invite;
  } else if(action==='request_email') {
    if(typeof body.email!=='string' || body.email.length>254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(body.email.trim())) return response.status(400).json({message:errors.INVALID_EMAIL});
    data.email=body.email.trim().toLowerCase();
  } else if(action==='request_username') {
    if(typeof body.username!=='string' || body.username.length>25 || !/^[a-z0-9_]{3,24}$/.test(normalizeUsername(body.username))) return response.status(400).json({message:errors.INVALID_USERNAME});
    data.username=normalizeUsername(body.username);
  } else if(['accept','decline','remove','block','unblock'].includes(action)) {
    if(typeof body.id!=='string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id)) return response.status(400).json({message:errors.INVALID_TARGET});
    data.id=body.id;
  }
  try {
    const result=await adminRequest('/rest/v1/rpc/friends_action',{method:'POST',body:JSON.stringify({p_user:user.id,p_action:action,p_data:data})});
    return response.status(200).json(result);
  } catch(error) {
    if(['TOO_MANY_ACTIONS','EMAIL_REQUEST_LIMIT'].includes(error.message)) {
      response.setHeader('Retry-After',error.message==='EMAIL_REQUEST_LIMIT'?'600':'60');
      return response.status(429).json({message:errors[error.message]});
    }
    if(errors[error.message]) return response.status(400).json({message:errors[error.message]});
    return response.status(503).json({message:'Amigos no está disponible en este momento. Volvé a intentar en unos minutos.'});
  }
};
