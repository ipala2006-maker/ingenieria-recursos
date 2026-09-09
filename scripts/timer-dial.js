export function attachTimerDial(element, { read, commit, preview = () => {} }) {
  let active = null;
  let proposed = 25;
  let origin;
  let lastAngle = 0;
  let dragAngle = 150;
  const clamp = value => Math.max(1, Math.min(59, Math.round(value)));
  function paint(value, angle = value * 6) {
    const changed=element.style.getPropertyValue('--dial-angle') !== `${angle}deg`;
    element.style.setProperty('--dial-angle', `${angle}deg`);
    element.setAttribute('aria-valuenow', String(value));
    element.setAttribute('aria-valuetext', `${value} minutos restantes`);
    if(changed) element.dispatchEvent(new CustomEvent('estudiemos:dial-input', {bubbles:true,detail:{angle}}));
  }
  function update() { if (active === null) paint(clamp(read() / 60), Math.max(0,Math.min(354,read()/10))); }
  function position(event) {
    const box = origin || element.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    return { radius:Math.hypot(x,y) / (box.width / 2), angle:((Math.atan2(x,-y) + Math.PI*2) % (Math.PI*2)) * 180/Math.PI };
  }
  function move(event) {
    const point = position(event);
    // Unwrap at twelve o'clock instead of jumping between 59 and 1 minutes.
    const delta = ((point.angle-lastAngle+540)%360)-180;
    dragAngle += delta;
    lastAngle = point.angle;
    const angle=Math.max(6,Math.min(354,dragAngle));
    proposed = clamp(angle/6);
    paint(proposed,angle);
    preview(proposed*60);
  }
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || active !== null) return;
    const point = position(event);
    if (point.radius < .55 || point.radius > 1.2) return;
    origin = element.getBoundingClientRect();
    active = event.pointerId;
    element.setPointerCapture(active);
    element.classList.add('is-adjusting');
    lastAngle = point.angle;
    dragAngle = Math.max(6,Math.min(354,point.angle));
    proposed = clamp(dragAngle/6);
    paint(proposed,dragAngle);
    preview(proposed * 60);
    event.preventDefault();
  });
  element.addEventListener('pointermove', event => {
    if (active !== event.pointerId) return;
    move(event);
  });
  function finish(event, save) {
    if (active !== event.pointerId) return;
    if(save) move(event);
    const id = active;
    active = null;
    origin = null;
    element.classList.remove('is-adjusting');
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    preview(null);
    if (save) commit(proposed * 60);
    update();
  }
  element.addEventListener('pointerup', event => finish(event,true));
  element.addEventListener('pointercancel', event => finish(event,false));
  element.addEventListener('lostpointercapture', event => finish(event,false));
  element.addEventListener('keydown', event => {
    if(event.key === 'Escape' && active !== null) {
      event.preventDefault(); event.stopPropagation(); finish({pointerId:active},false); return;
    }
    const delta = {ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:5,PageDown:-5}[event.key];
    if (delta === undefined && !['Home','End'].includes(event.key)) return;
    event.preventDefault();
    commit((event.key === 'Home' ? 1 : event.key === 'End' ? 59 : clamp(read()/60 + delta)) * 60);
    update();
  });
  update();
  return { update };
}
