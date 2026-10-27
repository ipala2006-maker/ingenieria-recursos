(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.EstudiemosCourseAppLinks=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  function platform(userAgent,inApp=false){
    if(inApp)return '';
    if(/Android/i.test(userAgent||''))return 'android';
    if(/Windows/i.test(userAgent||''))return 'windows';
    return '';
  }
  function nativeUrl(code,kind,root='https://estudiemos-app.vercel.app/'){
    if(!CODE.test(code))return '';
    if(kind==='windows')return 'estudiemos-app://open?materia='+code;
    if(kind!=='android')return '';
    let fallback;try{fallback=new URL('materia/'+code,root);}catch(_){return '';}
    if(fallback.username||fallback.password||fallback.protocol!=='https:'&&!(fallback.protocol==='http:'&&['localhost','127.0.0.1'].includes(fallback.hostname)))return '';
    fallback.searchParams.set('abrir','web');
    return 'intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url='+encodeURIComponent(fallback.href)+';end';
  }
  return Object.freeze({platform,nativeUrl});
});
