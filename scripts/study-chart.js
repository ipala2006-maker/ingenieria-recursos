const KEY = 'estudiemos_study_chart_mode';
const modes = ['line','bars','depth'];
const labels = ['Línea','Barras','3D'];
export function createStudyChart(host,onSelect) {
  const doc=host.ownerDocument,win=doc.defaultView;
  let days=[],selected=0,scene=null,disposed=false,generation=0,lastData='';
  let mode=modes.includes(win.localStorage.getItem(KEY))?win.localStorage.getItem(KEY):'line';
  const toolbar=doc.createElement('div');toolbar.className='study-chart-modes';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Tipo de gráfico');
  modes.forEach((value,i)=>{const button=doc.createElement('button');button.type='button';button.textContent=labels[i];button.dataset.chartMode=value;toolbar.appendChild(button);});
  const plot=doc.createElementNS('http://www.w3.org/2000/svg','svg');plot.classList.add('study-chart-plot');plot.setAttribute('aria-hidden','true');
  const reset=host.parentElement.querySelector('[data-progress-reset],[data-widget-graph-reset]');
  host.before(toolbar);host.appendChild(plot);host.classList.add('has-study-chart');
  const duration=n=>`${Math.floor(n/60)} h ${Math.round(n%60)} min`;
  function draw(){
    if(disposed)return;
    host.dataset.chartMode=mode;
    if(reset)reset.hidden=mode!=='depth';
    toolbar.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chartMode===mode)));
    const width=Math.max(180,host.clientWidth),height=Math.max(60,host.clientHeight-24),left=42,right=width-10,top=12,bottom=height-8;
    const max=Math.max(30,...days.map(day=>day.minutes)),step=max<=120?30:60,ceiling=Math.ceil(max/step)*step;
    plot.setAttribute('viewBox',`0 0 ${width} ${height}`);plot.setAttribute('preserveAspectRatio','none');
    const x=i=>left+(right-left)*(i+.5)/Math.max(1,days.length),y=n=>bottom-(bottom-top)*n/ceiling;
    const grid=[0,ceiling/2,ceiling].map(n=>`<line x1="${left}" y1="${y(n)}" x2="${right}" y2="${y(n)}"/><text x="${left-7}" y="${y(n)+3}" text-anchor="end">${Number((n/60).toFixed(2)).toLocaleString('es-AR')} h</text>`).join('');
    const points=days.map((day,i)=>`${x(i)},${y(day.minutes)}`).join(' ');
    const data=mode==='bars'?days.map((day,i)=>`<rect class="chart-data ${i===selected?'is-selected':''}" x="${x(i)-(right-left)/Math.max(1,days.length)*.28}" y="${y(day.minutes)}" width="${(right-left)/Math.max(1,days.length)*.56}" height="${Math.max(0,bottom-y(day.minutes))}" rx="2"/>`).join(''):
      `<polyline class="chart-line" points="${points}"/>${days.map((day,i)=>`<circle class="chart-data ${i===selected?'is-selected':''}" cx="${x(i)}" cy="${y(day.minutes)}" r="${i===selected?4:2.5}"/>`).join('')}`;
    plot.innerHTML=`<g class="chart-grid">${grid}</g>${data}`;
    plot.style.display=mode==='depth'?'none':'block';
    host.style.setProperty('--chart-left',`${left}px`);
    host.style.setProperty('--chart-right',`${width-right}px`);
    host.title=days[selected]?`${new Date(days[selected].date+'T12:00:00').toLocaleDateString('es-AR')}: ${duration(days[selected].minutes)}`:'';
    scene?.update(days,selected);
  }
  async function setMode(next){
    mode=next;const request=++generation;scene?.dispose();scene=null;draw();
    if(next!=='depth')return;
    try{
      const {createProgressDepth}=await import('./progress-depth.js?v=20260914-chart');
      if(disposed||request!==generation)return;
      scene=createProgressDepth(host,onSelect);scene.update(days,selected);
    }catch(_){if(request===generation){mode='bars';draw();}}
  }
  toolbar.addEventListener('click',e=>{const button=e.target.closest('[data-chart-mode]');if(!button)return;
    win.localStorage.setItem(KEY,button.dataset.chartMode);win.dispatchEvent(new win.CustomEvent('estudiemos:data-change',{detail:{key:KEY}}));setMode(button.dataset.chartMode);
  });
  function pick(e){if(mode==='depth'||!days.length||e.target.closest('button'))return;const r=host.getBoundingClientRect();
    onSelect(Math.max(0,Math.min(days.length-1,Math.floor((e.clientX-r.left-42)/Math.max(1,r.width-52)*days.length))));}
  host.addEventListener('click',pick);
  let resizeFrame=0;
  const resize=new win.ResizeObserver(()=>{win.cancelAnimationFrame(resizeFrame);resizeFrame=win.requestAnimationFrame(draw);});resize.observe(host);
  setMode(mode);
  return {update(value,index){const signature=JSON.stringify([value,index]);if(signature===lastData)return;lastData=signature;days=value;selected=index;draw();},reset(){scene?.reset();},dispose(){disposed=true;generation++;resize.disconnect();win.cancelAnimationFrame(resizeFrame);scene?.dispose();toolbar.remove();plot.remove();host.classList.remove('has-study-chart');host.removeEventListener('click',pick);}};
}
