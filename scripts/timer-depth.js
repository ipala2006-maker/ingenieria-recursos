import * as THREE from './vendor/three/three.module.min.js';

// Both timers use the same pixel geometry as the input, never a separately tilted dial.
export function createTimerDepth(host, {home = false} = {}) {
  const document=host.ownerDocument, window=document.defaultView;
  const {ResizeObserver,IntersectionObserver,MutationObserver}=window;
  const requestAnimationFrame=window.requestAnimationFrame.bind(window), cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
  const getComputedStyle=window.getComputedStyle.bind(window), devicePixelRatio=window.devicePixelRatio;
  const dial = host.querySelector('.study-dial');
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
  const surface = document.createElement('canvas');
  const context = surface.getContext('2d');
  if(!context) {renderer.dispose();throw new Error('Canvas unavailable');}
  surface.setAttribute('aria-hidden','true');
  if(home) surface.dataset.studyScene = '';
  else surface.className = 'pomodoro-depth';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-100,100,100,-100,.1,1000);
  camera.position.z = 400;
  const trackMaterial = new THREE.MeshBasicMaterial({transparent:true,opacity:.6});
  const fillMaterial = new THREE.MeshBasicMaterial();
  const track = new THREE.Mesh(new THREE.BufferGeometry(),trackMaterial);
  const fill = new THREE.Mesh(new THREE.BufferGeometry(),fillMaterial);
  fill.rotation.z = Math.PI/2; fill.scale.y = -1;
  const ticks = new THREE.Group();
  const tickGeometry = new THREE.BoxGeometry(1,4,2);
  for(let i=0;i<12;i++) ticks.add(new THREE.Mesh(tickGeometry,trackMaterial));
  scene.add(track,fill,ticks);
  let frame=0, disposed=false, visible=true, radius=0, arc=-1, angle=150, phase='study';
  function draw() {
    frame=0;
    if(disposed || document.hidden || !visible || host.closest('[hidden]') || (!home && host.closest('[aria-hidden="true"]'))) return;
    const box = host.getBoundingClientRect();
    if(!box.width || !box.height) return;
    const nextRadius = dial.getBoundingClientRect().width/2-8;
    if(nextRadius!==radius) {
      radius=nextRadius; arc=-1;
      track.geometry.dispose();
      track.geometry=new THREE.TorusGeometry(radius,2,8,120);
      ticks.children.forEach((tick,i)=>{
        const a=i*Math.PI/6;
        tick.position.set(Math.sin(a)*(radius+10),Math.cos(a)*(radius+10),-3);
        tick.rotation.z=-a; tick.scale.y=.65;
      });
    }
    const nextArc=Math.round(angle*2)/2;
    if(nextArc!==arc) {
      arc=nextArc; fill.geometry.dispose();
      fill.geometry=new THREE.TorusGeometry(radius,2.2,8,Math.max(4,Math.ceil(arc/3)),Math.max(.001,arc*Math.PI/180));
      fill.visible=arc>0;
    }
    const ratio=renderer.getPixelRatio();
    if(renderer.domElement.width!==Math.floor(box.width*ratio) || renderer.domElement.height!==Math.floor(box.height*ratio)) {
      renderer.setSize(box.width,box.height,false);
      surface.width=renderer.domElement.width; surface.height=renderer.domElement.height;
      camera.left=-box.width/2; camera.right=box.width/2; camera.top=box.height/2; camera.bottom=-box.height/2;
      camera.updateProjectionMatrix();
    }
    const colors=getComputedStyle(host);
    trackMaterial.color.set(colors.getPropertyValue('--border').trim());
    fillMaterial.color.set(host.dataset.timerPhase === 'break' ? '#fbbc04' : colors.getPropertyValue('--accent').trim());
    renderer.render(scene,camera);
    context.clearRect(0,0,surface.width,surface.height); context.drawImage(renderer.domElement,0,0);
    host.classList.add(home ? 'has-scene' : 'has-depth');
  }
  function schedule() { if(!frame && !disposed) frame=requestAnimationFrame(draw); }
  function input(event) { angle=event.detail.angle; schedule(); }
  const resize=new ResizeObserver(schedule); resize.observe(host); resize.observe(dial);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();}); observer.observe(host);
  const theme=new MutationObserver(schedule); theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});
  host.addEventListener('estudiemos:dial-input',input);
  document.addEventListener('visibilitychange',schedule);
  host.appendChild(surface);
  function dispose() {
    if(disposed) return;
    disposed=true; cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); theme.disconnect();
    host.removeEventListener('estudiemos:dial-input',input); document.removeEventListener('visibilitychange',schedule);
    for(const mesh of [track,fill]) mesh.geometry.dispose();
    tickGeometry.dispose(); trackMaterial.dispose(); fillMaterial.dispose(); renderer.dispose();
    surface.remove(); host.classList.remove(home ? 'has-scene' : 'has-depth');
  }
  renderer.domElement.addEventListener('webglcontextlost',dispose,{once:true});
  schedule();
  return {update(){const next=parseFloat(dial.style.getPropertyValue('--dial-angle')) || 0;const nextPhase=host.dataset.timerPhase || 'study';if(next!==angle || nextPhase!==phase){angle=next;phase=nextPhase;schedule();}},dispose};
}
