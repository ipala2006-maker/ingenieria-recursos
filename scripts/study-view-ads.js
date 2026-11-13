import '/shared/ads.js';
import '/scripts/cmp-preferences.js?v=20261113';
import {observeBrowserAdConsent} from '/scripts/ad-consent.js?v=20261104b';
import {approvedPlacement,inPilotAudience,publisher} from '/shared/study-ad-config.js?v=20261113';

const view = document.body.dataset.studyView;
const placement = () => approvedPlacement(window.EstudiemosRelease?.enabled('ads'),view,new URL(location.href));
const host = document.querySelector('[data-study-placement]');
const browser = () => window.top === window && !window.EstudiemosAndroid &&
  navigator.standalone !== true && matchMedia('(display-mode: browser)').matches;

const marker=document.querySelector('[data-ad-viewport-marker]');
if (host && marker && placement() && browser() && typeof IntersectionObserver==='function') {
  const rules=window.EstudiemosAds;
  let active=null, attempted=false, consent, adOwner=null, nearViewport=false, sdkStarted=false;
  const owner=()=>window.EstudiemosReportSession?.identity();
  const stop=()=>{
    active?.abort();
    active=null;
    host.hidden=true;
    host.replaceChildren();
  };
  const allowed=()=>Boolean(placement()&&browser()&&owner()&&owner()!=='guest'&&consent?.getStatus()==='granted');
  const eligible=()=>allowed()&&window.EstudiemosReport?.hasContent();
  async function update(){
    if(sdkStarted&&(!allowed()||adOwner!==owner())){
      sdkStarted=false;stop();location.reload();return;
    }
    if(!eligible()){stop();return;}
    if(attempted||active||!nearViewport||document.hidden||innerWidth<360||innerHeight<620)return;
    attempted=true;
    const controller=new AbortController();
    active=controller;
    const deadline=setTimeout(()=>controller.abort(),8000);
    try{
      const session=window.EstudiemosReportSession;
      const user=await session.verifyUser(controller.signal);
      if(controller.signal.aborted||!eligible()||document.hidden||user?.id!==session.identity()||
          !inPilotAudience(user)||
          !rules.eligible({enabled:true,user,consent:consent.getStatus()}))return;
      adOwner=user.id;
      const unit=document.createElement('ins');
      unit.className='adsbygoogle';
      unit.dataset.adClient=publisher;
      unit.dataset.adSlot=placement().slot;
      unit.dataset.adFormat='horizontal';
      const script=document.createElement('script');
      script.async=true;
      script.crossOrigin='anonymous';
      script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+publisher;
      await new Promise((resolve,reject)=>{
        const abort=()=>{script.remove();reject(new Error('AD_CANCELLED'));};
        controller.signal.addEventListener('abort',abort,{once:true});
        script.onload=()=>{
          controller.signal.removeEventListener('abort',abort);
          try{
            if(!controller.signal.aborted&&eligible()&&!document.hidden){
              host.append(unit);host.hidden=false;
              (window.adsbygoogle=window.adsbygoogle||[]).push({});
            }
            resolve();
          }catch(error){reject(error);}
        };
        script.onerror=()=>{controller.signal.removeEventListener('abort',abort);reject(new Error('AD_UNAVAILABLE'));};
        sdkStarted=true;
        document.head.append(script);
      });
    }catch(_){if(active===controller)stop();}
    finally{
      clearTimeout(deadline);
      if(active===controller)active=null;
    }
  }
  function start(){
    if(consent)return;
    consent=observeBrowserAdConsent(update);
    update();
  }
  window.addEventListener('estudiemos:report-updated',update);
  window.addEventListener('estudiemos:report-session-ready',update);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  window.addEventListener('pagehide',stop);
  window.addEventListener('estudiemos-android-ready',update);
  const observer=new IntersectionObserver(entries=>{
    nearViewport=entries.some(entry=>entry.isIntersecting);
    update();
  },{rootMargin:'160px'});
  observer.observe(marker);
  // The existing CMP writes its own consent; never synthesize a signal or treat false as opt-in.
  const cmp=document.createElement('script');
  cmp.src='/scripts/inmobi-choice-tag.js?v=20261104-global';
  cmp.onload=start;
  document.head.append(cmp);
}
