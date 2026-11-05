import '../shared/ads.js';
import { observeBrowserAdConsent } from './ad-consent.js?v=20261104b';

(function(){
  if(window.EstudiemosAdBanner||window.EstudiemosRelease?.enabled('ads')!==true)return;
  const rules=window.EstudiemosAds,root=new URL('../',import.meta.url);
  let epoch=0,owner='',phase='idle',host=null,abort=null,handle=null,cancelIdle=()=>{},timer=0,disposed=false,stylePromise,needsCleanNavigation=false;
  const tcf=observeBrowserAdConsent(()=>window.dispatchEvent(new Event('estudiemos:ads-consent-change')));
  const consent=()=>tcf.getStatus();
  const user=()=>window.EstudiemosAccount?.getUser?.();
  const eligible=()=>rules.eligible({enabled:window.EstudiemosRelease?.enabled('ads'),user:user(),consent:consent(),nativeWebView:Boolean(window.EstudiemosAndroid)});
  const current=(version,id)=>!disposed&&version===epoch&&id===user()?.id&&eligible();
  const release=()=>{try{handle?.destroy();}catch(_){}handle=null;};
  function clear(){
    epoch++;cancelIdle();cancelIdle=()=>{};clearTimeout(timer);timer=0;abort?.abort();abort=null;release();
    host?.remove();host=null;document.body.classList.remove('ad-banner-active','ad-banner-managed');owner='';phase='idle';
  }
  function styles(){
    if(stylePromise)return stylePromise;
    stylePromise=new Promise((resolve,reject)=>{
      const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('styles/ad-banner.css?v=20261102',root);
      const timeout=setTimeout(()=>{link.remove();reject(new Error('AD_STYLE_TIMEOUT'));},8000);
      link.onload=()=>{clearTimeout(timeout);resolve();};link.onerror=()=>{clearTimeout(timeout);link.remove();reject(new Error('AD_STYLE_UNAVAILABLE'));};document.head.append(link);
    });
    return stylePromise;
  }
  function failed(version,id){
    if(version!==epoch)return;
    clear();if(user()?.id===id&&eligible()){owner=id;phase='empty';}
  }
  async function load(version,id){
    try{
      if(!current(version,id))return;
      const provider=await import('./ad-provider.js');
      if(!current(version,id))return;
      if(provider.configured!==true){phase='unconfigured';return;}
      if(provider.supportsOrigin&&!provider.supportsOrigin(location.origin)){phase='unsupported-origin';return;}
      await styles();if(!current(version,id))return;
      let slot=null;
      if(provider.managedLayout){document.body.classList.add('ad-banner-managed');needsCleanNavigation=provider.requiresCleanNavigation===true;}
      else{
        host=document.createElement('aside');host.className='ad-banner';host.setAttribute('aria-label','Publicidad');
        const label=document.createElement('span');label.className='ad-banner__label';label.textContent='Publicidad';
        slot=document.createElement('div');slot.className='ad-banner__slot';host.append(label,slot);
        document.body.append(host);document.body.classList.add('ad-banner-active');
      }
      abort=new AbortController();phase='loading';
      timer=setTimeout(()=>failed(version,id),12000);
      // The adapter receives no account, email, token, tasks or course information.
      const result=await provider.mount({slot,signal:abort.signal});
      if(!current(version,id)){try{result?.destroy();}catch(_){}return;}
      clearTimeout(timer);timer=0;
      if(!result||typeof result.destroy!=='function'){failed(version,id);return;}
      handle=result;phase=result.status==='ready'?'ready':'visible';
    }catch(_){failed(version,id);}
  }
  function refresh(){
    if(disposed||phase==='reloading')return;
    if(!eligible()){clear();if(needsCleanNavigation){phase='reloading';location.reload();}return;}
    const id=user().id;
    if(owner===id&&phase!=='idle')return;
    if(needsCleanNavigation&&owner!==id){clear();phase='reloading';location.reload();return;}
    clear();owner=id;phase='scheduled';const version=epoch;
    if(window.requestIdleCallback){const idle=window.requestIdleCallback(()=>load(version,id),{timeout:1500});cancelIdle=()=>window.cancelIdleCallback(idle);}
    else{const idle=setTimeout(()=>load(version,id),0);cancelIdle=()=>clearTimeout(idle);}
  }
  const events=['estudiemos:account-ready','estudiemos:account-change','estudiemos:ads-consent-change'];
  events.forEach(name=>window.addEventListener(name,refresh));
  function destroy(){disposed=true;tcf.stop();clear();events.forEach(name=>window.removeEventListener(name,refresh));}
  window.EstudiemosAdBanner=Object.freeze({refresh,destroy,status:()=>phase});
  refresh();
})();
