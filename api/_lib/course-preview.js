const {adminRequest}=require('./supabase-admin');
const rules=require('../../shared/classrooms');
module.exports=async function coursePreview(code,request=adminRequest){
  const preview=await request('/rest/v1/rpc/classroom_invitation',{method:'POST',body:JSON.stringify({p_code:code})});
  return {title:rules.text(preview.title,90,true),teacherName:rules.text(preview.teacherName,60,true),institution:rules.text(preview.institution||'',90),
    calendar:(Array.isArray(preview.calendar)?preview.calendar:[]).slice(0,100).map(item=>({id:item.id,classId:item.classId,className:item.className,timezone:item.timezone,data:{...rules.event(item.data),note:''}}))};
};
