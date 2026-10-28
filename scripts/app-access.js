(function(){
  if(window.EstudiemosAccess||!window.EstudiemosAccessRules)return;
  const rules=window.EstudiemosAccessRules,root=new URL('../',document.currentScript.src);
  const selectors={pomodoro:'[data-pomodoro-open],[data-home-open="pomodoro"]',progress:'[data-streak-open],[data-home-open="streak"]',workspace:'[data-drive-library-link],[data-account-drive],[data-home-destination="space"],[data-home-shortcut="space"],.workspace-library-title',friends:'[data-friends-open]',inbox:'[data-home-destination="inbox"],[data-home-open="inbox"]',personalLayout:'[data-home-customize]'};
  const labels={pomodoro:'Pomodoro',progress:'Tu progreso',workspace:'Mi espacio',friends:'Amigos',inbox:'Inbox',personalLayout:'Personalizar inicio'};
  let owner='',generation=0,access=rules.resolve(),lastRead=0,loading=null,controller=null,frame=0,preview;
  const account=()=>window.EstudiemosAccount;
  const can=feature=>rules.allows(access,feature);
  function decorate(){
    document.body.dataset.appAccess=access.fullAccess?'full':'free';
    for(const [feature,selector]of Object.entries(selectors))document.querySelectorAll(selector).forEach(node=>{
      const locked=!can(feature);node.dataset.proFeature=feature;
      let badge=node.querySelector('.access-pro-badge');
      if(locked&&!badge){badge=document.createElement('small');badge.className='access-pro-badge';badge.textContent='Pro';badge.setAttribute('aria-hidden','true');node.append(badge);}
      if(badge)badge.hidden=!locked;
      if(!node.dataset.accessLabel)node.dataset.accessLabel=node.getAttribute('aria-label')||node.title||node.textContent.replace(/Pro$/,'').trim();
      node.setAttribute('aria-label',node.dataset.accessLabel+(locked?' · Pro':''));
    });
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(decorate);}
  function publish(value){
    access=value;if(access.fullAccess&&preview)preview.hidden=true;
    if(!can('progress'))document.querySelector('[data-study-goal-dialog][open]')?.close();
    decorate();
    window.dispatchEvent(new CustomEvent('estudiemos:access-change',{detail:access}));
  }
  async function refresh(force=false){
    const user=account()?.getUser(),id=user?.id||'',mode=account()?.getAccessMode?.()||'pilot';
    if(owner!==id){owner=id;generation++;controller?.abort();loading=null;lastRead=0;publish(rules.resolve({mode}));}
    if(access.mode!==mode)publish(rules.resolve({mode}));
    if(mode==='pilot'){if(access.mode!=='pilot')publish(rules.resolve());return access;}
    if(!id){publish(rules.resolve({mode}));return access;}
    if(loading)return force?loading.then(()=>refresh(true)):loading;
    if(!force&&Date.now()-lastRead<60000)return access;
    const version=generation,requestController=new AbortController();controller=requestController;const timeout=setTimeout(()=>requestController.abort(),12000);
    let task;task=(async()=>{
      try{
        const response=await fetch(new URL('api/plan-status?access=1',root),{headers:{Authorization:'Bearer '+account().getSession().access_token},cache:'no-store',signal:requestController.signal});
        const value=await response.json();
        if(version!==generation||owner!==(account()?.getUser()?.id||''))return access;
        if(!response.ok||value.mode!=='restricted')throw new Error('Access unavailable');
        const reason=['subscription','class-owner'].includes(value.reason)?value.reason:'free';
        publish(rules.resolve({mode:'restricted',paidPro:reason==='subscription',ownsClass:reason==='class-owner'}));lastRead=Date.now();
      }catch(_){if(version===generation){publish(rules.resolve({mode:'restricted'}));lastRead=Date.now();}}
      finally{clearTimeout(timeout);if(loading===task)loading=null;}
      return access;
    })();loading=task;return task;
  }
  function showPreview(feature){
    if(!preview){
      preview=document.createElement('section');preview.className='access-feature-preview';preview.setAttribute('aria-labelledby','accessPreviewTitle');
      const copy=document.createElement('div'),title=document.createElement('h2'),text=document.createElement('p'),back=document.createElement('button');
      title.id='accessPreviewTitle';text.textContent='Incluido en Estudiemos Pro.';copy.append(title,text);back.type='button';back.textContent='Volver al calendario';
      back.onclick=()=>{preview.hidden=true;document.querySelector('[data-agenda-open]')?.click();};preview.append(copy,back);
      (document.querySelector('main')||document.body).prepend(preview);
    }
    preview.querySelector('h2').textContent=labels[feature]||'Estudiemos Pro';preview.hidden=false;preview.tabIndex=-1;preview.focus({preventScroll:true});
  }
  window.EstudiemosAccess=Object.freeze({snapshot:()=>access,can,refresh,ownsClass:()=>access.reason==='class-owner',paidPro:()=>access.reason==='subscription'});
  document.addEventListener('click',event=>{
    const node=event.target.closest('[data-pro-feature]');if(!node||can(node.dataset.proFeature))return;
    event.preventDefault();event.stopImmediatePropagation();showPreview(node.dataset.proFeature);
  },true);
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
  for(const name of ['estudiemos:account-ready','estudiemos:account-change'])window.addEventListener(name,()=>refresh());
  window.addEventListener('focus',()=>refresh());
  let ownership='';
  window.addEventListener('estudiemos:classes-updated',()=>{
    const next=(window.EstudiemosClasses?.snapshot()?.classes||[]).filter(course=>['teacher','collaborator'].includes(course.role)).map(course=>course.id).sort().join(',');
    if(next!==ownership){ownership=next;lastRead=0;refresh(true);}
  });
  const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('styles/app-access.css?v=20261028',root);document.head.append(style);
  decorate();if(account())account().whenReady().then(()=>refresh());
})();
