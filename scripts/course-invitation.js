(function(){
  if(window.EstudiemosCourseInvitation)return;
  const root=new URL('../',document.currentScript.src),key='estudiemos_class_invite_v1',CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  let memory=null;
  const parse=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
  function save(code,owner='',preview){if(!CODE.test(code))return;const value={code,owner,auto:true,expires:Date.now()+7*86400000,...(preview?{preview}:{})};memory=value;for(const name of['sessionStorage','localStorage'])try{window[name].setItem(key,JSON.stringify(value));}catch(_){}return value;}
  function pending(owner=''){for(const name of['sessionStorage','localStorage','memory'])try{const value=name==='memory'?memory:JSON.parse(window[name].getItem(key)||'null');if(value?.expires>Date.now()&&CODE.test(value.code)&&(!value.owner||value.owner===owner))return value;}catch(_){}return null;}
  function clear(){memory=null;for(const name of['sessionStorage','localStorage'])try{window[name].removeItem(key);}catch(_){}}
  function appUrl(code){const url=new URL('./',root);if(CODE.test(code)){url.searchParams.set('unirme','1');url.hash='materia='+code;}return url;}
  function canonicalUrl(code){return CODE.test(code)?new URL('materia/'+code,root):new URL('./',root);}
  function confirmationUrl(base){
    const url=new URL(base,root);
    if(url.origin!==root.origin)return new URL('./',root);
    const value=pending(window.EstudiemosAccount?.getUser()?.id||'');
    if(value){url.searchParams.set('materia',value.code);url.searchParams.set('unirme','1');}
    return url;
  }
  window.EstudiemosCourseInvitation=Object.freeze({save,pending,clear,appUrl,canonicalUrl,confirmationUrl});
  async function install(){
    const url=new URL(location.href),path=/^\/materia\/([A-HJ-NP-Z2-9]{10})\/?$/i.exec(url.pathname);
    if(!url.pathname.endsWith('/instalar.html')&&!path)return;
    const code=parse(path?.[1]||new URLSearchParams(url.hash.slice(1)).get('materia')||url.searchParams.get('materia'));if(!CODE.test(code))return;
    const view=window.EstudiemosCourseInviteView;if(!view)return;
    const existing=pending();save(code,existing?.owner||'');
    document.body.classList.add('course-invitation-page');
    if(!document.querySelector('link[href*="styles/app.css"]')){
      const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('styles/app.css?v=20261023-sync',root);
      document.head.insertBefore(style,document.querySelector('link[rel="stylesheet"]'));
    }
    let section=document.querySelector('.course-install-invitation');
    if(!section){section=document.createElement('section');section.className='course-install-invitation';section.setAttribute('aria-labelledby','courseInviteTitle');document.querySelector('main').prepend(section);}
    const destination=appUrl(code);let unavailable=false,seed=null,currentPreview=null,navigating=false;
    try{const data=JSON.parse(document.querySelector('[data-course-preview]')?.dataset.coursePreview||'null');if(data?.code===code)seed=data;}catch(_){}
    function paint(preview,status='',gone=false,loading=false){
      currentPreview=preview;unavailable=gone;
      section.innerHTML=view.content(preview,{code,joinUrl:gone?new URL('./',root).href:destination.href,status,unavailable:gone,loading});
      if(/Android/i.test(navigator.userAgent)&&!gone){const link=document.createElement('a');link.className='install-action install-action--quiet';link.textContent='Abrir app instalada';link.dataset.courseNative='';link.href='intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url='+encodeURIComponent(destination.href)+';end';section.querySelector('.install-hero__actions').append(link);}
    }
    if(seed)paint(seed.preview,seed.status,seed.unavailable);else paint(null,'Preparando tu invitación…',false,true);
    document.querySelectorAll('[data-open-estudiemos],a[href="https://estudiemos-app.vercel.app/"]').forEach(link=>link.href=destination);
    const android=document.querySelector('[data-install-android]');if(android)android.href='intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Fipala2006-maker%2Fingenieria-recursos%2Freleases%2Fdownload%2Fandroid-latest%2FEstudiemos-Android.apk;end';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      if(seed?.unavailable){unavailable=true;clear();paint(null,seed.status,true);return;}
      let preview=seed?.preview;
      if(!preview&&!seed){
        const response=await fetch(new URL('api/account-config?classes=1&invite='+code,root),{cache:'no-store',credentials:'same-origin',signal:controller.signal});
        const value=await response.json();
        if(response.status===404){unavailable=true;clear();}
        if(!response.ok)throw new Error(value.message||'No pudimos preparar la materia.');
        preview=value;
      }
      if(preview){save(code,'',preview);paint(preview);}
    }catch(error){paint(null,unavailable?'La cátedra se eliminó o cambió su enlace.':'No pudimos cargar las fechas. Tu invitación queda guardada para continuar en la app.',unavailable);}
    finally{clearTimeout(timer);}
    if(unavailable)return;
    const continueInApp=()=>{
      const user=window.EstudiemosAccount?.getUser();
      if(navigating||unavailable||!user)return;
      navigating=true;save(code,user.id,currentPreview);location.replace(destination);
    };
    window.addEventListener('estudiemos:account-change',continueInApp);
    const ready=new Promise(resolve=>{
      if(window.EstudiemosAccount)return resolve(window.EstudiemosAccount);
      const script=document.createElement('script');script.src=new URL('scripts/account.js?v=20261026-course-links',root);
      script.onload=()=>resolve(window.EstudiemosAccount||null);script.onerror=()=>resolve(null);document.head.append(script);
    });
    section.addEventListener('click',async event=>{
      if(event.target.closest('[data-course-retry]')){location.reload();return;}
      if(!event.target.closest('[data-course-join]')||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();save(code,'',currentPreview);
      const button=section.querySelector('[data-course-join]');button.setAttribute('aria-busy','true');
      let timer;
      const account=await Promise.race([ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),8000);})]);clearTimeout(timer);
      button.removeAttribute('aria-busy');
      if(!account){location.assign(destination);return;}
      if(account.getUser())continueInApp();else account.open();
    });
    const account=await ready;await account?.whenReady();continueInApp();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
