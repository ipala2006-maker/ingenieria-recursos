(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EstudiemosAds=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function adFree(user,now=Date.now()){
    // Only server-managed Auth metadata, never user_metadata or private study state.
    const access=user?.app_metadata?.estudiemos;
    if(access?.status!=='active'||!(access.planId==='pro'||access.noAds===true))return false;
    if(access.currentPeriodEnd==null)return true;
    const end=Date.parse(access.currentPeriodEnd);
    return Number.isFinite(end)&&end>now;
  }
  function eligible({enabled,user,consent,nativeWebView=false,now=Date.now()}){
    return enabled===true&&typeof user?.id==='string'&&user.id.length>0&&consent==='granted'&&!nativeWebView&&!adFree(user,now);
  }
  return Object.freeze({adFree,eligible});
});
