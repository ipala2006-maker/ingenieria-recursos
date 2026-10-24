(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./timetable'));
  else root.EstudiemosClassroomRules=factory(root.EstudiemosTimetableRules);
})(typeof globalThis!=='undefined'?globalThis:this,function(time){
  const CACHE_KEY='estudiemos_classes_v1',PENDING_KEY='estudiemos_class_invite_v1';
  const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  const PERMISSIONS=Object.freeze(['datesAdd','datesEdit','datesRemove','filesAdd','filesEdit','filesRemove']);
  const isOwner=course=>['teacher','collaborator'].includes(course?.role);
  const can=(course,permission)=>PERMISSIONS.includes(permission)&&!course?.archived&&(isOwner(course)||course?.role==='moderator'&&course.ownerRole==='collaborator'&&course.permissions?.[permission]===true);
  function permissions(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!PERMISSIONS.includes(key)||typeof value[key]!=='boolean'))throw new Error('INVALID_PERMISSIONS');
    return Object.fromEntries(PERMISSIONS.map(key=>[key,value[key]===true]));
  }
  const text=(value,max,required=false)=>{
    if(typeof value!=='string'||value.trim().length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error('INVALID_DATA');
    return value.trim();
  };
  function code(value){return typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';}
  function invitation(value,origin){
    const plain=code(value);if(CODE.test(plain))return plain;
    try{const url=new URL(String(value).trim());if(url.protocol!=='https:'&&url.origin!==origin)return '';if(![origin,'https://estudiemos-app.vercel.app'].includes(url.origin)||url.username||url.password)return '';const hash=new URLSearchParams(url.hash.slice(1));const token=code(hash.get('materia')||hash.get('clase')||url.searchParams.get('materia')||url.searchParams.get('clase')||'');return CODE.test(token)?token:'';}catch(_){return '';}
  }
  function event(value){
    if(!value||typeof value!=='object')throw new Error('INVALID_EVENT');
    const result={title:text(value.title,90,true),date:value.date,start:value.start||'',end:value.end||'',allDay:value.allDay===true,type:['Clase','Examen','Entrega','Actividad'].includes(value.type)?value.type:'Clase',color:time.COLORS.includes(value.color)?value.color:'blue',note:text(value.note||'',1200),repeat:value.repeat||'none',days:[],endDate:value.endDate||''};
    if(!time.date(result.date)||!['none','weekly'].includes(result.repeat)||typeof value.allDay!=='boolean')throw new Error('INVALID_EVENT');
    if(!result.allDay&&(!time.time(result.start)||!time.time(result.end)||result.end<=result.start))throw new Error('INVALID_EVENT');
    if(result.allDay){result.start='';result.end='';}
    if(result.repeat==='weekly'){
      result.days=[...new Set(Array.isArray(value.days)?value.days:[])];
      if(!result.days.length||result.days.length>7||result.days.some(day=>!Number.isInteger(day)||day<0||day>6)||result.endDate&&(!time.date(result.endDate)||result.endDate<result.date))throw new Error('INVALID_EVENT');
    }else result.endDate='';
    return result;
  }
  function driveUrl(value){
    try{
      const url=new URL(value);
      if(url.protocol!=='https:'||url.port||url.username||url.password||value.length>1200)return '';
      const path=url.pathname;
      const allowed=url.hostname==='drive.google.com'&&(/^\/file\/d\/[A-Za-z0-9_-]{5,200}(?:\/view|\/preview|\/edit)?\/?$/.test(path)||/^\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]{5,200}\/?$/.test(path))||url.hostname==='docs.google.com'&&/^\/(?:document|spreadsheets|presentation|forms|drawings)\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]{5,200}(?:\/(?:edit|view|preview|viewform|copy))?\/?$/.test(path);
      if(!allowed)return '';
      const key=url.searchParams.get('resourcekey');url.search='';url.hash='';
      if(key&&/^[A-Za-z0-9_-]{1,200}$/.test(key))url.searchParams.set('resourcekey',key);
      return url.href;
    }catch(_){return '';}
  }
  function material(value){
    const title=text(value?.title,120,true),url=typeof value?.url==='string'&&driveUrl(value.url.trim());
    if(!url)throw new Error('INVALID_MATERIAL');return {title,url};
  }
  function course(value){
    const result={title:text(value?.title,90,true),teacherName:text(value.teacherName,60,true),institution:text(value.institution||'',90),timezone:text(value.timezone,80,true),color:time.COLORS.includes(value.color)?value.color:'blue'};
    if(value.ownerRole!==undefined){if(!['teacher','collaborator'].includes(value.ownerRole))throw new Error('INVALID_PERMISSIONS');result.ownerRole=value.ownerRole;}
    try{new Intl.DateTimeFormat('es',{timeZone:result.timezone}).format();}catch(_){throw new Error('INVALID_TIMEZONE');}
    return result;
  }
  function occurrences(snapshot,from,until=from){
    if(!time.date(from)||!time.date(until))return [];
    const result=[];
    for(const row of (snapshot?.calendar||[]).slice(0,4000)){
      if(!UUID.test(row.id||'')||!UUID.test(row.classId||''))continue;
      let data;try{data=event(row.data);}catch(_){continue;}
      let dates;
      if(data.repeat==='weekly')dates=time.occurrences([{id:row.id,title:data.title,days:data.days,start:data.allDay?'00:00':data.start,end:data.allDay?'23:59':data.end,startDate:data.date,endDate:data.endDate,color:data.color}],from,until).map(item=>item.date);
      else dates=data.date>=from&&data.date<=until?[data.date]:[];
      for(const date of dates)result.push({id:`class:${row.id}:${date}`,classEventId:row.id,classId:row.classId,className:String(row.className||'Clase').slice(0,90),title:data.title,date,horaInicio:data.start,horaFin:data.end,type:data.type,color:data.color,note:[data.note,`Horario de la clase: ${row.timezone||'UTC'}`].filter(Boolean).join('\n'),subject:row.className,done:false,readOnly:true});
    }
    return result;
  }
  return Object.freeze({CACHE_KEY,PENDING_KEY,UUID,CODE,PERMISSIONS,isOwner,can,permissions,code,invitation,text,event,material,course,driveUrl,occurrences});
});
