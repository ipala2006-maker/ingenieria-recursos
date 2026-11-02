export const configured=true;
export const managedLayout=true;
export const requiresCleanNavigation=true;
export const client='ca-pub-9605920128105982';
export const supportsOrigin=origin=>origin==='https://estudiemos.ar';

// Official Auto ads anchor, not a manually fixed unit or a publisher-created iframe.
// Import has no vendor side effects. The controller checks Free/Pro and consent first.
export function mount({signal}){
  if(!supportsOrigin(location.origin)||signal.aborted)return Promise.resolve(null);
  if(document.querySelector('script[data-estudiemos-adsense]'))return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.async=true;script.crossOrigin='anonymous';
    script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+client;
    script.dataset.estudiemosAdsense='true';script.setAttribute('data-overlays','collapsed-bottom');
    let settled=false;
    const detach=()=>{script.onload=null;script.onerror=null;signal.removeEventListener('abort',stop);};
    const stop=()=>{detach();script.remove();if(!settled){settled=true;reject(new DOMException('Ad request cancelled','AbortError'));}};
    script.onload=()=>{if(settled)return;settled=true;resolve({status:'ready',destroy:stop});};
    script.onerror=()=>{stop();reject(new Error('ADSENSE_UNAVAILABLE'));};
    signal.addEventListener('abort',stop,{once:true});document.head.append(script);
  });
}
