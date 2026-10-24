(function(){
  if(window.EstudiemosCourseInvitation)return;
  const root=new URL('../',document.currentScript.src),key='estudiemos_class_invite_v1',CODE=/^[A-HJ-NP-Z2-9]{10}$/;
  let memory=null;
  const parse=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
  function save(code,owner='',preview){if(!CODE.test(code))return;const value={code,owner,auto:true,expires:Date.now()+7*86400000,...(preview?{preview}:{})};memory=value;for(const name of['sessionStorage','localStorage'])try{window[name].setItem(key,JSON.stringify(value));}catch(_){}return value;}
  function pending(owner=''){for(const name of['sessionStorage','localStorage','memory'])try{const value=name==='memory'?memory:JSON.parse(window[name].getItem(key)||'null');if(value?.expires>Date.now()&&CODE.test(value.code)&&(!value.owner||value.owner===owner))return value;}catch(_){}return null;}
  function clear(){memory=null;for(const name of['sessionStorage','localStorage'])try{window[name].removeItem(key);}catch(_){}}
  function appUrl(code){const url=new URL('./',root);url.searchParams.set('unirme','1');url.hash='materia='+code;return url;}
  window.EstudiemosCourseInvitation=Object.freeze({save,pending,clear,appUrl});
  async function install(){
    const url=new URL(location.href);if(!url.pathname.endsWith('/instalar.html'))return;
    const code=parse(new URLSearchParams(url.hash.slice(1)).get('materia')||url.searchParams.get('materia'));if(!CODE.test(code))return;
    const existing=pending();save(code,existing?.owner||'');
    document.body.classList.add('course-invitation-page');
    const section=document.createElement('section');section.className='course-install-invitation';section.setAttribute('aria-labelledby','courseInviteTitle');
    section.innerHTML='<p class="install-kicker">INVITACIÓN A UNA MATERIA</p><h2 id="courseInviteTitle">Preparando tu cursada…</h2><p data-course-invite-status role="status"></p><div data-course-invite-dates></div><div class="install-hero__actions"><a class="install-action install-action--primary" href="#instalar">Instalar Estudiemos</a><a class="install-action install-action--quiet" data-course-join>Registrarme y unirme</a></div>';
    document.querySelector('main').prepend(section);
    const destination=appUrl(code);section.querySelector('[data-course-join]').href=destination;
    if(/Android/i.test(navigator.userAgent)){const link=document.createElement('a');link.className='install-action install-action--quiet';link.textContent='Abrir app instalada';link.href='intent://open?materia='+code+'#Intent;scheme=estudiemos;package=com.estudiemos.app;S.browser_fallback_url='+encodeURIComponent(url.href)+';end';section.querySelector('.install-hero__actions').append(link);}
    document.querySelectorAll('[data-open-estudiemos],a[href="https://estudiemos-app.vercel.app/"]').forEach(link=>link.href=destination);
    const state=section.querySelector('[data-course-invite-status]');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(new URL('api/account-config?classes=1&invite='+code,root),{cache:'no-store',credentials:'same-origin',signal:controller.signal}),preview=await response.json();
      if(!response.ok)throw new Error(preview.message||'No pudimos preparar la materia.');
      save(code,'',preview);section.querySelector('h2').textContent=preview.title;state.textContent='Las fechas ya están preparadas en este dispositivo. Instalá Estudiemos e iniciá sesión para agregarlas a tu cuenta.';
      const dates=section.querySelector('[data-course-invite-dates]');for(const item of preview.calendar.slice(0,5)){const line=document.createElement('p');line.textContent=item.data.date+' · '+item.data.title+(item.data.allDay?' · Todo el día':' · '+item.data.start+'–'+item.data.end);dates.append(line);}
    }catch(error){section.querySelector('h2').textContent='Te invitaron a una materia';state.textContent=error.message+' La invitación queda guardada para continuar en la app.';}finally{clearTimeout(timer);}
    const script=document.createElement('script');script.src=new URL('scripts/account.js?v=20261024-flow',root);script.onload=async()=>{await window.EstudiemosAccount?.whenReady();if(window.EstudiemosAccount?.getUser()||matchMedia('(display-mode: standalone)').matches||navigator.standalone)location.replace(destination);};document.head.append(script);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
