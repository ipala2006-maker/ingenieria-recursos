(function () {
  const dialog = document.querySelector('[data-home-customizer]'), trigger = document.querySelector('[data-home-customize]'), page = document.querySelector('.workspace-page');
  if (!dialog || !trigger || !page) return;
  const KEY = 'estudiemos_home_layout';
  const spaces = [['focus','Pomodoro',240],['progress','Tu progreso',300],['assistant','Organizador IA',260],['shortcuts','Accesos rápidos',64],['workspace','Mi espacio',280],['calendar','Calendario',340],['inbox','Inbox',280]];
  const mobile = matchMedia('(max-width:700px), (min-width:701px) and (max-width:900px) and (max-height:899px), (max-height:650px)');
  const list = dialog.querySelector('[data-home-customizer-spaces]');
  const clamp = (n,min,max,fallback) => n != null && Number.isFinite(Number(n)) ? Math.max(min,Math.min(max,Number(n))) : fallback;
  const nodes = new Map(spaces.map(([key]) => [key,document.querySelector(`[data-home-space="${key}"]`)]));
  let editing = false, drag = null;
  document.body.classList.add('home-resizable');
  list.innerHTML = spaces.map(([key,label,min]) => `<div class="home-customizer__item">
    <label class="home-customizer__space"><strong>${label}</strong><input type="checkbox" value="${key}" aria-label="Mostrar ${label}"></label>
    ${key === 'shortcuts' ? '' : `<div class="home-customizer__dimensions" data-dimensions="${key}">
      <label class="home-size-width">Ancho<select data-width="${key}" aria-label="Ancho de ${label}"><option value="4">Un tercio</option><option value="6">Mitad</option><option value="8">Dos tercios</option><option value="12">Completo</option></select></label>
      <label>Alto<input type="range" min="${min}" max="720" step="24" data-height="${key}" aria-label="Alto de ${label}"><output data-size-label="${key}"></output></label></div>`}</div>`).join('');
  const done = document.createElement('button');
  done.type='button';done.className='home-layout-done';done.textContent='Listo';done.hidden=true;
  done.setAttribute('aria-label','Terminar de ajustar tamaños');trigger.after(done);
  function read() {
    let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(_){}
    const visible={},sizes={};
    for(const [key,,min] of spaces){
      visible[key]=saved.visible?.[key]!==false;const size=saved.sizes?.[key]||{};
      sizes[key]={width:clamp(size.width,3,12,4),height:clamp(size.height || null,min,720,0),mobileHeight:clamp(size.mobileHeight,min,720,min)};
    }
    return {version:2,density:saved.density==='compact'?'compact':'comfortable',visible,sizes};
  }
  function save(value){
    localStorage.setItem(KEY,JSON.stringify(value));apply(value);
    window.dispatchEvent(new CustomEvent('estudiemos:data-change',{detail:{key:KEY}}));
    window.dispatchEvent(new CustomEvent('estudiemos:home-customized',{detail:value}));
  }
  function heightFor(value,key,min){return mobile.matches ? value.sizes[key].mobileHeight : value.sizes[key].height || Math.max(min,Math.floor((page.clientHeight-72)/2));}
  function apply(value=read()){
    document.body.dataset.homeDensity=value.density;
    const columns=page.clientWidth<980?2:3,minSpan=Math.ceil(260/Math.max(1,page.clientWidth)*12);
    for(const [key,,min] of spaces){
      const node=nodes.get(key);if(!node)continue;
      node.classList.toggle('home-space-disabled',!value.visible[key]);node.setAttribute('aria-hidden',String(!value.visible[key]));
      if(key==='shortcuts')continue;
      const size=value.sizes[key],width=Math.min(12,Math.max(minSpan,size.width===4?12/columns:size.width)),height=heightFor(value,key,min);
      node.style.setProperty('--home-span',width);node.style.setProperty('--home-tool-height',`${height}px`);
      node.style.setProperty('--home-row-span',Math.ceil((height+8)/32));node.dataset.homeWidth=width<=4?'small':'wide';
    }
    document.body.dataset.homeToolCount=String(['focus','progress','assistant'].filter(key=>value.visible[key]).length);
  }
  function form(value=read()){
    for(const [key,,min] of spaces){
      list.querySelector(`input[value="${key}"]`).checked=value.visible[key];
      const width=list.querySelector(`[data-width="${key}"]`);if(!width)continue;
      width.value=String([4,6,8,12].find(w=>w>=value.sizes[key].width)||12);
      const h=heightFor(value,key,min);list.querySelector(`[data-height="${key}"]`).value=h;
      list.querySelector(`[data-size-label="${key}"]`).textContent=`${h} px`;
      list.querySelector(`[data-dimensions="${key}"]`).hidden=!value.visible[key];
    }
    dialog.querySelector(`[name="homeDensity"][value="${value.density}"]`).checked=true;
  }
  function setEditing(value){
    editing=value;document.body.classList.toggle('home-layout-editing',editing);done.hidden=!editing;trigger.setAttribute('aria-pressed',String(editing));
    for(const [key,node] of nodes)if(key!=='shortcuts'&&node)node.querySelector('[data-home-resize]').hidden=!editing;
  }
  for(const [key,label,min] of spaces){
    const node=nodes.get(key);if(!node||key==='shortcuts')continue;
    const handle=document.createElement('button');handle.type='button';handle.className='home-resize-handle';handle.dataset.homeResize=key;handle.hidden=true;
    handle.setAttribute('aria-label',`Cambiar tamaño de ${label}`);handle.title=`Cambiar tamaño de ${label}`;
    handle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 19 11-11m-5 11 5-5"/></svg>';node.appendChild(handle);
    handle.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary)return;e.preventDefault();const r=node.getBoundingClientRect();
      drag={id:e.pointerId,key,x:e.clientX,y:e.clientY,width:r.width,height:r.height,value:read()};handle.setPointerCapture(e.pointerId);node.classList.add('is-resizing');
    });
    handle.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const size=drag.value.sizes[key];
      size[mobile.matches?'mobileHeight':'height']=clamp(Math.round((drag.height+e.clientY-drag.y)/24)*24,min,720,min);
      if(!mobile.matches)size.width=clamp(Math.round((drag.width+e.clientX-drag.x+8)/((page.clientWidth+8)/12)),3,12,4);
      apply(drag.value);
    });
    const finish=e=>{
      if(!drag||drag.id!==e.pointerId)return;const gesture=drag;drag=null;node.classList.remove('is-resizing');
      if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
      if(e.type==='pointercancel')apply();else save(gesture.value);
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,finish);
    handle.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const value=read(),size=value.sizes[key];
      if(e.key==='ArrowUp'||e.key==='ArrowDown')size[mobile.matches?'mobileHeight':'height']=clamp(heightFor(value,key,min)+(e.key==='ArrowUp'?-24:24),min,720,min);
      else size.width=clamp(size.width+(e.key==='ArrowLeft'?-1:1),3,12,4);save(value);
    });
    handle.addEventListener('click',e=>{if(e.detail===0){form();dialog.showModal();}});
  }
  trigger.addEventListener('click',()=>{form();dialog.showModal();});done.addEventListener('click',()=>setEditing(false));
  dialog.querySelector('[data-home-customizer-edit]').addEventListener('click',()=>{dialog.close();setEditing(true);});
  list.addEventListener('input',e=>{
    const value=read(),input=e.target;
    if(input.type==='checkbox')value.visible[input.value]=input.checked;
    else if(input.dataset.width)value.sizes[input.dataset.width].width=Number(input.value);
    else if(input.dataset.height)value.sizes[input.dataset.height][mobile.matches?'mobileHeight':'height']=Number(input.value);
    save(value);form(value);
  });
  dialog.querySelectorAll('[name="homeDensity"]').forEach(input=>input.addEventListener('change',()=>{const value=read();value.density=input.value;save(value);}));
  dialog.querySelector('[data-home-customizer-reset]').addEventListener('click',()=>{localStorage.removeItem(KEY);save(read());form();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  window.addEventListener('storage',e=>{if(e.key===KEY)apply();});window.addEventListener('estudiemos:cloud-restored',()=>apply());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)setEditing(false);});
  let resizeFrame=0;
  mobile.addEventListener('change',()=>apply());new ResizeObserver(()=>{
    cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!drag)apply();});
  }).observe(page);apply();
})();
