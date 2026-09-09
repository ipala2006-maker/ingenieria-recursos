import * as THREE from './vendor/three/three.module.min.js';

export function createProgressDepth(host, onSelect) {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
  const surface=document.createElement('canvas');
  surface.dataset.progressScene=''; surface.setAttribute('aria-hidden','true');
  const context=surface.getContext('2d');
  if(!context) {renderer.dispose();throw new Error('Canvas unavailable');}
  const scene=new THREE.Scene(), group=new THREE.Group();
  const camera=new THREE.OrthographicCamera(-160,160,90,-90,.1,1000);
  camera.position.set(0,125,400); camera.lookAt(0,44,0);
  scene.add(group,new THREE.HemisphereLight(0xffffff,0x253349,2.4));
  const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(-120,160,180); scene.add(light);
  const geometry=new THREE.BoxGeometry(1,1,18);
  const bars=Array.from({length:30},(_,index)=>{
    const material=new THREE.MeshStandardMaterial({metalness:.15,roughness:.26,transparent:true,opacity:.92});
    const mesh=new THREE.Mesh(geometry,material); mesh.userData.index=index; mesh.visible=false;
    mesh.scale.y=1; mesh.position.y=.5; group.add(mesh); return mesh;
  });
  const floorGeometry=new THREE.BoxGeometry(290,2,48);
  const floorMaterial=new THREE.MeshStandardMaterial({metalness:.15,roughness:.45,transparent:true,opacity:.72});
  const floor=new THREE.Mesh(floorGeometry,floorMaterial); floor.position.y=-2; group.add(floor);
  const vertices=[];
  for(const y of [0,30,60,90]) vertices.push(-140,y,-15,140,y,-15);
  const gridGeometry=new THREE.BufferGeometry(); gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const gridMaterial=new THREE.LineBasicMaterial({transparent:true,opacity:.3});
  const grid=new THREE.LineSegments(gridGeometry,gridMaterial); group.add(grid);
  const raycaster=new THREE.Raycaster();
  let frame=0, disposed=false, visible=true, selected=-1, signature='', days=[], drag=null;
  let rotationY=-.16, rotationX=0, suppressClickUntil=0;
  let worldWidth=320;
  group.rotation.y=-.16;
  function layout() {
    const spread=worldWidth*.78;
    floor.scale.x=worldWidth/320; grid.scale.x=worldWidth/320;
    bars.forEach((bar,index)=>{
      bar.scale.x=Math.min(worldWidth*.078,spread/Math.max(1,days.length)*.7);
      bar.position.x=(index/Math.max(1,days.length-1)-.5)*spread;
    });
  }
  const heightAt=index=>Math.max(1,(days[index]?.minutes || 0)/Math.max(25,...days.map(d=>d.minutes))*86);
  function draw() {
    frame=0;
    if(disposed || document.hidden || !visible || host.closest('[hidden]')) return;
    const {width,height}=surface.getBoundingClientRect();
    if(!width || !height) return;
    const ratio=renderer.getPixelRatio();
    if(renderer.domElement.width!==Math.floor(width*ratio) || renderer.domElement.height!==Math.floor(height*ratio)) {
      renderer.setSize(width,height,false); surface.width=renderer.domElement.width; surface.height=renderer.domElement.height;
      // Keep the tallest data bar in frame even in a short, wide module.
      worldWidth=150*width/height;
      camera.left=-worldWidth/2; camera.right=worldWidth/2;
      camera.top=worldWidth*height/width/2; camera.bottom=-camera.top; camera.updateProjectionMatrix();
      layout();
    }
    let moving=false;
    group.rotation.y+=(rotationY-group.rotation.y)*.2;
    group.rotation.x+=(rotationX-group.rotation.x)*.2;
    moving=Math.abs(rotationY-group.rotation.y)+Math.abs(rotationX-group.rotation.x)>.001;
    const colors=getComputedStyle(host), accent=colors.getPropertyValue('--accent').trim();
    bars.forEach((bar,index)=>{
      if(!bar.visible) return;
      const target=heightAt(index), depth=index===selected ? 12 : 0;
      bar.scale.y+=(target-bar.scale.y)*.2;
      bar.position.y=bar.scale.y/2;
      bar.position.z+=(depth-bar.position.z)*.2;
      moving ||= Math.abs(target-bar.scale.y)+Math.abs(depth-bar.position.z)>.02;
      bar.material.color.set(index===selected ? '#ffb04f' : accent);
      bar.material.opacity=days[index].minutes>0 ? .92 : .3;
    });
    floorMaterial.color.set(colors.getPropertyValue('--panel-2').trim());
    gridMaterial.color.set(colors.getPropertyValue('--muted').trim());
    renderer.render(scene,camera);
    context.clearRect(0,0,surface.width,surface.height); context.drawImage(renderer.domElement,0,0);
    host.classList.add('has-progress-depth');
    if(moving) schedule();
  }
  function schedule() { if(!frame && !disposed) frame=requestAnimationFrame(draw); }
  function pick(event) {
    const box=surface.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2),camera);
    const hit=raycaster.intersectObjects(bars.filter(bar=>bar.visible),false)[0];
    if(hit) onSelect(hit.object.userData.index);
  }
  function down(event) {
    if(event.button!==0 || !event.isPrimary || event.target.closest('button')) return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,rotationY,rotationX,moved:false};
    host.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if(!drag) { if(event.pointerType==='mouse' && !event.target.closest('button')) pick(event); return; }
    if(event.pointerId!==drag.id) return;
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    if(Math.hypot(dx,dy)>5) drag.moved=true;
    if(!drag.moved) return;
    rotationY=Math.max(-.48,Math.min(.48,drag.rotationY+dx*.004));
    rotationX=event.pointerType==='mouse' ? Math.max(-.12,Math.min(.22,drag.rotationX+dy*.003)) : 0;
    host.classList.add('is-orbiting'); schedule();
  }
  function finish(event) {
    if(!drag || drag.id!==event.pointerId) return;
    const gesture=drag; drag=null; host.classList.remove('is-orbiting');
    if(host.hasPointerCapture(gesture.id)) host.releasePointerCapture(gesture.id);
    if(gesture.moved) suppressClickUntil=Date.now()+350;
    else if(event.type==='pointerup') pick(event);
  }
  function click(event) { if(Date.now()<suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } }
  const resize=new ResizeObserver(schedule); resize.observe(host);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();}); observer.observe(host);
  const theme=new MutationObserver(schedule); theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  host.addEventListener('pointerdown',down); host.addEventListener('pointermove',move);
  for(const type of ['pointerup','pointercancel','lostpointercapture']) host.addEventListener(type,finish);
  host.addEventListener('click',click,true); document.addEventListener('visibilitychange',schedule);
  host.appendChild(surface);
  function dispose() {
    if(disposed) return;
    if(drag && host.hasPointerCapture(drag.id)) host.releasePointerCapture(drag.id);
    drag=null; host.classList.remove('is-orbiting');
    disposed=true; cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); theme.disconnect();
    host.removeEventListener('pointerdown',down); host.removeEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture']) host.removeEventListener(type,finish);
    host.removeEventListener('click',click,true); document.removeEventListener('visibilitychange',schedule);
    bars.forEach(bar=>bar.material.dispose()); geometry.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); gridGeometry.dispose(); gridMaterial.dispose(); renderer.dispose();
    surface.remove(); host.classList.remove('has-progress-depth');
  }
  renderer.domElement.addEventListener('webglcontextlost',dispose,{once:true});
  return {
    update(value,index) {
      const next=JSON.stringify(value);
      const changed=signature!==next;
      if(changed) {
        signature=next; days=value;
        bars.forEach((bar,i)=>{
          bar.visible=i<days.length;
        });
        layout();
      }
      if(selected!==index || changed) {
        selected=index; schedule();
      }
    },
    reset() {rotationY=-.16;rotationX=0;schedule();},
    dispose
  };
}
