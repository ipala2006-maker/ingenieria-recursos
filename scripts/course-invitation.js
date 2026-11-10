(function(){
  if(window.EstudiemosCourseInvitation)return;
  const root=new URL('../',document.currentScript.src),key='estudiemos_class_invite_v1',CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  let memory=null;
  const parse=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
  function save(code,owner='',preview){if(!CODE.test(code))return;const value={code,owner,auto:true,expires:Date.now()+7*86400000,...(preview?{preview}:{})};memory=value;for(const name of['sessionStorage','localStorage'])try{window[name].setItem(key,JSON.stringify(value));}catch(_){}return value;}
  function pending(owner=''){for(const name of['sessionStorage','localStorage','memory'])try{const value=name==='memory'?memory:JSON.parse(window[name].getItem(key)||'null');if(value?.expires>Date.now()&&CODE.test(value.code)&&(!value.owner||value.owner===owner))return value;}catch(_){}return null;}
  function clear(){memory=null;for(const name of['sessionStorage','localStorage'])try{window[name].removeItem(key);}catch(_){}}
  function appUrl(code){const url=new URL('./',root);if(CODE.test(code)){url.searchParams.set('unirme','1');url.hash='materia='+code;}return url;}
  function canonicalUrl(code){return window.EstudiemosCourseAppLinks.canonicalUrl(code,window.EstudiemosAccount?.getPublicAppOrigin?.());}
  function confirmationUrl(base){
    const source=new URL(base,root);
    if(source.origin!==root.origin)return new URL('./',root);
    const url=window.EstudiemosCourseAppLinks?.authReturnUrl(source)||source;
    const value=pending(window.EstudiemosAccount?.getUser()?.id||'');
    if(value){url.searchParams.set('materia',value.code);url.searchParams.set('unirme','1');}
    return url;
  }
  window.EstudiemosCourseInvitation=Object.freeze({save,pending,clear,appUrl,canonicalUrl,confirmationUrl});
  function install(){
    const url=new URL(location.href),path=/^\/materia\/([A-HJ-NP-Z2-9]{10})\/?$/i.exec(url.pathname);
    if(!/^\/instalar(?:\.html|\/)?$/.test(url.pathname)&&!path)return;
    const code=parse(path?.[1]||new URLSearchParams(url.hash.slice(1)).get('materia')||url.searchParams.get('materia'));if(!CODE.test(code))return;
    if(!path){
      const destination=canonicalUrl(code);
      if(url.searchParams.get('abrir')==='web')destination.searchParams.set('abrir','web');
      return location.replace(destination);
    }
    const view=window.EstudiemosCourseInviteView;if(!view)return;
    const existing=pending();save(code,existing?.owner||'');
    document.body.classList.add('course-invitation-page');
    if(!document.querySelector('link[href*="styles/app.css"]')){
      const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('styles/app.css?v=20261110-entry-taps',root);
      document.head.insertBefore(style,document.querySelector('link[rel="stylesheet"]'));
    }
    let section=document.querySelector('.course-install-invitation');
    if(!section){section=document.createElement('section');section.className='course-install-invitation';section.setAttribute('aria-labelledby','courseInviteTitle');document.querySelector('main').prepend(section);}
    const inApp=Boolean(window.EstudiemosAndroid)||matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: window-controls-overlay)').matches||navigator.standalone===true;
    const appLinks=window.EstudiemosCourseAppLinks;
    const nativePlatform=appLinks?.platform(navigator.userAgent,inApp,navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||'';
    const nativeDestination=appLinks?.nativeUrl(code,nativePlatform)||'';
    let webChosen=url.searchParams.get('abrir')==='web'||!nativeDestination;
    const destination=appUrl(code);let unavailable=false,seed=null,currentPreview=null,navigating=false;
    try{const data=JSON.parse(document.querySelector('[data-course-preview]')?.dataset.coursePreview||'null');if(data?.code===code)seed=data;}catch(_){}
    function markup(preview,status='',gone=false,loading=false){
      return view.content(preview,{code,joinUrl:gone?new URL('./',root).href:destination.href,status,unavailable:gone,loading,nativeUrl:nativeDestination,platform:nativePlatform,preferNative:!webChosen});
    }
    currentPreview=seed?.preview||null;unavailable=seed?.unavailable===true;
    if(!seed||!section.querySelector('[data-course-join]')||Boolean(section.querySelector('[data-course-native]'))!==Boolean(nativeDestination&&!unavailable)){
      section.innerHTML=markup(currentPreview,seed?seed.status:'Preparando tu invitación…',unavailable,!seed);
    }else{
      section.querySelector('[data-course-join]').href=unavailable?new URL('./',root):destination;
      if(nativePlatform==='ios'&&!/iPhone|iPad|iPod/i.test(navigator.userAgent)){
        const template=document.createElement('template');template.innerHTML=markup(currentPreview,seed.status,unavailable);
        section.querySelector('[data-course-open-status]').textContent=template.content.querySelector('[data-course-open-status]').textContent;
      }
    }
    if(unavailable){clear();return;}
    document.querySelectorAll('[data-open-estudiemos]').forEach(link=>link.href=nativeDestination&&!webChosen?nativeDestination:destination);
    const android=document.querySelector('[data-install-android]');if(android)android.href='intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Fipala2006-maker%2Fingenieria-recursos%2Freleases%2Fdownload%2Fandroid-latest%2FEstudiemos-Android.apk;end';
    if(currentPreview)save(code,existing?.owner||'',currentPreview);
    const continueInApp=()=>{
      const user=window.EstudiemosAccount?.getUser();
      if(navigating||unavailable||!user||!webChosen)return;
      navigating=true;save(code,user.id,currentPreview);location.replace(destination);
    };
    window.addEventListener('estudiemos:account-change',continueInApp);
    let ready;
    const loadAccount=()=>ready||(ready=new Promise(resolve=>{
      if(window.EstudiemosAccount)return resolve(window.EstudiemosAccount);
      const script=document.createElement('script');script.src=new URL('scripts/account.js?v=20261109-official-access',root);
      script.onload=()=>resolve(window.EstudiemosAccount||null);script.onerror=()=>resolve(null);document.head.append(script);
    }));
    section.addEventListener('click',async event=>{
      if(event.target.closest?.('[data-course-retry]')){location.reload();return;}
      if(event.target.closest?.('[data-course-native]')){
        save(code,'',currentPreview);
        const hint=section.querySelector('[data-course-open-status]');
        if(hint)hint.textContent='Aceptá «Abrir Estudiemos» si el sistema lo pide. Si no se abre, podés continuar desde el navegador o actualizar la instalación.';
        return; // Keep the original click activation; do not await Auth or substitute a timed redirect.
      }
      const button=event.target.closest?.('[data-course-join]');
      if(!button||unavailable||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      if(button.getAttribute('aria-busy')==='true'){event.preventDefault();return;}
      event.preventDefault();webChosen=true;save(code,'',currentPreview);
      button.setAttribute('aria-busy','true');
      let timer;
      const account=await Promise.race([loadAccount(),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),8000);})]);clearTimeout(timer);
      button.removeAttribute('aria-busy');
      if(unavailable)return;
      if(!account){location.assign(destination);return;}
      if(account.getUser())continueInApp();else account.open();
    });
    section.dataset.courseRouting='ready';
    if(!seed)loadPreview();
    if(nativeDestination&&!webChosen){
      // The marker is only a local installation hint, never proof that Windows opened the app.
      if(nativePlatform==='windows')try{
        const marker='estudiemos_course_app_attempt_v1',previous=JSON.parse(sessionStorage.getItem(marker)||'null');
        if(localStorage.getItem('estudiemos_windows_app_links')==='true'&&!(previous?.code===code&&Date.now()-previous.at<60000)){
          sessionStorage.setItem(marker,JSON.stringify({code,at:Date.now()}));section.querySelector('[data-course-native]')?.click();
        }
      }catch(_){}
      return;
    }
    loadAccount().then(account=>account?.whenReady()).then(continueInApp).catch(()=>{});

    function loadPreview(){
      let pointer=null,releaseTimer,update;
      const flush=()=>{if(pointer!==null||!update)return;const apply=update;update=null;apply();};
      const down=event=>{if(event.isPrimary&&event.target.closest?.('a,button,summary')){clearTimeout(releaseTimer);releaseTimer=null;pointer=event.pointerId;}};
      const release=()=>{pointer=null;releaseTimer=setTimeout(()=>{releaseTimer=null;flush();},350);};
      const pointerEnd=event=>{if(event.pointerId===pointer)release();};
      const touchEnd=event=>{if(pointer!==null&&!event.touches.length)release();};
      // A late preview can move controls; do not lay it out between pointerdown and click.
      section.addEventListener('pointerdown',down,{passive:true});
      for(const name of ['pointerup','pointercancel'])window.addEventListener(name,pointerEnd,{passive:true});
      for(const name of ['touchend','touchcancel'])window.addEventListener(name,touchEnd,{passive:true});
      const finish=(preview,status,gone=false)=>{
        update=()=>{
          section.removeEventListener('pointerdown',down);
          for(const name of ['pointerup','pointercancel'])window.removeEventListener(name,pointerEnd);
          for(const name of ['touchend','touchcancel'])window.removeEventListener(name,touchEnd);
          if(navigating)return;
          if(gone){unavailable=true;clear();section.innerHTML=markup(null,status,true);return;}
          currentPreview=preview;
          const saved=pending(window.EstudiemosAccount?.getUser()?.id||'');
          if(preview&&saved?.code===code)save(code,saved.owner,preview);
          const template=document.createElement('template');template.innerHTML=markup(preview,status);
          const content=template.content;
          section.querySelector('.course-invite-intro').replaceWith(content.querySelector('.course-invite-intro'));
          const agenda=content.querySelector('.course-invite-agenda');if(agenda)section.querySelector('.course-invite-footer').after(agenda);
          const retry=content.querySelector('[data-course-retry]');if(retry)section.querySelector('.course-invite-footer').append(retry);
        };
        if(!releaseTimer)flush();
      };
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      fetch(new URL('api/account-config?classes=1&invite='+code,root),{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{
        if(response.status===404)return finish(null,'La cátedra se eliminó o cambió su enlace.',true);
        if(!response.ok)throw new Error('course-preview-unavailable');
        finish(await response.json(),'');
      }).catch(()=>finish(null,'No pudimos cargar las fechas. Tu invitación queda guardada para continuar en la app.')).finally(()=>clearTimeout(timeout));
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
