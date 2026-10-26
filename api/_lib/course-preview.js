const {adminRequest}=require('./supabase-admin');
const rules=require('../../shared/classrooms');
const cache=new Map(),ttl=10000,maximum=128;
module.exports=async function coursePreview(code,request=adminRequest){
  // The link already exposes this presentation. Never cache member/private reads.
  if(request!==adminRequest)return read(code,request);
  const previous=cache.get(code);
  if(previous&&previous.expires>Date.now())return previous.promise;
  if(cache.size>=maximum)cache.delete(cache.keys().next().value);
  const entry={expires:Date.now()+ttl};
  entry.promise=read(code,request).catch(error=>{if(cache.get(code)===entry)cache.delete(code);throw error;});
  cache.set(code,entry);
  return entry.promise;
};
async function read(code,request){
  const preview=await request('/rest/v1/rpc/classroom_invitation',{method:'POST',body:JSON.stringify({p_code:code})});
  return {title:rules.text(preview.title,90,true),teacherName:rules.text(preview.teacherName,60,true),institution:rules.text(preview.institution||'',90),
    calendar:(Array.isArray(preview.calendar)?preview.calendar:[]).slice(0,100).map(item=>({id:item.id,classId:item.classId,className:item.className,timezone:item.timezone,data:{...rules.event(item.data),note:''}}))};
}
