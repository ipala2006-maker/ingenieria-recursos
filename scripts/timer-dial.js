export function attachTimerDial(element, { read, commit, preview = () => {} }) {
  let active = null;
  let proposed = 25;
  const clamp = value => Math.max(1, Math.min(59, Math.round(value)));
  function paint(value) {
    element.style.setProperty('--dial-angle', `${value * 6}deg`);
    element.setAttribute('aria-valuenow', String(value));
    element.setAttribute('aria-valuetext', `${value} minutos restantes`);
  }
  function update() { if (active === null) paint(clamp(read() / 60)); }
  function position(event) {
    const box = element.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    return { radius:Math.hypot(x,y) / (box.width / 2), value:clamp(((Math.atan2(x,-y) + Math.PI*2) % (Math.PI*2)) / (Math.PI*2) * 60) };
  }
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || active !== null) return;
    const point = position(event);
    if (point.radius < .55 || point.radius > 1.2) return;
    active = event.pointerId;
    element.setPointerCapture(active);
    element.classList.add('is-adjusting');
    proposed = point.value;
    paint(proposed);
    preview(proposed * 60);
    event.preventDefault();
  });
  element.addEventListener('pointermove', event => {
    if (active !== event.pointerId) return;
    proposed = position(event).value;
    paint(proposed);
    preview(proposed * 60);
  });
  function finish(event, save) {
    if (active !== event.pointerId) return;
    const id = active;
    active = null;
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
    const delta = {ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:5,PageDown:-5}[event.key];
    if (delta === undefined && !['Home','End'].includes(event.key)) return;
    event.preventDefault();
    commit((event.key === 'Home' ? 1 : event.key === 'End' ? 59 : clamp(read()/60 + delta)) * 60);
    update();
  });
  update();
  return { update };
}
