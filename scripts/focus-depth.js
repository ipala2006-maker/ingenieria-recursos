import * as THREE from './vendor/three/three.module.min.js';

// Demand-rendered: no background animation loop or independent timer state.
export function createFocusDepth(host) {
  // Retain this small, demand-rendered buffer across WebKit compositing passes.
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'low-power', preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  // A normal canvas avoids WebKit losing a WebGL layer inside a moving popover.
  const surface = document.createElement('canvas');
  const context = surface.getContext('2d');
  if (!context) { renderer.dispose(); throw new Error('Canvas unavailable'); }
  surface.className = 'pomodoro-depth';
  surface.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 20);
  camera.position.z = 4.1;
  const group = new THREE.Group();
  group.rotation.x = .18;
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x203832, 3));
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(-2, 3, 5);
  scene.add(light);
  const trackMaterial = new THREE.MeshStandardMaterial({ roughness:.35, metalness:.35 });
  const fillMaterial = new THREE.MeshStandardMaterial({ roughness:.25, metalness:.3 });
  const track = new THREE.Mesh(new THREE.TorusGeometry(1, .055, 12, 96), trackMaterial);
  group.add(track);
  const fill = new THREE.Mesh(new THREE.TorusGeometry(1, .058, 12, 96, .001), fillMaterial);
  fill.rotation.z = Math.PI / 2;
  fill.scale.x = -1;
  group.add(fill);
  let lastArc = -1;
  let frame = 0;
  let disposed = false;
  const draw = () => {
    frame = 0;
    if (disposed || document.hidden || !host.closest('.pomodoro-menu')?.matches('[aria-hidden="false"]')) return;
    const size = host.getBoundingClientRect();
    if (!size.width || !size.height) return;
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    const colors = getComputedStyle(host);
    trackMaterial.color.set(colors.getPropertyValue('--border').trim());
    fillMaterial.color.set(colors.getPropertyValue('--accent').trim());
    renderer.render(scene, camera);
    if (surface.width !== renderer.domElement.width || surface.height !== renderer.domElement.height) {
      surface.width = renderer.domElement.width;
      surface.height = renderer.domElement.height;
    }
    context.clearRect(0, 0, surface.width, surface.height);
    context.drawImage(renderer.domElement, 0, 0);
    host.classList.add('has-depth');
  };
  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
  const resize = new ResizeObserver(schedule);
  resize.observe(host);
  const theme = new MutationObserver(schedule);
  theme.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  const move = (event) => {
    if (event.pointerType !== 'mouse') return;
    const rect = host.getBoundingClientRect();
    group.rotation.x = .18 + ((event.clientY - rect.top) / rect.height - .5) * .2;
    group.rotation.y = ((event.clientX - rect.left) / rect.width - .5) * .3;
    schedule();
  };
  const reset = () => { group.rotation.set(.18, 0, 0); schedule(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    theme.disconnect();
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerleave', reset);
    document.removeEventListener('visibilitychange', schedule);
    host.classList.remove('has-depth');
    track.geometry.dispose(); fill.geometry.dispose();
    trackMaterial.dispose(); fillMaterial.dispose(); renderer.dispose();
    surface.remove();
  };
  renderer.domElement.addEventListener('webglcontextlost', dispose, { once:true });
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', reset);
  document.addEventListener('visibilitychange', schedule);
  host.appendChild(surface);
  return {
    update(progress) {
      if (disposed) return;
      const arc = Math.round(Math.max(0, Math.min(1, progress)) * 360);
      if (arc !== lastArc) {
        fill.geometry.dispose();
        fill.geometry = new THREE.TorusGeometry(1, .058, 12, Math.max(4, Math.ceil(arc / 4)), Math.max(.001, arc / 180 * Math.PI));
        fill.visible = arc > 0;
        lastArc = arc;
      }
      schedule();
    },
    dispose
  };
}
