import * as THREE from './vendor/three/three.module.min.js';

export function createStudyScene(host) {
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const surface = document.createElement('canvas');
  surface.setAttribute('aria-hidden','true');
  surface.dataset.studyScene = '';
  const context = surface.getContext('2d');
  if (!context) { renderer.dispose(); throw new Error('Canvas unavailable'); }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35,1,.1,20);
  camera.position.z = 4.6;
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff,0x1e293b,2.8));
  const light = new THREE.DirectionalLight(0xffffff,4);
  light.position.set(-2,3,5);
  scene.add(light);
  const railMaterial = new THREE.MeshStandardMaterial({metalness:.6,roughness:.35});
  const blueMaterial = new THREE.MeshStandardMaterial({metalness:.35,roughness:.25});
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1,.047,12,96),railMaterial);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.15,.007,6,96),railMaterial);
  const progress = new THREE.Mesh(new THREE.TorusGeometry(1,.051,12,96,.001),blueMaterial);
  progress.rotation.z = Math.PI/2;
  progress.scale.x = -1;
  group.add(rail,outer,progress);
  const tickGeometry = new THREE.BoxGeometry(.014,.05,.015);
  const ticks = new THREE.Group();
  for (let i=0;i<48;i++) {
    const tick = new THREE.Mesh(tickGeometry,i % 12 === 0 ? blueMaterial : railMaterial);
    const a=i/48*Math.PI*2;
    tick.position.set(Math.sin(a)*1.24,Math.cos(a)*1.24,0);
    tick.rotation.z=-a;
    ticks.add(tick);
  }
  group.add(ticks);
  let frame=0, disposed=false, visible=true, running=false, last=0, arc=-1;
  let targetX=.25, targetY=-.2;
  group.rotation.set(.7,-.5,0);
  function paint(now) {
    frame=0;
    if (disposed || document.hidden || !visible || host.closest('[hidden]')) return;
    if (now-last < 32) { schedule(); return; }
    last=now;
    group.rotation.x += (targetX-group.rotation.x)*.16;
    group.rotation.y += (targetY-group.rotation.y)*.16;
    if (running) ticks.rotation.z = Math.sin(now/5000)*.035;
    const {width,height}=host.getBoundingClientRect();
    if (!width || !height) return;
    const ratio=renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.floor(width*ratio) || renderer.domElement.height !== Math.floor(height*ratio)) {
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();
      surface.width=renderer.domElement.width; surface.height=renderer.domElement.height;
    }
    const colors=getComputedStyle(host);
    railMaterial.color.set(colors.getPropertyValue('--border').trim());
    blueMaterial.color.set(colors.getPropertyValue('--accent').trim());
    renderer.render(scene,camera);
    context.clearRect(0,0,surface.width,surface.height);
    context.drawImage(renderer.domElement,0,0);
    host.classList.add('has-scene');
    if (running || Math.abs(group.rotation.x-targetX) + Math.abs(group.rotation.y-targetY) > .001) schedule();
  }
  function schedule() { if (!frame && !disposed) frame=requestAnimationFrame(paint); }
  const move = event => {
    if(event.pointerType !== 'mouse') return;
    const rect=host.getBoundingClientRect();
    targetX=.25+(event.clientY-rect.top-rect.height/2)/rect.height*.45;
    targetY=(event.clientX-rect.left-rect.width/2)/rect.width*.6;
    schedule();
  };
  const reset = () => { targetX=.25; targetY=-.2; schedule(); };
  const resize=new ResizeObserver(schedule); resize.observe(host);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting; schedule();}); observer.observe(host);
  const theme=new MutationObserver(schedule); theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  host.addEventListener('pointermove',move);
  host.addEventListener('pointerleave',reset);
  document.addEventListener('visibilitychange',schedule);
  host.appendChild(surface);
  const dispose = () => {
    if(disposed) return;
    disposed=true; cancelAnimationFrame(frame);
    observer.disconnect(); resize.disconnect(); theme.disconnect();
    host.removeEventListener('pointermove',move); host.removeEventListener('pointerleave',reset);
    document.removeEventListener('visibilitychange',schedule);
    rail.geometry.dispose(); outer.geometry.dispose(); progress.geometry.dispose(); tickGeometry.dispose();
    railMaterial.dispose(); blueMaterial.dispose(); renderer.dispose();
    surface.remove(); host.classList.remove('has-scene');
  };
  renderer.domElement.addEventListener('webglcontextlost',dispose,{once:true});
  schedule();
  return {
    update(state) {
      if(disposed) return;
      running=Boolean(state.running);
      const next=Math.round(Math.max(0,Math.min(1,state.progress))*360);
      if(next !== arc) {
        arc=next; progress.geometry.dispose();
        progress.geometry=new THREE.TorusGeometry(1,.051,12,Math.max(4,Math.ceil(arc/4)),Math.max(.001,arc/180*Math.PI));
        progress.visible=arc>0;
      }
      schedule();
    }, dispose
  };
}
