const crypto=require('node:crypto');
const rules=require('../../shared/classrooms');
const {authenticateBearer,adminRequest}=require('./supabase-admin');
const {setSecurityHeaders,isSameOriginRequest,requireJsonRequest,rejectOversizedBody,enforceRateLimit}=require('./request-security');
const actions=new Set(['create','update','join','leave','delete','rotate','archive','event_save','event_remove','material_save','material_remove','member_remove','member_unblock','member_permissions']);
const errors={AUTH_REQUIRED:'Iniciá sesión para abrir tus clases.',EMAIL_VERIFICATION_REQUIRED:'Confirmá tu correo antes de crear una clase o unirte.',INVALID_DATA:'Revisá el nombre de la clase y del profesor.',INVALID_TIMEZONE:'La zona horaria no es válida.',INVALID_EVENT:'Revisá la fecha, los días y el horario de la actividad.',INVALID_MATERIAL:'Usá un enlace a un archivo o carpeta de Google Drive.',CLASS_UNAVAILABLE:'La clase no está disponible o no tenés acceso.',INVALID_CODE:'No encontramos una clase disponible con ese código.',CLASS_LIMIT:'Alcanzaste el límite de 10 clases creadas o 30 clases como alumno.',CLASS_FULL:'La clase alcanzó su límite de 400 alumnos.',ITEM_LIMIT:'La clase admite hasta 100 actividades y 50 materiales.',CLASS_ARCHIVED:'La clase está archivada. Reactivala antes de modificarla.'};
function inviteCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.randomBytes(10),byte=>alphabet[byte&31]).join('');}
module.exports=async function classrooms(req,res){
  setSecurityHeaders(res);
  if(!['GET','POST'].includes(req.method))return res.status(405).json({message:'Método no permitido.'});
  if(!isSameOriginRequest(req))return res.status(403).json({message:'Origen no permitido.'});
  if(rejectOversizedBody(req,res,8192)||req.method==='POST'&&!requireJsonRequest(req,res))return;
  if(req.method==='GET'&&req.query.invite){
    const code=rules.code(req.query.invite);if(!rules.CODE.test(code))return res.status(400).json({message:errors.INVALID_CODE});
    if(!await enforceRateLimit(req,res,{route:'classroom-preview',limit:600,windowSeconds:60}))return;
    try{
      const preview=await require('./course-preview')(code,adminRequest);
      return res.status(200).json(preview);
    }catch(error){return res.status(error.message==='INVALID_CODE'?404:503).json({message:error.message==='INVALID_CODE'?errors.INVALID_CODE:'No pudimos preparar la invitación. Volvé a intentar.'});}
  }
  if(!await enforceRateLimit(req,res,{route:'classroom-auth',limit:1000,windowSeconds:60,distributed:false}))return;
  const user=await authenticateBearer(req.headers.authorization);
  if(!user)return res.status(401).json({message:errors.AUTH_REQUIRED});
  if(!await enforceRateLimit(req,res,{route:'classrooms',limit:120,ipLimit:1000,principal:user.id,windowSeconds:60}))return;
  const body=req.body||{},action=req.method==='GET'?(req.query.id?(req.query.history==='1'?'history':'detail'):'state'):body.action;
  if(req.method==='POST'&&!actions.has(action))return res.status(400).json({message:'Acción inválida.'});
  const data={};
  try{
    if(req.method==='GET'&&req.query.stateProtocol==='2'||req.method==='POST'&&body.stateProtocol===2){
      data.stateProtocol=2;
      if(req.method==='GET'&&req.query.calendarVersions!==undefined&&(typeof req.query.calendarVersions!=='string'||req.query.calendarVersions.length>6500))throw new Error('INVALID_DATA');
      const versions=req.method==='GET'?JSON.parse(req.query.calendarVersions||'{}'):body.calendarVersions||{};
      data.calendarVersions=rules.calendarVersions(versions);
    }
    if(action==='state'){
      if(req.query.revision&&(typeof req.query.revision!=='string'||!/^[a-f0-9]{32}$/.test(req.query.revision)))throw new Error('INVALID_DATA');
      data.revision=req.query.revision||'';
    }else if(action==='join'){
      data.code=rules.code(body.code);if(!rules.CODE.test(data.code))throw new Error('INVALID_CODE');
    }else if(action==='create')Object.assign(data,rules.course(body),{code:inviteCode()});
    else {
      data.id=req.method==='GET'?req.query.id:body.id;if(typeof data.id!=='string'||!rules.UUID.test(data.id))throw new Error('CLASS_UNAVAILABLE');
      if(action==='update')Object.assign(data,rules.course(body));
      if(action==='rotate')data.code=inviteCode();
      if(action==='archive'){if(typeof body.archived!=='boolean')throw new Error('INVALID_DATA');data.archived=body.archived;}
      if(['event_save','event_remove','material_save','material_remove','member_remove','member_unblock','member_permissions'].includes(action)){
        if(body.itemId&&(typeof body.itemId!=='string'||!rules.UUID.test(body.itemId)))throw new Error('INVALID_DATA');
        data.itemId=body.itemId||(['event_save','material_save'].includes(action)?crypto.randomUUID():'');
        if(!data.itemId)throw new Error('INVALID_DATA');
        if(['event_save','event_remove','material_save','material_remove'].includes(action)){
          if(body.expectedVersion!==undefined&&(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0))throw new Error('INVALID_DATA');
          data.expectedVersion=body.expectedVersion||0;
        }
        if(action==='event_save')data.event=rules.event(body.event);
        if(action==='material_save')data.material=rules.material(body.material);
        if(action==='member_permissions'){
          if(!['student','moderator'].includes(body.role))throw new Error('INVALID_PERMISSIONS');
          data.role=body.role;data.permissions=rules.permissions(body.permissions);
          if(body.role==='student'&&Object.values(data.permissions).some(Boolean))throw new Error('INVALID_PERMISSIONS');
        }
      }
    }
    if(action==='delete'){
      const state=await adminRequest('/rest/v1/rpc/classroom_delete',{method:'POST',body:JSON.stringify({p_user:user.id,p_id:data.id})});
      return res.status(200).json(state);
    }
    const result=await adminRequest('/rest/v1/rpc/classroom_action',{method:'POST',body:JSON.stringify({p_user:user.id,p_action:action,p_data:data})});
    return res.status(200).json(result);
  }catch(error){
    if(error.message==='VERSION_CONFLICT')return res.status(409).json({code:'VERSION_CONFLICT',message:'Otra persona modificó esta actividad. Tus cambios no se guardaron ni sobrescribieron la versión más reciente.'});
    if(error.message==='CLASS_BLOCKED')return res.status(403).json({code:'CLASS_BLOCKED',message:'El responsable te quitó de esta cátedra. Necesita habilitar tu participación antes de que puedas volver a unirte.'});
    if(error instanceof SyntaxError)return res.status(400).json({message:'Datos de sincronización no válidos.'});
    if(error.message==='INVALID_PERMISSIONS')return res.status(400).json({message:'Revisá el rango y los permisos seleccionados.'});
    if(error.message==='PERMISSION_DENIED')return res.status(403).json({message:'No tenés permiso para hacer este cambio. Actualizá la materia para ver tus permisos.'});
    if(errors[error.message])return res.status(['AUTH_REQUIRED','EMAIL_VERIFICATION_REQUIRED'].includes(error.message)?403:400).json({message:errors[error.message]});
    return res.status(503).json({message:'No pudimos cargar Clases. Volvé a intentar en unos minutos.'});
  }
};
