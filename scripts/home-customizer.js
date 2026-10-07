(function(){
  const dialog=document.querySelector('[data-home-customizer]'),trigger=document.querySelector('[data-home-customize]'),page=document.querySelector('.workspace-page'),board=window.EstudiemosHomeBoard;
  if(!dialog||!trigger||!page||!board)return;
  const layoutStorage=window.EstudiemosHomeLayout,KEY=layoutStorage.key,spaces=[['focus','Pomodoro',240],['progress','Tu progreso',300],['assistant','Organizador IA',260],['shortcuts','Accesos rápidos',64],['workspace','Mi espacio',280],['calendar','Calendario',340],['inbox','Inbox',280]];
  const mobile=matchMedia('(max-width:700px), (min-width:701px) and (max-width:900px) and (max-height:899px)');
  const available=key=>window.EstudiemosRelease?.homeSpaceEnabled?.(key) ?? (key==='assistant'?window.EstudiemosRelease?.enabled('ai')===true:key==='workspace'?window.EstudiemosRelease?.enabled('workspace')===true:true);
  const effectiveVisibility=visible=>Object.fromEntries(spaces.map(([key])=>[key,available(key)&&visible[key]!==false]));
  const reduced=matchMedia('(prefers-reduced-motion:reduce)'),nodes=new Map(spaces.map(([key])=>[key,document.querySelector(`[data-home-space="${key}"]`)])),list=dialog.querySelector('[data-home-customizer-spaces]');
  let editing=false,gesture=null,frame=0,lastLayout=null,undoValue=null,armed=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(n,min,max,fallback)=>Number.isFinite(Number(n))&&n!=null?Math.max(min,Math.min(max,Number(n))):fallback;
  document.body.classList.add('home-resizable');
  list.innerHTML=spaces.filter(([key])=>available(key)).map(([key,label,min])=>`<div class="home-customizer__item"><label class="home-customizer__space"><strong>${label}</strong><input type="checkbox" value="${key}" aria-label="Mostrar ${label}"></label>${key==='shortcuts'?'':`<div class="home-customizer__dimensions" data-dimensions="${key}"><label>Alto<input type="range" min="${min}" max="720" step="1" data-height="${key}" aria-label="Alto de ${label}"><output data-size-label="${key}"></output></label></div><div class="home-customizer__position" data-position="${key}">${[['x','Horizontal'],['y','Vertical'],['w','Ancho'],['h','Alto']].map(([field,name])=>`<label>${name}<input type="number" min="0" step="8" data-box="${key}" data-field="${field}" aria-label="${name} de ${label}"></label>`).join('')}</div>`}</div>`).join('');
  function button(className,text,label){const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;b.hidden=true;if(label){b.title=label;b.setAttribute('aria-label',label);}trigger.after(b);return b;}
  list.querySelectorAll('[data-box]').forEach(input=>{input.step='1';});
  list.querySelectorAll('[data-position]').forEach(fields=>{
    const details=document.createElement('details'),summary=document.createElement('summary');
    details.className='home-customizer__precision';details.dataset.position=fields.dataset.position;delete fields.dataset.position;
    summary.textContent='Posición y tamaño';fields.before(details);details.append(summary,fields);
  });
  const done=button('home-layout-done','Listo'),manage=button('home-layout-manage','Herramientas'),undo=button('home-layout-undo','↶','Deshacer último ajuste');
  const toolbar=document.createElement('div');toolbar.className='home-layout-toolbar';toolbar.hidden=true;toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Editar distribución');trigger.after(toolbar);toolbar.append(undo,manage,done);
  const overlay=document.createElement('div');overlay.className='home-board-guides';overlay.setAttribute('aria-hidden','true');page.appendChild(overlay);
  const status=document.createElement('div');status.className='home-layout-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');page.appendChild(status);
  const dialogStatus=document.createElement('p');dialogStatus.className='home-layout-dialog-status';dialogStatus.setAttribute('role','status');dialog.querySelector('footer').before(dialogStatus);
  function announce(text=''){status.textContent=dialog.open?'':text;dialogStatus.textContent=dialog.open?text:'';}
  function read(){
    const saved=layoutStorage.read();
    const visible={},sizes={};for(const [key,,min] of spaces){visible[key]=saved.visible?.[key]!==false;sizes[key]={mobileHeight:clamp(saved.sizes?.[key]?.mobileHeight,min,720,min)};}
    return {version:4,density:saved.density==='compact'?'compact':'comfortable',visible,sizes,tree:board.sanitize(saved.tree),placement:saved.placement||null};
  }
  function store(value){layoutStorage.write(value);window.dispatchEvent(new CustomEvent('estudiemos:home-customized',{detail:value}));}
  function save(value,before=read()){undoValue=clone(before);undo.disabled=false;store(value);}
  function prepare(value=read()){if(lastLayout)value.placement=board.remember(lastLayout,value.placement,value.tree);return value;}
  function moveBox(node,r,animate){
    const old=animate?node.getBoundingClientRect():null;node.getAnimations().forEach(a=>a.cancel());
    Object.assign(node.style,{left:`${r.x}px`,top:`${r.y+54}px`,width:`${r.w}px`,height:`${r.h}px`});
    if(old&&!reduced.matches){const next=node.getBoundingClientRect();node.animate([{transform:`translate(${old.x-next.x}px,${old.y-next.y}px)`},{transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});}
  }
  function apply(value=read(),animate=false){
    document.body.dataset.homeDensity=value.density;document.body.classList.toggle('home-board',!mobile.matches);
    const visible=effectiveVisibility(value.visible);
    for(const [key,node] of nodes){if(!node)continue;node.classList.toggle('home-space-disabled',!visible[key]);node.setAttribute('aria-hidden',String(!visible[key]));
      if(key==='shortcuts')continue;
      if(mobile.matches){for(const prop of ['left','top','width','height'])node.style.removeProperty(prop);node.style.setProperty('--home-tool-height',`${value.sizes[key].mobileHeight}px`);delete node.dataset.boardCompact;}
    }
    document.body.dataset.homeToolCount=String(['focus','progress','assistant'].filter(k=>visible[k]).length);
    if(mobile.matches){lastLayout=null;return;}
    lastLayout=board.freeLayout(value.placement,value.tree,page.clientWidth,Math.max(1,page.clientHeight-64),visible);
    for(const [key,r] of Object.entries(lastLayout.boxes)){const node=nodes.get(key);moveBox(node,r,animate);node.dataset.boardCompact=r.h<280?'true':'false';}
  }
  function form(value=read()){
    for(const [key] of spaces){
      const toggle=list.querySelector(`input[value="${key}"]`);if(!toggle)continue;toggle.checked=value.visible[key];const input=list.querySelector(`[data-height="${key}"]`);if(!input)continue;
      input.value=value.sizes[key].mobileHeight;list.querySelector(`[data-size-label="${key}"]`).textContent=`${input.value} px`;
      list.querySelector(`[data-dimensions="${key}"]`).hidden=!mobile.matches||!value.visible[key];list.querySelector(`[data-position="${key}"]`).hidden=mobile.matches||!value.visible[key];
      const box=lastLayout?.boxes[key];if(box)for(const field of ['x','y','w','h'])list.querySelector(`[data-box="${key}"][data-field="${field}"]`).value=Math.round(box[field]);
    }
    dialog.querySelector(`[name="homeDensity"][value="${value.density}"]`).checked=true;
  }
  function select(key){armed=key;for(const [k,node] of nodes){node?.classList.toggle('home-tool-selected',k===key);node?.querySelector('[data-home-move]')?.setAttribute('aria-pressed',String(k===key));}}
  function findSwapTarget(key,pointer){
    if(!pointer||mobile.matches)return null;
    let best=null;
    for(const [other,node] of nodes){
      if(other===key||other==='shortcuts'||!node||node.classList.contains('home-space-disabled'))continue;
      const handle=node.querySelector('[data-home-move]');
      if(!handle||handle.hidden)continue;
      const r=handle.getBoundingClientRect(),pad=10;
      if(pointer.x<r.left-pad||pointer.x>r.right+pad||pointer.y<r.top-pad||pointer.y>r.bottom+pad)continue;
      const score=Math.hypot(pointer.x-(r.left+r.width/2),pointer.y-(r.top+r.height/2));
      if(!best||score<best.score)best={key:other,score};
    }
    return best?.key||null;
  }
  function markSwapTarget(target,key){
    for(const [other,node] of nodes){
      if(!node)continue;
      node.classList.toggle('home-swap-target',other===target);
      node.classList.toggle('home-swap-source',Boolean(target)&&other===key);
    }
  }
  function setEditing(on){
    if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});
    editing=on;select(null);announce();document.body.classList.toggle('home-layout-editing',on);toolbar.hidden=!on;done.hidden=!on;manage.hidden=!on;undo.hidden=!on;undo.disabled=!undoValue;trigger.setAttribute('aria-pressed',String(on));
    for(const [key,node] of nodes)if(key!=='shortcuts'&&node){node.querySelectorAll('.home-resize-handle').forEach(handle=>{handle.hidden=!on||(mobile.matches&&handle.dataset.edge!=='se');});node.querySelector('[data-home-move]').hidden=!on||mobile.matches;}apply();
  }
  function begin(event,kind,key){
    if(event.button!==0||!event.isPrimary||!editing)return;event.preventDefault();announce();
    const start=read(),value=prepare(clone(start)),node=nodes.get(key);node.getAnimations().forEach(a=>a.cancel());
    gesture={kind,key,edge:event.currentTarget.dataset.edge||'se',value,start,x:event.clientX,y:event.clientY,id:event.pointerId,target:event.currentTarget,rect:node.getBoundingClientRect(),layout:lastLayout};
    event.currentTarget.setPointerCapture(event.pointerId);document.body.classList.add('home-board-dragging');node.classList.add(kind==='move'?'home-tool-moving':'is-resizing');
  }
  function change(event){if(!gesture||gesture.id!==event.pointerId)return;gesture.pointer={x:event.clientX,y:event.clientY,snap:!event.altKey};cancelAnimationFrame(frame);frame=requestAnimationFrame(updateGesture);}
  function updateGesture(){
    if(!gesture?.pointer)return;const g=gesture,p=g.pointer;
    if(mobile.matches){g.value.sizes[g.key].mobileHeight=clamp(g.rect.height+p.y-g.y,spaces.find(s=>s[0]===g.key)[2],720,300);apply(g.value);return;}
    const l=g.layout,swapTarget=g.kind==='move'?findSwapTarget(g.key,p):null;
    g.swapTarget=swapTarget;markSwapTarget(swapTarget,g.key);
    if(swapTarget){
      const box={...l.boxes[swapTarget]};g.result={box,valid:true,guides:[]};
      moveBox(nodes.get(g.key),box,false);nodes.get(g.key).classList.remove('home-placement-blocked');overlay.replaceChildren();return;
    }
    const result=board.proposal(l.boxes[g.key],{x:p.x-g.x,y:p.y-g.y},g.kind,l.boxes,g.key,l.width,l.height,p.snap,g.edge);
    g.result=result;moveBox(nodes.get(g.key),result.box,false);nodes.get(g.key).classList.toggle('home-placement-blocked',!result.valid);overlay.replaceChildren();
    for(const guide of result.guides){const line=document.createElement('i');line.className=`home-align-guide home-align-guide--${guide.axis}`;line.style[guide.axis==='x'?'left':'top']=`${guide.position+(guide.axis==='y'?54:0)}px`;overlay.appendChild(line);}
  }
  function cleanup(g){
    if(g.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id);
    document.body.classList.remove('home-board-dragging');overlay.replaceChildren();for(const node of nodes.values())node?.classList.remove('is-resizing','home-tool-moving','home-placement-blocked','home-swap-target','home-swap-source');
  }
  function finish(event){
    if(!gesture||gesture.id!==event.pointerId)return;cancelAnimationFrame(frame);updateGesture();const g=gesture;gesture=null;cleanup(g);
    if(event.type==='pointercancel'){apply(g.start,true);return;}
    const distance=g.pointer?Math.hypot(g.pointer.x-g.x,g.pointer.y-g.y):0;
    if(g.kind==='move'&&distance<4){select(armed===g.key?null:g.key);apply(g.start);return;}
    select(null);
    if(!mobile.matches&&g.kind==='move'&&g.swapTarget){
      const sourceBox={...g.layout.boxes[g.key]},targetBox={...g.layout.boxes[g.swapTarget]};
      g.value.placement.boxes[g.key]=targetBox;g.value.placement.boxes[g.swapTarget]=sourceBox;
      apply(g.value,true);save(g.value,g.start);announce('Herramientas intercambiadas.');return;
    }
    if(!mobile.matches){if(!g.result?.valid){apply(g.start,true);if(g.result)announce('No hay espacio ahí. El resto de las herramientas no se movió.');return;}g.value.placement.boxes[g.key]=g.result.box;}
    apply(g.value);save(g.value,g.start);
  }
  function wire(b){b.addEventListener('pointermove',change);for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,finish);}
  function commitProposal(key,delta,kind,edge='se'){
    const before=read(),value=prepare(clone(before)),l=lastLayout,r=board.proposal(l.boxes[key],delta,kind,l.boxes,key,l.width,l.height,false,edge);
    if(!r.valid){announce('No hay espacio para ese ajuste.');return false;}
    value.placement.boxes[key]=r.box;apply(value,true);save(value,before);announce();return true;
  }
  for(const [key,label] of spaces){const node=nodes.get(key);if(!node||key==='shortcuts')continue;
    for(const [edge,name] of [['n','borde superior'],['e','borde derecho'],['s','borde inferior'],['w','borde izquierdo'],['nw','esquina superior izquierda'],['ne','esquina superior derecha'],['sw','esquina inferior izquierda'],['se','esquina inferior derecha']]){
      const handle=document.createElement('button');handle.type='button';handle.className='home-resize-handle';handle.dataset.edge=edge;handle.dataset.homeEdge=key;if(edge==='se')handle.dataset.homeResize=key;
      handle.hidden=true;handle.title=`Ajustar ${name} de ${label}`;handle.setAttribute('aria-label',edge==='se'?`Cambiar tamaño de ${label}`:handle.title);node.appendChild(handle);wire(handle);
      handle.addEventListener('pointerdown',e=>begin(e,'resize',key));
      handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const d=e.shiftKey?1:8;if(mobile.matches){const value=read();value.sizes[key].mobileHeight=clamp(value.sizes[key].mobileHeight+(['ArrowUp','ArrowLeft'].includes(e.key)?-d:d),spaces.find(s=>s[0]===key)[2],720,300);apply(value);save(value);}else commitProposal(key,{x:e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,y:e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0},'resize',edge);});
    }
    const move=document.createElement('button');move.type='button';move.className='home-move-handle';move.dataset.homeMove=key;move.hidden=true;move.title=`Mover ${label}. Arrastrar o seleccionar y tocar un espacio vacío`;move.setAttribute('aria-label',`Mover ${label}`);move.setAttribute('aria-pressed','false');move.innerHTML='<span aria-hidden="true">⠿</span>';node.appendChild(move);wire(move);move.addEventListener('pointerdown',e=>begin(e,'move',key));
    move.addEventListener('click',e=>{if(e.detail===0)select(armed===key?null:key);});
    move.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||!lastLayout)return;e.preventDefault();const d=e.shiftKey?1:8;commitProposal(key,{x:e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,y:e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0},'move');});
  }
  page.addEventListener('click',e=>{
    if(!editing||!armed||mobile.matches||gesture||e.target.closest('button, input, dialog, [data-home-space]'))return;
    const r=page.getBoundingClientRect(),b=lastLayout.boxes[armed];if(commitProposal(armed,{x:e.clientX-r.x-b.w/2-b.x,y:e.clientY-r.y-54-b.h/2-b.y},'move'))select(null);
  });
  trigger.addEventListener('click',()=>setEditing(!editing));done.addEventListener('click',()=>setEditing(false));manage.addEventListener('click',()=>{form();dialog.showModal();});
  undo.addEventListener('click',()=>{if(!undoValue)return;const value=undoValue;undoValue=null;undo.disabled=true;select(null);apply(value,true);store(value);announce('Ajuste deshecho.');});
  dialog.querySelector('[data-home-customizer-edit]').addEventListener('click',()=>{dialog.close();setEditing(true);});
  list.addEventListener('input',e=>{
    if(e.target.dataset.box)return;const before=read(),value=prepare(clone(before));
    if(e.target.type==='checkbox'){
      const key=e.target.value;
      const stored=value.placement;
      const desktop=lastLayout||(stored&&Number.isFinite(stored.width)&&stored.width>0&&Number.isFinite(stored.height)&&stored.height>0?board.freeLayout(stored,value.tree,stored.width,stored.height,effectiveVisibility(before.visible)):null);
      if(e.target.checked&&desktop&&key!=='shortcuts'){
        value.placement=board.remember(desktop,value.placement,value.tree);
        const preferred=value.placement.boxes[key],rect=board.firstSpace(preferred,desktop.boxes,key,desktop.width,desktop.height);
        if(!rect){e.target.checked=false;announce('No queda espacio. Reducí una herramienta o restablecé la distribución.');return;}
        value.placement.boxes[key]=rect;
      }
      value.visible[key]=e.target.checked;
    }else if(e.target.dataset.height)value.sizes[e.target.dataset.height].mobileHeight=Number(e.target.value);
    apply(value,true);save(value,before);form(value);
  });
  function changeBox(e){
    const key=e.target.dataset.box,field=e.target.dataset.field;if(!key||!lastLayout)return;const b=lastLayout.boxes[key],n=Number(e.target.value);if(!Number.isFinite(n)||e.target.value===''){form();return;}
    if(Math.abs(n-b[field])<.51)return;
    commitProposal(key,{x:['x','w'].includes(field)?n-b[field]:0,y:['y','h'].includes(field)?n-b[field]:0},['x','y'].includes(field)?'move':'resize');form();
  }
  list.addEventListener('change',changeBox);
  list.addEventListener('focusout',changeBox);
  dialog.querySelectorAll('[name="homeDensity"]').forEach(input=>input.addEventListener('change',()=>{const value=read();value.density=input.value;apply(value);save(value);}));
  dialog.querySelector('[data-home-customizer-reset]').addEventListener('click',()=>{const value=read();value.placement=null;value.tree=board.defaults();value.density='comfortable';spaces.filter(([k])=>available(k)).forEach(([k,,min])=>{value.visible[k]=true;value.sizes[k].mobileHeight=min;});apply(value,true);save(value);form(value);});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  function restoreRemote(){if(!gesture){undoValue=null;undo.disabled=true;select(null);apply(undefined,true);}}
  window.addEventListener('storage',e=>{if(e.key===KEY)restoreRemote();});window.addEventListener('estudiemos:cloud-restored',restoreRemote);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});if(armed)select(null);else setEditing(false);}});
  mobile.addEventListener('change',()=>{if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});setEditing(editing);});
  new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!gesture)apply();});}).observe(page);apply();
})();
