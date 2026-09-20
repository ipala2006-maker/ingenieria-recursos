(function(){
  const dialog=document.querySelector('[data-home-customizer]'),trigger=document.querySelector('[data-home-customize]'),page=document.querySelector('.workspace-page'),board=window.EstudiemosHomeBoard;
  if(!dialog||!trigger||!page||!board)return;
  const KEY='estudiemos_home_layout',spaces=[['focus','Pomodoro',240],['progress','Tu progreso',300],['assistant','Organizador IA',260],['shortcuts','Accesos rápidos',64],['workspace','Mi espacio',280],['calendar','Calendario',340],['inbox','Inbox',280]];
  const mobile=matchMedia('(max-width:700px), (min-width:701px) and (max-width:900px) and (max-height:899px)');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)'),nodes=new Map(spaces.map(([key])=>[key,document.querySelector(`[data-home-space="${key}"]`)])),list=dialog.querySelector('[data-home-customizer-spaces]');
  let editing=false,gesture=null,frame=0,lastLayout=null,splitButtons=[];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(n,min,max,fallback)=>Number.isFinite(Number(n))&&n!=null?Math.max(min,Math.min(max,Number(n))):fallback;
  document.body.classList.add('home-resizable');
  list.innerHTML=spaces.map(([key,label,min])=>`<div class="home-customizer__item"><label class="home-customizer__space"><strong>${label}</strong><input type="checkbox" value="${key}" aria-label="Mostrar ${label}"></label>${key==='shortcuts'?'':`<div class="home-customizer__dimensions" data-dimensions="${key}"><label>Alto<input type="range" min="${min}" max="720" step="1" data-height="${key}" aria-label="Alto de ${label}"><output data-size-label="${key}"></output></label></div>`}</div>`).join('');
  const done=document.createElement('button');done.type='button';done.className='home-layout-done';done.textContent='Listo';done.hidden=true;trigger.after(done);
  const manage=document.createElement('button');manage.type='button';manage.className='home-layout-manage';manage.textContent='Herramientas';manage.hidden=true;trigger.after(manage);
  const separators=document.createElement('div');separators.className='home-board-separators';page.appendChild(separators);
  function read(){
    let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(_){}
    const visible={},sizes={};for(const [key,,min] of spaces){visible[key]=saved.visible?.[key]!==false;sizes[key]={mobileHeight:clamp(saved.sizes?.[key]?.mobileHeight,min,720,min)};}
    return {version:3,density:saved.density==='compact'?'compact':'comfortable',visible,sizes,tree:board.sanitize(saved.tree)};
  }
  function store(value){localStorage.setItem(KEY,JSON.stringify(value));window.dispatchEvent(new CustomEvent('estudiemos:data-change',{detail:{key:KEY}}));window.dispatchEvent(new CustomEvent('estudiemos:home-customized',{detail:value}));}
  function moveBox(node,r,animate){
    const old=animate?node.getBoundingClientRect():null;
    if(animate)node.getAnimations().forEach(a=>a.cancel());
    node.style.left=`${r.x}px`;node.style.top=`${r.y}px`;node.style.width=`${r.w}px`;node.style.height=`${r.h}px`;
    if(old&&!reduced.matches){const next=node.getBoundingClientRect();node.getAnimations().forEach(a=>a.cancel());node.animate([{transform:`translate(${old.x-next.x}px,${old.y-next.y}px)`},{transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});}
  }
  function apply(value=read(),animate=false){
    document.body.dataset.homeDensity=value.density;document.body.classList.toggle('home-board',!mobile.matches);
    for(const [key,node] of nodes){if(!node)continue;node.classList.toggle('home-space-disabled',!value.visible[key]);node.setAttribute('aria-hidden',String(!value.visible[key]));
      if(key==='shortcuts')continue;
      if(mobile.matches){for(const prop of ['left','top','width','height'])node.style.removeProperty(prop);node.style.setProperty('--home-tool-height',`${value.sizes[key].mobileHeight}px`);delete node.dataset.boardCompact;}
    }
    document.body.dataset.homeToolCount=String(['focus','progress','assistant'].filter(k=>value.visible[k]).length);
    separators.hidden=mobile.matches||!editing;
    if(mobile.matches){lastLayout=null;return;}
    lastLayout=board.layout(value.tree,page.clientWidth,Math.max(1,page.clientHeight-64),value.visible);
    for(const [key,r] of Object.entries(lastLayout.boxes)){
      const node=nodes.get(key);moveBox(node,{...r,y:r.y+54},animate);node.dataset.boardCompact=r.h<280?'true':'false';
      const x=board.boundary(lastLayout.splits,key,'x'),y=board.boundary(lastLayout.splits,key,'y'),handle=node.querySelector('[data-home-resize]');
      handle.dataset.left=String(!!x?.second.includes(key));handle.dataset.top=String(!!y?.second.includes(key));handle.disabled=!x&&!y;
    }
    renderSeparators();
  }
  function form(value=read()){
    for(const [key] of spaces){list.querySelector(`input[value="${key}"]`).checked=value.visible[key];const input=list.querySelector(`[data-height="${key}"]`);if(input){input.value=value.sizes[key].mobileHeight;list.querySelector(`[data-size-label="${key}"]`).textContent=`${input.value} px`;list.querySelector(`[data-dimensions="${key}"]`).hidden=!mobile.matches||!value.visible[key];}}
    dialog.querySelector(`[name="homeDensity"][value="${value.density}"]`).checked=true;
  }
  function setEditing(on){editing=on;document.body.classList.toggle('home-layout-editing',on);done.hidden=!on;manage.hidden=!on;trigger.setAttribute('aria-pressed',String(on));
    for(const [key,node] of nodes)if(key!=='shortcuts'&&node){node.querySelector('[data-home-resize]').hidden=!on;node.querySelector('[data-home-move]').hidden=!on||mobile.matches;}apply();}
  function begin(event,kind,key,paths=[]){
    if(event.button!==0||!event.isPrimary)return;event.preventDefault();const value=read(),node=nodes.get(key);
    gesture={kind,key,paths,value,start:clone(value),x:event.clientX,y:event.clientY,id:event.pointerId,target:event.currentTarget,rect:node?.getBoundingClientRect(),layout:lastLayout};
    node?.style.setProperty('--home-drag-x','0px');node?.style.setProperty('--home-drag-y','0px');
    event.currentTarget.setPointerCapture(event.pointerId);document.body.classList.add('home-board-dragging');node?.classList.add(kind==='move'?'home-tool-moving':'is-resizing');
  }
  function change(event){if(!gesture||gesture.id!==event.pointerId)return;gesture.pointer={x:event.clientX,y:event.clientY};cancelAnimationFrame(frame);frame=requestAnimationFrame(updateGesture);}
  function updateGesture(){
    if(!gesture?.pointer)return;const g=gesture,p=g.pointer;
    if(g.kind==='move'){
      const source=nodes.get(g.key),box=g.layout.boxes[g.key];
      source.style.setProperty('--home-drag-x',`${clamp(p.x-g.x,-box.x,page.clientWidth-box.x-box.w,0)}px`);
      source.style.setProperty('--home-drag-y',`${clamp(p.y-g.y,-box.y,page.clientHeight-64-box.y-box.h,0)}px`);
      const pageBox=page.getBoundingClientRect(),target=Object.entries(g.layout.boxes).find(([key,r])=>key!==g.key&&p.x>=pageBox.x+r.x&&p.x<=pageBox.x+r.x+r.w&&p.y>=pageBox.y+r.y+54&&p.y<=pageBox.y+r.y+54+r.h);
      g.drop=target?.[0];for(const [key,node] of nodes)node?.classList.toggle('home-drop-target',key===g.drop);return;
    }
    if(mobile.matches)g.value.sizes[g.key].mobileHeight=clamp(g.rect.height+p.y-g.y,spaces.find(s=>s[0]===g.key)[2],720,300);
    else for(const s of g.paths){const delta=s.axis==='x'?p.x-g.x:p.y-g.y;board.setRatio(g.value.tree,s.path,clamp(s.ratio+delta/s.available,s.low,s.high,s.ratio));}
    apply(g.value);
  }
  function finish(event){
    if(!gesture||gesture.id!==event.pointerId)return;cancelAnimationFrame(frame);updateGesture();const g=gesture;gesture=null;
    if(g.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);
    const moved=g.kind==='move'?nodes.get(g.key).getBoundingClientRect():null;
    document.body.classList.remove('home-board-dragging');for(const node of nodes.values())node?.classList.remove('is-resizing','home-drop-target','home-tool-moving');
    if(event.type==='pointercancel'){apply(g.start,true);return;}
    if(g.kind==='move'&&g.drop)g.value.tree=board.swap(g.value.tree,g.key,g.drop);
    apply(g.value,g.kind==='move');store(g.value);
    if(moved&&!reduced.matches){const node=nodes.get(g.key);node.getAnimations().forEach(a=>a.cancel());const next=node.getBoundingClientRect();node.animate([{transform:`translate(${moved.x-next.x}px,${moved.y-next.y}px)`},{transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});}
  }
  function wire(button){button.addEventListener('pointermove',change);for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,finish);}
  function renderSeparators(){
    const splits=lastLayout?.splits||[];
    if(splitButtons.length!==splits.length){separators.replaceChildren();splitButtons=splits.map(()=>{const button=document.createElement('button');button.type='button';button.className='home-board-divider';button.setAttribute('role','separator');button.tabIndex=0;wire(button);separators.appendChild(button);
      button.addEventListener('pointerdown',e=>{const s=lastLayout.splits[Number(button.dataset.index)];begin(e,'resize',null,[s]);});
      button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const s=lastLayout.splits[Number(button.dataset.index)],value=read();board.setRatio(value.tree,s.path,s.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*16/s.available);apply(value);store(value);});return button;});}
    splits.forEach((s,i)=>{const button=splitButtons[i],d=s.available*s.ratio;button.dataset.index=i;button.dataset.axis=s.axis;button.setAttribute('aria-orientation',s.axis==='x'?'vertical':'horizontal');button.setAttribute('aria-label','Repartir espacio entre herramientas');button.setAttribute('aria-valuenow',String(Math.round(s.ratio*100)));button.setAttribute('aria-valuemin',String(Math.round(s.low*100)));button.setAttribute('aria-valuemax',String(Math.round(s.high*100)));
      Object.assign(button.style,s.axis==='x'?{left:`${s.x+d-2}px`,top:`${s.y+54}px`,width:'12px',height:`${s.h}px`}:{left:`${s.x}px`,top:`${s.y+d+52}px`,width:`${s.w}px`,height:'12px'});});
  }
  for(const [key,label] of spaces){const node=nodes.get(key);if(!node||key==='shortcuts')continue;
    const handle=document.createElement('button');handle.type='button';handle.className='home-resize-handle';handle.dataset.homeResize=key;handle.hidden=true;handle.title=`Cambiar tamaño de ${label}`;handle.setAttribute('aria-label',handle.title);handle.innerHTML='<span aria-hidden="true">⌟</span>';node.appendChild(handle);wire(handle);
    handle.addEventListener('pointerdown',e=>begin(e,'resize',key,['x','y'].map(axis=>board.boundary(lastLayout?.splits||[],key,axis)).filter(Boolean)));
    handle.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();const value=read();if(mobile.matches)value.sizes[key].mobileHeight=clamp(value.sizes[key].mobileHeight+(e.key==='ArrowUp'?-16:16),spaces.find(s=>s[0]===key)[2],720,300);else{const s=board.boundary(lastLayout.splits,key,['ArrowLeft','ArrowRight'].includes(e.key)?'x':'y');if(s)board.setRatio(value.tree,s.path,s.ratio+(['ArrowUp','ArrowLeft'].includes(e.key)?-16:16)/s.available);}apply(value);store(value);});
    const move=document.createElement('button');move.type='button';move.className='home-move-handle';move.dataset.homeMove=key;move.hidden=true;move.title=`Mover ${label}`;move.setAttribute('aria-label',move.title);move.innerHTML='<span aria-hidden="true">⠿</span>';node.appendChild(move);wire(move);move.addEventListener('pointerdown',e=>begin(e,'move',key));
    move.addEventListener('keydown',e=>{if(!e.key.startsWith('Arrow')||!lastLayout)return;e.preventDefault();const value=read(),keys=Object.keys(lastLayout.boxes),i=keys.indexOf(key),next=keys[(i+(['ArrowLeft','ArrowUp'].includes(e.key)?keys.length-1:1))%keys.length];value.tree=board.swap(value.tree,key,next);apply(value,true);store(value);});
  }
  trigger.addEventListener('click',()=>setEditing(!editing));done.addEventListener('click',()=>setEditing(false));manage.addEventListener('click',()=>{form();dialog.showModal();});
  dialog.querySelector('[data-home-customizer-edit]').addEventListener('click',()=>{dialog.close();setEditing(true);});
  list.addEventListener('input',e=>{const value=read();if(e.target.type==='checkbox')value.visible[e.target.value]=e.target.checked;else if(e.target.dataset.height)value.sizes[e.target.dataset.height].mobileHeight=Number(e.target.value);apply(value,true);store(value);form(value);});
  dialog.querySelectorAll('[name="homeDensity"]').forEach(input=>input.addEventListener('change',()=>{const value=read();value.density=input.value;apply(value);store(value);}));
  dialog.querySelector('[data-home-customizer-reset]').addEventListener('click',()=>{const value=read();value.tree=board.defaults();value.density='comfortable';spaces.forEach(([k,,min])=>{value.visible[k]=true;value.sizes[k].mobileHeight=min;});apply(value,true);store(value);form(value);});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  window.addEventListener('storage',e=>{if(e.key===KEY&&!gesture)apply(undefined,true);});window.addEventListener('estudiemos:cloud-restored',()=>{if(!gesture)apply(undefined,true);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});setEditing(false);}});
  mobile.addEventListener('change',()=>{if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});setEditing(editing);});
  new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!gesture)apply();});}).observe(page);apply();
})();
