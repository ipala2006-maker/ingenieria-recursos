(function () {
  if (window.EstudiemosOnboarding || !document.body.classList.contains('workspace-home')) return;
  const KEY = 'estudiemos_onboarding_v1';
  const root = new URL('../', document.currentScript.src);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const query = new URL(location.href);
  const requested = query.searchParams.get('tutorial') === '1';
  const classInvitation = new URLSearchParams(location.hash.slice(1)).has('clase') || query.searchParams.has('clase') || pendingClass();
  let pending = requested || !classInvitation && !readStatus() && !hasPreviousUse();
  let active = false, busy = false, tour, layer, ring, steps = [], current = -1;
  let cleanupPreview = () => {}, original, savedFocus, resizeFrame = 0, driverModule;
  const q = selector => document.querySelector(selector);
  const visible = element => Boolean(element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  window.EstudiemosOnboarding = Object.freeze({ start: () => start(true), pending: () => pending || active, isActive: () => active });
  if (requested) { query.searchParams.delete('tutorial'); history.replaceState(history.state, '', query); }
  if (!pending && !readStatus() && !classInvitation) remember('existing');
  function pendingClass() { try { return JSON.parse(sessionStorage.getItem('estudiemos_class_invite_v1') || 'null')?.expires > Date.now(); } catch (_) { return false; } }

  function readStatus() { try { return JSON.parse(localStorage.getItem(KEY) || 'null')?.status || ''; } catch (_) { return ''; } }
  function remember(status) { try { localStorage.setItem(KEY, JSON.stringify({version:1, status})); } catch (_) {} }
  function hasPreviousUse() {
    try {
      const streak = JSON.parse(localStorage.getItem('estudiemos_pomodoro_streak') || '{}');
      return Boolean(localStorage.getItem('estudiemos_cloud_user') || Object.keys(streak.days || {}).length || Number(streak.goal?.updatedAt) > 0 || ['bandeja_agenda', 'bandeja_horarios'].some(key => JSON.parse(localStorage.getItem(key) || '[]').length));
    } catch (_) { return false; }
  }
  function ready() {
    return window.EstudiemosStudy && window.EstudiemosTimetable && window.EstudiemosAccount && q('[data-home-navigation]') && q('.study-session-dialog') && q('[data-quick-note-form] [name=inboxDateEnabled]') && q('[data-calendar-editor] form') && q('[data-friends-open]');
  }
  function occupied() {
    return q('dialog[open]') || q('.account-shell:not([hidden]),[data-quick-panel]:not([hidden]),.home-layout-done:not([hidden])') || document.body.classList.contains('home-layout-editing');
  }
  function available(key) {
    return !q(`[data-home-space="${key}"]`)?.classList.contains('home-space-disabled') && (window.EstudiemosRelease?.homeSpaceEnabled(key) ?? true);
  }
  function navigate(view) { window.dispatchEvent(new CustomEvent('estudiemos:home-navigate', {detail:{view, replace:true}})); }
  function click(selector) { q(selector)?.click(); }
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function loadDriver() {
    if (driverModule) return driverModule;
    const styles = ['scripts/vendor/driver/driver.css', 'styles/onboarding.css'];
    await Promise.all(styles.map(path => new Promise((resolve, reject) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL(path + '?v=20261023', root);
      link.onload = resolve; link.onerror = reject; document.head.append(link);
    })));
    driverModule = await import(new URL('scripts/vendor/driver/driver.js.mjs', root));
    return driverModule;
  }
  function buildSteps() {
    const result = [
      {id:'welcome', title:'Bienvenido a Estudiemos', text:'Conocé tus herramientas, una por una. Avanzá con un clic o con Siguiente. Este recorrido no guarda tareas ni cambia tu configuración.'},
      {id:'note', title:'Anotá y seguí con tu día', text:'Escribí una tarea o una idea. Puede quedar sin fecha, tener un día asignado o incluir una alarma. Enter la guarda; Shift + Enter guarda y prepara otra.', target:'[data-quick-note-form] .note-entry-title, [data-quick-note-form] [name=title]', view:'inbox', preview:'note'},
      {id:'alarms', title:'Un aviso cuando lo necesites', text:'La fecha y la alarma son opcionales. Podés elegir día, hora y repetición. Las notificaciones se activan con tu permiso; este recorrido no solicita ninguno.', target:'[data-quick-note-form] [name=inboxAlarmEnabled]', view:'inbox', preview:'note', parent:true},
    ];
    if (available('calendar')) result.push(
      {id:'calendar', title:'Tu semana y tus fechas, juntas', text:'Alterná entre semana y mes, elegí un día y revisá sus actividades con sus horarios. Los colores te ayudan a distinguir materias y anotaciones.', target:'[data-dashboard-calendar-widget] .dashboard-widget__head', view:'calendar'},
      {id:'program', title:'Tus horarios, programados', text:'Elegí horario, período y color. Creá una actividad única, repetila por semana o personalizá el intervalo, por ejemplo cada 13 días.', target:'[data-calendar-editor] [name=repeat]', view:'calendar', preview:'program', parent:true}
    );
    if (available('focus')) result.push(
      {id:'pomodoro', title:'Tu Pomodoro', text:'Ajustá el tiempo con el aro. Empezá, pausá o saltá al descanso y al siguiente bloque.', target:'[data-home-space=focus] .study-focus__body', view:'overview'},
      {id:'session', title:'Una sesión a tu ritmo', text:'Elegí los minutos de estudio y descanso, la cantidad de bloques y el sonido de la alarma. Cerrá esta configuración y seguí desde el inicio.', target:innerHeight < 650 && innerWidth < 500 ? '.study-session-dialog .study-session__field' : '.study-session-dialog .study-session__fields', view:'overview', preview:'session'}
    );
    if (available('progress')) result.push({id:'progress', title:'Tu progreso y tu racha', text:'Explorá cuánto estudiaste cada día. Tu racha crece al alcanzar el objetivo diario, que podés cambiar desde el ícono de la llama.', target:'[data-home-space=progress] .study-progress__numbers', view:'overview'});
    result.push({id:'friends', title:'Estudiar, acompañados', text:'Agregá amigos por usuario o correo, o compartí tu enlace. Podés ver el ranking de rachas entre quienes decidan compartirlas; la tuya es privada por defecto.', target:'[data-friends-open]', view:'overview'});
    if (q('[data-classes-open]')) result.push({id:'classes',title:'Tu clase, conectada',text:'Como profesor, compartí fechas y materiales de Drive. Como alumno, un código te suma a la clase y agrega sus fechas a tu calendario.',target:'[data-classes-open]',view:'overview'});
    if (window.EstudiemosRelease?.enabled('driveWorkspace') && available('workspace')) result.push({id:'drive', title:'Tus apuntes, en tu Drive', text:'Conectá tu Google Drive cuando quieras para ver tus carpetas y archivos en Mi espacio. Vos elegís autorizar la conexión; el recorrido no abre tu cuenta de Google.', target:'[data-home-space=workspace] .workspace-section__head', view:'space'});
    result.push(
      {id:'layout', title:'Hacé lugar a tu manera', text:'Desde estos ajustes podés mover las herramientas, cambiar su tamaño y elegir cuáles ver. Cada dispositivo conserva su propia distribución.', target:'.study-home__head', view:'overview', preview:'layout'},
      {id:'account', title:'Tu cuenta, conectada', text:'Usá la misma cuenta en tus dispositivos para sincronizarte. Acá también configurás widgets y alarmas con la app cerrada, según tu dispositivo y sus permisos.', target:'.account-head', view:'overview', preview:'account'},
      {id:'done', title:'Listo. Este es tu espacio', text:'Ya podés empezar por una anotación o una sesión de estudio. El recorrido vuelve a estar disponible en Cuenta cuando lo necesites.'}
    );
    return result;
  }
  function openPreview(name) {
    if (name === 'note') { click('.topbar [data-quick-note-open]'); return () => click('[data-quick-panel=note] [data-quick-panel-close]'); }
    if (name === 'program') { click('[data-dashboard-calendar-widget] [data-calendar-add]'); return () => q('[data-calendar-reader]')?.close(); }
    if (name === 'session') { click('[data-home-session] summary'); return () => q('.study-session-dialog')?.close(); }
    if (name === 'account') { window.EstudiemosAccount.open(); return () => click('[data-account-close]'); }
    if (name === 'layout') { click('[data-home-customize]'); return () => click('.home-layout-done'); }
    return () => {};
  }
  function restorePreview() {
    cleanupPreview(); cleanupPreview = () => {};
    document.querySelectorAll('.driver-layer:empty').forEach(node => node.remove());
  }
  function createLayer() {
    layer = document.createElement('dialog'); layer.className = 'onboarding-layer';
    layer.setAttribute('aria-labelledby', 'driver-popover-title'); layer.setAttribute('aria-describedby', 'driver-popover-description');
    ring = document.createElement('div'); ring.className = 'onboarding-focus'; ring.setAttribute('aria-hidden', 'true'); layer.append(ring);
    document.body.append(layer);
    layer.addEventListener('cancel', event => { event.preventDefault(); finish('skipped'); });
    layer.addEventListener('click', event => { if (!event.target.closest('button,a')) next(); });
  }
  function positionSpotlight(target = tour?.getActiveElement()) {
    if (!active) return;
    const box = target?.id !== 'driver-dummy-element' && target?.getBoundingClientRect();
    const width = innerWidth, height = innerHeight, padding = 8;
    const left = box ? Math.max(0, box.left-padding) : 0, top = box ? Math.max(0, box.top-padding) : 0;
    const right = box ? Math.min(width, box.right+padding) : 0, bottom = box ? Math.min(height, box.bottom+padding) : 0;
    layer.style.setProperty('--tour-clip', `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${left}px ${top}px,${left}px ${bottom}px,${right}px ${bottom}px,${right}px ${top}px,${left}px ${top}px)`);
    ring.hidden = !box; if (box) Object.assign(ring.style, {left:left+'px', top:top+'px', width:right-left+'px', height:bottom-top+'px'});
  }
  async function go(index) {
    if (!active || busy) return;
    if (index >= steps.length) { finish('completed'); return; }
    if (index < 0) return;
    busy = true;
    try {
      const previous = steps[current], step = steps[index];
      if (tour.getState().popover) tour.getState().popover.wrapper.style.visibility = 'hidden';
      layer.close();
      if (previous?.preview !== step.preview) { restorePreview(); if (step.view) navigate(step.view); cleanupPreview = openPreview(step.preview); }
      else if (step.view) navigate(step.view);
      await frame();
      if (!active) return;
      layer.showModal();
      current = index; layer.dataset.step = step.id;
      tour.moveTo(index);
    } catch (_) { finish('interrupted'); }
  }
  function next() { go(current+1); }
  async function start(manual = false) {
    if (active || !ready()) return false;
    if (manual) click('[data-account-close]');
    if (occupied()) return false;
    pending = true;
    try {
      const {driver} = await loadDriver();
      if (occupied() || active) { pending = false; return false; }
      active = true; busy = true; current = 0;
      original = {state:history.state, url:location.href, view:history.state?.homeView || 'overview', scrollX, scrollY};
      savedFocus = document.activeElement;
      steps = buildSteps(); createLayer(); layer.dataset.step = steps[0].id; layer.showModal();
      tour = driver({
        animate:!reduced.matches, duration:200, smoothScroll:false, allowScroll:false,
        overlayOpacity:0, disableActiveInteraction:true, showProgress:true, progressText:'{{current}} / {{total}}',
        nextBtnText:'Siguiente', prevBtnText:'Atrás', doneBtnText:'Ir a mi inicio', closeBtnLabel:'Omitir recorrido',
        popoverClass:'estudiemos-tour', stagePadding:8, stageRadius:8,
        onNextClick:next, onPrevClick:() => go(current-1), onCloseClick:() => finish('skipped'),
        onHighlightStarted:element => positionSpotlight(element || null),
        onHighlighted:() => { busy = false; positionSpotlight(); tour.getState().popover?.nextButton.focus({preventScroll:true}); },
        onPopoverRender:popover => {
          layer.append(popover.wrapper); popover.wrapper.setAttribute('role','document');
          popover.closeButton.textContent = 'Omitir'; popover.nextButton.focus({preventScroll:true});
          popover.wrapper.style.setProperty('--tour-progress', ((current+1)/steps.length*100)+'%');
        },
        onDestroyed:() => { if (active) finish('skipped'); },
        steps:steps.map(step => ({
          element:step.target ? () => { const target = q(step.target); return visible(target) ? step.parent ? target.closest('label') || target : target : undefined; } : undefined,
          popover:{title:step.title, description:step.text, side:'bottom', align:'center'}
        }))
      });
      tour.drive();
      return true;
    } catch (_) { pending = false; if (active) finish('interrupted'); else window.dispatchEvent(new CustomEvent('estudiemos:onboarding-finished')); return false; }
  }
  function finish(status) {
    if (!active) return;
    restorePreview();
    active = false; pending = false; busy = false;
    tour?.destroy(); layer?.close(); layer?.remove();
    if (status !== 'interrupted') remember(status);
    if (original) { history.replaceState(original.state, '', original.url); navigate(original.view); scrollTo(original.scrollX, original.scrollY); }
    savedFocus?.isConnected && savedFocus.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('estudiemos:onboarding-finished', {detail:{status}}));
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-onboarding-replay]')) return;
    event.preventDefault(); start(true);
  });
  const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(positionSpotlight); };
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('pagehide', () => { if (active) finish('interrupted'); });
  window.addEventListener('estudiemos:study-update', () => { if (active && window.EstudiemosStudy?.snapshot().alarm) finish('interrupted'); });
  new MutationObserver(() => { if (active && q('.inbox-alarm-notice[open]')) finish('interrupted'); }).observe(document.body, {subtree:true, attributes:true, attributeFilter:['open']});
  const startedAt = Date.now();
  const watcher = new MutationObserver(check);
  let checkTimer;
  function check() {
    if (!pending || active) { if (!pending) { watcher.disconnect(); clearTimeout(checkTimer); } return; }
    if (ready() && !occupied()) { watcher.disconnect(); clearTimeout(checkTimer); start(); return; }
    if (Date.now()-startedAt > 20000) { pending = false; watcher.disconnect(); clearTimeout(checkTimer); window.dispatchEvent(new CustomEvent('estudiemos:onboarding-finished')); return; }
    clearTimeout(checkTimer); checkTimer = setTimeout(check, 250);
  }
  if (pending) { watcher.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['open','hidden']}); check(); }
})();
