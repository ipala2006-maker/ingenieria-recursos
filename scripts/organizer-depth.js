import * as THREE from './vendor/three/three.module.min.js';

// A single assembly with three tool modules; the ordinary links stay outside the canvas.
export function createOrganizerDepth(host, {onOpen, motion = true} = {}) {
  const doc=host.ownerDocument, win=doc.defaultView;
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1,1.5));
  const surface=doc.createElement('canvas');surface.dataset.organizerScene='';
  surface.tabIndex=0;surface.setAttribute('role','img');surface.setAttribute('aria-label','Modelo 3D de herramientas. Girar con las flechas; desplegar con Enter; restablecer con Inicio.');
  const context=surface.getContext('2d');
  if(!context) {renderer.dispose();throw new Error('Canvas unavailable');}
  const scene=new THREE.Scene(),assembly=new THREE.Group();scene.add(assembly);
  const camera=new THREE.OrthographicCamera(-150,150,80,-80,.1,1000);camera.position.z=400;
  scene.add(new THREE.HemisphereLight(0xeef5ff,0x1d2b47,1.8));
  const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-100,120,200);scene.add(light);
  const shape=new THREE.Shape();
  shape.moveTo(-30,-21);shape.lineTo(30,-21);shape.quadraticCurveTo(35,-21,35,-16);
  shape.lineTo(35,16);shape.quadraticCurveTo(35,21,30,21);shape.lineTo(-30,21);
  shape.quadraticCurveTo(-35,21,-35,16);shape.lineTo(-35,-16);shape.quadraticCurveTo(-35,-21,-30,-21);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:5,bevelEnabled:true,bevelThickness:1.8,bevelSize:1.4,bevelSegments:3,steps:1});
  const glyphGeometry=new THREE.PlaneGeometry(24,24), textures=[], materials=[], images=[];
  const keys=['inbox','calendar','space'];
  const plates=keys.map((key,index)=>{
    const material=new THREE.MeshStandardMaterial({metalness:.45,roughness:.25});materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.index=index;assembly.add(mesh);
    const source=host.querySelector(`[data-home-node="${key}"] svg`);
    if(source) {
      const icon=source.cloneNode(true);icon.setAttribute('xmlns','http://www.w3.org/2000/svg');icon.setAttribute('width','96');icon.setAttribute('height','96');
      const style=win.getComputedStyle(source);
      icon.setAttribute('fill',style.fill==='none'?'none':'#d6e7ff');icon.setAttribute('stroke',style.stroke==='none'?'none':'#d6e7ff');icon.setAttribute('stroke-width',style.strokeWidth);
      const image=new win.Image();images.push(image);
      image.onload=()=>{
        if(disposed)return;
        const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;textures.push(texture);
        const glyphMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});materials.push(glyphMaterial);
        const glyph=new THREE.Mesh(glyphGeometry,glyphMaterial);glyph.position.z=7;mesh.add(glyph);schedule();
      };
      image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(icon));
    }
    return mesh;
  });
  const railGeometry=new THREE.BoxGeometry(210,3,5),railMaterial=new THREE.MeshStandardMaterial({metalness:.7,roughness:.3});
  const rail=new THREE.Mesh(railGeometry,railMaterial);rail.position.z=-15;assembly.add(rail);
  const pulseGeometry=new THREE.BoxGeometry(7,4,6),pulseMaterial=new THREE.MeshStandardMaterial({color:0xffb04f,metalness:.4,roughness:.3});
  const pulse=new THREE.Mesh(pulseGeometry,pulseMaterial);pulse.position.z=-11;assembly.add(pulse);
  const ray=new THREE.Raycaster();
  let disposed=false,frame=0,visible=true,shown=true,dirty=true,last=0,phase=0,compact=false;
  let drag=null,hover=-1,pendingOpen=-1,inside=false,focused=false,rx=-.22,ry=-.2,spread=.2;
  let enabled=motion,layout=[],motionOffset=0;
  host.appendChild(surface);
  function resize() {
    const {width,height}=surface.getBoundingClientRect();if(!width || !height)return;
    renderer.setSize(width,height,false);surface.width=renderer.domElement.width;surface.height=renderer.domElement.height;
    compact=width<170;
    const worldWidth=Math.max(compact?135:285,(compact?75:100)*width/height);
    camera.left=-worldWidth/2;camera.right=worldWidth/2;camera.top=worldWidth*height/width/2;camera.bottom=-camera.top;camera.updateProjectionMatrix();
    rail.visible=!compact;
    layout=plates.map((_,i)=>({x:(i-1)*(compact?18:79),y:compact?(i-1)*18:(i===1?11:-6),z:compact?(i-1)*12:(i===1?14:0)}));
    dirty=true;schedule();
  }
  function draw(now) {
    frame=0;
    if(disposed || doc.hidden || !visible || !shown)return;
    const continuous=enabled && !inside && !focused && !drag;
    if(continuous && now-last<32){schedule();return;}
    const dt=Math.min(50,Math.max(1,now-last || 16));last=now;
    if(continuous)phase+=dt/1000;
    if(dirty){
      const colors=win.getComputedStyle(host);
      materials.slice(0,3).forEach((material,i)=>material.color.set(i===1?colors.getPropertyValue('--accent').trim():colors.getPropertyValue('--panel-2').trim()));
      railMaterial.color.set(colors.getPropertyValue('--border').trim());dirty=false;
    }
    const easing=1-Math.exp(-dt/95);
    const targetX=rx+Math.sin(phase*.65)*.09,targetY=ry+Math.sin(phase*.45)*.22;
    assembly.rotation.x+=(targetX-assembly.rotation.x)*easing;assembly.rotation.y+=(targetY-assembly.rotation.y)*easing;
    let moving=Math.abs(targetX-assembly.rotation.x)+Math.abs(targetY-assembly.rotation.y)>.001;
    motionOffset=Math.sin(phase*.8)*3;
    plates.forEach((plate,i)=>{
      const base=layout[i];if(!base)return;
      const x=base.x+(i-1)*spread*(compact?12:7),y=base.y+Math.sin(phase*.8+i*1.7)*3;
      const z=base.z+spread*(i+1)*9+(hover===i?15:0);
      const distance=Math.abs(x-plate.position.x)+Math.abs(y-plate.position.y)+Math.abs(z-plate.position.z);
      plate.position.lerp(new THREE.Vector3(x,y,z),easing);moving ||= distance>.02;
    });
    pulse.visible=!compact;pulse.position.x=Math.sin(phase*.7)*94;
    light.position.x=-100+Math.sin(phase*.5)*65;assembly.position.y=motionOffset;
    renderer.render(scene,camera);context.clearRect(0,0,surface.width,surface.height);context.drawImage(renderer.domElement,0,0);
    host.classList.add('has-organizer-depth');
    if(continuous || moving)schedule();
  }
  function schedule(){if(!frame&&!disposed)frame=win.requestAnimationFrame(draw);}
  function pick(event){
    const box=surface.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2),camera);
    return ray.intersectObjects(plates,false)[0]?.object.userData.index ?? -1;
  }
  function down(event){
    if(event.button!==0 || !event.isPrimary)return;
    pendingOpen=-1;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,rx,ry,spread,moved:false};surface.setPointerCapture(event.pointerId);schedule();
  }
  function move(event){
    if(!drag){const next=pick(event);if(next!==hover){hover=next;schedule();}return;}
    if(event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(dx,dy)>5)drag.moved=true;
    if(!drag.moved)return;
    rx=Math.max(-.5,Math.min(.35,drag.rx+dy*.004));ry=Math.max(-.7,Math.min(.7,drag.ry+dx*.006));
    spread=Math.max(0,Math.min(1,drag.spread-dy/100));surface.classList.add('is-grabbing');schedule();
  }
  function up(event){
    if(!drag || event.pointerId!==drag.id)return;
    const previous=drag;drag=null;
    if(surface.hasPointerCapture(previous.id))surface.releasePointerCapture(previous.id);
    surface.classList.remove('is-grabbing');schedule();
    if(!previous.moved && event.type==='pointerup')pendingOpen=pick(event);
  }
  function activate(event){
    // Wait for the click so a touch cannot land on the newly revealed view.
    event.preventDefault();event.stopPropagation();
    const selected=pendingOpen;pendingOpen=-1;
    if(selected>=0)onOpen?.(keys[selected]);
  }
  function key(event){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','Enter'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home'){rx=-.22;ry=-.2;spread=.2;}
    else if(event.key==='Enter')spread=spread>.5?0:1;
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight')ry=Math.max(-.7,Math.min(.7,ry+(event.key==='ArrowLeft'?-.12:.12)));
    else rx=Math.max(-.5,Math.min(.35,rx+(event.key==='ArrowUp'?-.12:.12)));
    schedule();
  }
  const enter=()=>{inside=true;schedule();},leave=()=>{inside=false;hover=-1;schedule();};
  const focus=()=>{focused=true;schedule();},blur=()=>{focused=false;schedule();};
  const theme=()=>{dirty=true;schedule();};
  const visibility=()=>{last=0;schedule();};
  const resizer=new win.ResizeObserver(resize);resizer.observe(surface);
  const observer=new win.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visibility();});observer.observe(surface);
  const colors=new win.MutationObserver(theme);colors.observe(doc.documentElement,{attributes:true,attributeFilter:['class','data-theme']});
  surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);
  surface.addEventListener('click',activate);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,up);
  surface.addEventListener('pointerenter',enter);surface.addEventListener('pointerleave',leave);surface.addEventListener('focus',focus);surface.addEventListener('blur',blur);surface.addEventListener('keydown',key);
  doc.addEventListener('visibilitychange',visibility);
  function dispose(){
    if(disposed)return;disposed=true;win.cancelAnimationFrame(frame);
    if(drag&&surface.hasPointerCapture(drag.id))surface.releasePointerCapture(drag.id);drag=null;
    resizer.disconnect();observer.disconnect();colors.disconnect();doc.removeEventListener('visibilitychange',visibility);
    images.forEach(image=>{image.onload=null;});
    geometry.dispose();glyphGeometry.dispose();railGeometry.dispose();railMaterial.dispose();pulseGeometry.dispose();pulseMaterial.dispose();
    materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());renderer.dispose();surface.remove();host.classList.remove('has-organizer-depth');
  }
  renderer.domElement.addEventListener('webglcontextlost',dispose,{once:true});resize();
  return {setMotion(value){enabled=value;last=0;schedule();},setVisible(value){shown=value;last=0;schedule();},dispose};
}
