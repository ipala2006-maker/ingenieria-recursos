(function(){
  const storage=window.EstudiemosHomeLayout,board=window.EstudiemosHomeBoard,body=document.body,root=document.documentElement;
  if(!storage||!board||!body.classList.contains('workspace-home'))return;
  const mobile=matchMedia('(max-width:700px), (min-width:701px) and (max-width:900px) and (max-height:899px)');
  const keys=['focus','progress','assistant','shortcuts','workspace','calendar','inbox','classes'];
  const available=key=>key!=='shortcuts'&&(window.EstudiemosRelease?.homeSpaceEnabled?.(key) ?? (key==='assistant'?window.EstudiemosRelease?.enabled?.('ai')===true:key==='workspace'?window.EstudiemosRelease?.enabled?.('driveWorkspace')===true:true));
  const style=document.createElement('style');style.id='homeInitialGeometry';
  document.head.appendChild(style);root.classList.add('home-starting');body.classList.add('home-resizable');
  function apply(){
    const saved=storage.read(),visible={};
    body.dataset.homeDensity=saved.density==='compact'?'compact':'comfortable';
    for(const key of keys)visible[key]=available(key)
      &&(key==='classes'?saved.visible?.[key]===true:saved.visible?.[key]!==false);
    body.classList.toggle('home-board',!mobile.matches);
    if(mobile.matches){style.textContent='';return;}
    const width=Math.max(1,Math.min(1800,innerWidth-24)),height=Math.max(1,innerHeight-57-64);
    const layout=board.freeLayout(saved.placement,board.sanitize(saved.tree),width,height,visible);
    style.textContent=keys.map(key=>{
      const selector=`html.home-starting body.workspace-home [data-home-space="${key}"]`;
      if(!visible[key])return selector+'{display:none!important}';
      const r=layout.boxes[key];
      return r?`${selector}{${key==='classes'?'display:flex!important;':''}left:${r.x}px;top:${r.y+54}px;width:${r.w}px;height:${r.h}px}`:'';
    }).join('\n');
  }
  apply();window.addEventListener('resize',apply);
  window.EstudiemosHomeBoot=Object.freeze({release(){window.removeEventListener('resize',apply);style.remove();root.classList.remove('home-starting');}});
})();
