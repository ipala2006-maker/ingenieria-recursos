(function(){
  if(window.EstudiemosClasses||!window.EstudiemosClassroomRules)return;
  const rules=window.EstudiemosClassroomRules,root=new URL('../',document.currentScript.src),endpoint=new URL('api/account-config?classes=1',root);
  let owner='',model=null,epoch=0,serial=0,loading=null,writing=false,launching=false,lastRead=0,retryAt=0,failures=0,lastError=null,timer=0,uiPromise,projection=new Map();
  const account=()=>window.EstudiemosAccount;
  const identity=()=>account()?.getUser()?.id||'';
  const emit=()=>{projection.clear();window.dispatchEvent(new CustomEvent('estudiemos:classes-updated'));};
  function snapshot(){return owner&&owner===identity()?model:null;}
  function persist(value){
    if(!value||!/^[a-f0-9]{32}$/.test(value.revision)||!Array.isArray(value.classes)||!Array.isArray(value.calendar))throw new Error('No pudimos validar los datos de Clases.');
    model={revision:value.revision,classes:value.classes,calendar:value.calendar};
    try{localStorage.setItem(rules.CACHE_KEY,JSON.stringify({owner,model}));}catch(_){}
    emit();
  }
  function schedule(){clearTimeout(timer);if(!owner||!model?.classes?.length||document.hidden)return;timer=setTimeout(()=>refresh(),window.EstudiemosClassroomUI?.isOpen()?60000:300000);}
  async function request(action='',data={},detailId=''){
    const current=owner,version=epoch,session=account()?.getSession();
    if(!current||current!==identity()||!session?.access_token)throw new Error('Iniciá sesión para abrir tus clases.');
    const url=new URL(endpoint);if(detailId)url.searchParams.set('id',detailId);else if(!action&&model?.revision)url.searchParams.set('revision',model.revision);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{method:action?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(action?{'Content-Type':'application/json'}:{})},...(action?{body:JSON.stringify({action,...data})}:{}),signal:controller.signal,cache:'no-store',credentials:'same-origin'});
      const result=await response.json();
      if(current!==identity()||version!==epoch)throw new Error('La cuenta cambió. Volvé a abrir Clases.');
      if(!response.ok)throw new Error(result.message||'No pudimos cargar Clases.');
      return result;
    }finally{clearTimeout(timeout);}
  }
  async function refresh(force=false){
    if(!owner||owner!==identity()||writing)return snapshot();
    if(loading)return force?loading.then(value=>{if(lastError)throw lastError;return value;}):loading;
    if(!force&&(document.hidden||Date.now()<retryAt||Date.now()-lastRead<30000))return snapshot();
    const version=++serial;
    const task=(async()=>{
      try{const result=await request();if(version!==serial)return snapshot();if(!result.unchanged)persist(result);lastRead=Date.now();failures=0;retryAt=0;lastError=null;return snapshot();}
      catch(error){if(version!==serial)return snapshot();lastError=error;failures++;retryAt=Date.now()+Math.min(600000,30000*2**Math.min(failures-1,4));if(force)throw error;return snapshot();}
      finally{if(loading===task)loading=null;schedule();}
    })();
    loading=task;
    return loading;
  }
  async function act(action,data={}){
    if(writing)throw new Error('Esperá a que termine el cambio anterior.');
    writing=true;serial++;const version=epoch;
    try{const result=await request(action,data);persist(result);lastRead=Date.now();failures=0;retryAt=0;lastError=null;return result;}
    finally{if(version===epoch){writing=false;schedule();}}
  }
  async function changed(){
    const current=identity();window.EstudiemosCourseRole?.bind(account()?.getUser());if(current===owner){if(!model)refresh();return;}
    owner=current;epoch++;serial++;loading=null;writing=false;model=null;lastRead=0;retryAt=0;failures=0;lastError=null;clearTimeout(timer);
    try{const saved=JSON.parse(localStorage.getItem(rules.CACHE_KEY)||'null');if(current&&saved?.owner===current&&Array.isArray(saved.model?.classes)&&Array.isArray(saved.model?.calendar))model=saved.model;else localStorage.removeItem(rules.CACHE_KEY);}catch(_){}
    emit();if(owner)refresh();
  }
  function events(from,until=from){
    const value=snapshot()||window.EstudiemosCourseInvitation?.pending(identity())?.preview;if(!value)return [];
    const key=from+':'+until;if(!projection.has(key)){if(projection.size>=4)projection.clear();projection.set(key,rules.occurrences(value,from,until));}return projection.get(key);
  }
  async function open(options={}){
    if(location.pathname.endsWith('/widget.html')){const url=new URL('./',root);url.searchParams.set('clase',options.id||'');return window.open(url,'_blank','noopener,noreferrer');}
    launching=true;
    if(!uiPromise)uiPromise=Promise.all([new Promise((resolve,reject)=>{if(document.querySelector('link[href*="styles/classrooms.css"]'))return resolve();const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('styles/classrooms.css?v=20261024-flow',root);css.onload=resolve;css.onerror=reject;document.head.append(css);}),new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('scripts/classrooms.js?v=20261024-flow',root);script.onload=resolve;script.onerror=reject;document.head.append(script);})]).catch(error=>{uiPromise=null;throw error;});
    try{await uiPromise;window.EstudiemosClassroomUI.open(options);}catch(_){window.EstudiemosAccount?.open();}finally{launching=false;}
  }
  window.EstudiemosClasses=Object.freeze({snapshot,events,refresh,act,detail:id=>request('',{},id),open,pendingLaunch:()=>launching});
  if(!location.pathname.endsWith('/widget.html')&&!document.body.classList.contains('teacher-workspace')){
    const button=document.createElement('button');button.type='button';button.className='topbar__link topbar-icon-btn';button.dataset.classesOpen='';button.title='Materias y cátedras';button.setAttribute('aria-label','Abrir materias y cátedras');button.innerHTML=`<img src="${new URL('assets/icons/graduation-cap.svg',root)}" width="20" height="20" alt="">`;
    document.querySelector('.topbar__nav')?.append(button);button.addEventListener('click',()=>open());
  }
  for(const name of ['estudiemos:account-change','estudiemos:account-ready'])window.addEventListener(name,changed);
  window.addEventListener('focus',()=>refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();schedule();});
  window.addEventListener('storage',event=>{
    if(event.key===rules.CACHE_KEY&&owner===identity())try{const cached=JSON.parse(event.newValue||'null');if(cached?.owner===owner&&cached.model){model=cached.model;lastRead=Date.now();emit();schedule();}}catch(_){}
  });
  (async()=>{if(!account())await new Promise(resolve=>window.addEventListener('estudiemos:account-ready',resolve,{once:true}));await account()?.whenReady();await changed();
    if(document.body?.classList.contains('teacher-workspace'))return;
    const url=new URL(location.href),code=rules.invitation(url.href,root.origin),id=url.searchParams.get('clase')||url.searchParams.get('materia'),requested=url.searchParams.has('materias')||url.searchParams.has('clase')||url.searchParams.has('materia');
    if(rules.CODE.test(code)){
      const saved=window.EstudiemosCourseInvitation?.pending(identity());window.EstudiemosCourseInvitation?.save(code,identity(),saved?.code===code?saved.preview:undefined);
      try{sessionStorage.setItem(rules.PENDING_KEY,JSON.stringify({code,auto:true,expires:Date.now()+7*86400000,owner:identity(),...(saved?.code===code?{preview:saved.preview}:{})}));}catch(_){}
      if(!identity()&&!url.searchParams.has('unirme')&&!window.EstudiemosAndroid&&!matchMedia('(display-mode: standalone)').matches&&!navigator.standalone){const install=new URL('instalar.html',root);if(['127.0.0.1','localhost'].includes(install.hostname))install.searchParams.set('local','1');install.hash='materia='+code;return location.replace(install);}
      if(!window.EstudiemosCourseRole?.get())window.EstudiemosCourseRole?.set('student');
      const hash=new URLSearchParams(url.hash.slice(1));hash.delete('clase');hash.delete('materia');url.hash=hash.toString();url.searchParams.delete('materia');url.searchParams.delete('unirme');history.replaceState(history.state,'',url);open({join:code,autoJoin:true});
    }
    else if(requested){const uploadId=url.searchParams.get('uploadClass'),upload=url.searchParams.get('drive')==='connected';url.searchParams.delete('clase');url.searchParams.delete('materia');url.searchParams.delete('materias');url.searchParams.delete('uploadClass');url.searchParams.delete('drive');history.replaceState(history.state,'',url);if(uploadId)await refresh(true);open({id:rules.UUID.test(uploadId||id||'')?(uploadId||id):'',upload});}
    else try{const pending=window.EstudiemosCourseInvitation?.pending(identity())||JSON.parse(sessionStorage.getItem(rules.PENDING_KEY)||'null');if(pending?.expires>Date.now()&&(!pending.owner||pending.owner===identity())){if(!window.EstudiemosCourseRole?.get())window.EstudiemosCourseRole?.set('student');open({join:pending.code,autoJoin:pending.auto===true});}else{sessionStorage.removeItem(rules.PENDING_KEY);if(window.EstudiemosCourseRole?.get()==='teacher'&&document.body.classList.contains('workspace-home')&&!document.body.classList.contains('drive-library-page')&&!url.search&&!url.hash)location.replace(window.EstudiemosCourseRole.teacherUrl());}}catch(_){}
  })();
})();
