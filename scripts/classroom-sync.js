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
    const current=identity();if(current===owner){if(!model)refresh();return;}
    owner=current;epoch++;serial++;loading=null;writing=false;model=null;lastRead=0;retryAt=0;failures=0;lastError=null;clearTimeout(timer);
    try{const saved=JSON.parse(localStorage.getItem(rules.CACHE_KEY)||'null');if(current&&saved?.owner===current&&Array.isArray(saved.model?.classes)&&Array.isArray(saved.model?.calendar))model=saved.model;else localStorage.removeItem(rules.CACHE_KEY);}catch(_){}
    emit();if(owner)refresh();
  }
  function events(from,until=from){
    const value=snapshot();if(!value)return [];
    const key=from+':'+until;if(!projection.has(key)){if(projection.size>=4)projection.clear();projection.set(key,rules.occurrences(value,from,until));}return projection.get(key);
  }
  async function open(options={}){
    if(location.pathname.endsWith('/widget.html')){const url=new URL('./',root);url.searchParams.set('clase',options.id||'');return window.open(url,'_blank','noopener,noreferrer');}
    launching=true;
    if(!uiPromise)uiPromise=Promise.all([new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('styles/classrooms.css?v=20261024',root);css.onload=resolve;css.onerror=reject;document.head.append(css);}),new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('scripts/classrooms.js?v=20261024',root);script.onload=resolve;script.onerror=reject;document.head.append(script);})]).catch(error=>{uiPromise=null;throw error;});
    try{await uiPromise;window.EstudiemosClassroomUI.open(options);}catch(_){window.EstudiemosAccount?.open();}finally{launching=false;}
  }
  window.EstudiemosClasses=Object.freeze({snapshot,events,refresh,act,detail:id=>request('',{},id),open,pendingLaunch:()=>launching});
  if(!location.pathname.endsWith('/widget.html')){
    const button=document.createElement('button');button.type='button';button.className='topbar__link topbar-icon-btn';button.dataset.classesOpen='';button.title='Clases · Profesores y alumnos';button.setAttribute('aria-label','Abrir clases');button.innerHTML=`<img src="${new URL('assets/icons/graduation-cap.svg',root)}" width="20" height="20" alt="">`;
    document.querySelector('.topbar__nav')?.append(button);button.addEventListener('click',()=>open());
  }
  for(const name of ['estudiemos:account-change','estudiemos:account-ready'])window.addEventListener(name,changed);
  window.addEventListener('focus',()=>refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();schedule();});
  window.addEventListener('storage',event=>{
    if(event.key===rules.CACHE_KEY&&owner===identity())try{const cached=JSON.parse(event.newValue||'null');if(cached?.owner===owner&&cached.model){model=cached.model;lastRead=Date.now();emit();schedule();}}catch(_){}
  });
  (async()=>{if(!account())await new Promise(resolve=>window.addEventListener('estudiemos:account-ready',resolve,{once:true}));await account()?.whenReady();await changed();
    const url=new URL(location.href),code=rules.code(new URLSearchParams(url.hash.slice(1)).get('clase')||''),id=url.searchParams.get('clase');
    if(rules.CODE.test(code)){try{sessionStorage.setItem(rules.PENDING_KEY,JSON.stringify({code,expires:Date.now()+86400000,owner:identity()}));}catch(_){}const hash=new URLSearchParams(url.hash.slice(1));hash.delete('clase');url.hash=hash.toString();history.replaceState(history.state,'',url);open({join:code});}
    else if(id!==null){url.searchParams.delete('clase');history.replaceState(history.state,'',url);open({id:rules.UUID.test(id)?id:''});}
    else try{const pending=JSON.parse(sessionStorage.getItem(rules.PENDING_KEY)||'null');if(pending?.expires>Date.now()&&(!pending.owner||pending.owner===identity()))open({join:pending.code});else sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}
  })();
})();
