import {createTimerDepth} from './timer-depth.js?v=20260910-widgets';
import {createProgressDepth} from './progress-depth.js?v=20260910-widgets';

const instances=new WeakMap();
export function enhanceWidget(content) {
  const win=content.ownerDocument.defaultView;
  if(!content.isConnected || win.closed) return;
  const host=content.querySelector('[data-widget-depth],[data-widget-progress]');
  let instance=instances.get(content);
  const reduced=win.matchMedia('(prefers-reduced-motion:reduce)');
  const allowed=host && !reduced.matches && !win.navigator.connection?.saveData;
  if(instance && (instance.host!==host || !allowed)) {instance.dispose();instances.delete(content);instance=null;}
  if(!allowed) return;
  if(!instance) {
    let scene;
    const cleanups=[];
    try {
      if(host.hasAttribute('data-widget-depth')) scene=createTimerDepth(host,{home:true});
      else {
        const days=JSON.parse(host.dataset.widgetProgress), buttons=[...host.querySelectorAll('button')];
        let selected=days.length-1;
        const select=index=>{
          selected=index;
          buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
          content.querySelector('[data-widget-study-detail]').textContent=buttons[index].title;
          scene?.update(days,index);
        };
        scene=createProgressDepth(host,select);
        const click=event=>{const button=event.target.closest('[data-widget-study-day]');if(button)select(Number(button.dataset.widgetStudyDay));};
        const key=event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();
          const index=event.key==='Home'?0:event.key==='End'?days.length-1:Math.max(0,Math.min(days.length-1,selected+(event.key==='ArrowRight'?1:-1)));
          select(index);buttons[index].focus();
        };
        host.addEventListener('click',click);host.addEventListener('keydown',key);
        cleanups.push(()=>{host.removeEventListener('click',click);host.removeEventListener('keydown',key);});
        const reset=content.querySelector('[data-widget-graph-reset]');
        reset.hidden=false;reset.addEventListener('click',scene.reset);
        cleanups.push(()=>{reset.removeEventListener('click',scene.reset);reset.hidden=true;});
        scene.update(days,selected);
      }
      const change=()=>enhanceWidget(content);
      const hide=()=>disposeWidget(content);
      reduced.addEventListener('change',change);win.addEventListener('pagehide',hide,{once:true});
      instance={host,scene,dispose(){scene.dispose();cleanups.forEach(fn=>fn());reduced.removeEventListener('change',change);win.removeEventListener('pagehide',hide);}};
      instances.set(content,instance);
    } catch(_) {scene?.dispose();cleanups.forEach(fn=>fn());return;}
  }
  if(host.hasAttribute('data-widget-depth')) instance.scene.update();
}

export function disposeWidget(content) {
  instances.get(content)?.dispose();instances.delete(content);
}
