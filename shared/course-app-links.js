(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.EstudiemosCourseAppLinks=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  const PUBLIC_ORIGIN='https://estudiemos.ar';
  const legacyOrigins=new Set(['https://estudiemos-app.vercel.app','https://estudiemos.estudiemos-services.workers.dev','https://estudiemos-candidate.estudiemos-services.workers.dev']);
  const isLegacyOrigin=origin=>legacyOrigins.has(origin);
  function publicOrigin(configured){
    const origin=typeof configured==='string'?configured.replace(/\/$/,''):'';
    return origin===PUBLIC_ORIGIN?origin:PUBLIC_ORIGIN;
  }
  function canonicalUrl(code,configured){
    return typeof code==='string'&&CODE.test(code)?new URL('/materia/'+code,publicOrigin(configured)):null;
  }
  function authReturnUrl(base){
    const url=new URL(base);
    return isLegacyOrigin(url.origin)?new URL(PUBLIC_ORIGIN):url;
  }
  function publicEntryRedirect(url){
    if(!isLegacyOrigin(url.origin))return null;
    const friend=/^\/amistad\/([a-f0-9]{32})\/?$/.exec(url.pathname);
    if(friend)return new URL('/amistad/'+friend[1],PUBLIC_ORIGIN);
    if(!/^\/instalar(?:\.html)?\/?$/.test(url.pathname))return null;
    const target=new URL('/instalar',PUBLIC_ORIGIN);
    for(const [name,value] of url.searchParams){
      if(/^utm_(source|medium|campaign|term|content|id)$/.test(name)&&value.length<=160)target.searchParams.set(name,value);
    }
    const codes=url.searchParams.getAll('materia');
    const code=codes[0]?.toUpperCase().replace(/[\s-]/g,'');
    if(codes.length===1&&CODE.test(code||''))target.searchParams.set('materia',code);
    if(url.searchParams.get('abrir')==='web')target.searchParams.set('abrir','web');
    return target;
  }
  function canonicalRedirect(url,configured){
    const path=/^\/materia\/([A-HJ-NP-Z2-9]{10})\/?$/i.exec(url.pathname);
    if(!path)return null;
    const canonical=canonicalUrl(path[1].toUpperCase(),configured);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    const destination=local?new URL(canonical.pathname,url.origin):canonical;
    if(url.origin===destination.origin&&url.pathname===destination.pathname)return null;
    if(url.searchParams.get('abrir')==='web')destination.searchParams.set('abrir','web');
    return destination;
  }
  function platform(userAgent,inApp=false,macTouch=false){
    if(inApp)return '';
    if(/iPhone|iPad|iPod/i.test(userAgent||'')||macTouch)return 'ios';
    if(/Android/i.test(userAgent||''))return 'android';
    if(/Windows/i.test(userAgent||''))return 'windows';
    return '';
  }
  function nativeUrl(code,kind,configured){
    const fallback=canonicalUrl(code,configured);
    if(!fallback)return '';
    if(kind==='windows')return 'estudiemos-app://open?materia='+code;
    if(kind!=='android')return '';
    fallback.searchParams.set('abrir','web');
    return 'intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url='+encodeURIComponent(fallback.href)+';end';
  }
  return Object.freeze({publicOrigin,isLegacyOrigin,canonicalUrl,canonicalRedirect,publicEntryRedirect,authReturnUrl,platform,nativeUrl});
});
