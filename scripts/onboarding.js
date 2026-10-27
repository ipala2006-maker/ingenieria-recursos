(function () {
  if (window.EstudiemosOnboarding || !document.body.classList.contains('workspace-home')) return;
  const KEY = 'estudiemos_onboarding_v1';
  const root = new URL('../', document.currentScript.src);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const query = new URL(location.href);
  const requested = query.searchParams.get('tutorial') === '1';
  const classInvitation = ['clase','materia'].some(key=>new URLSearchParams(location.hash.slice(1)).has(key)) || ['clase','materia','materias','uploadClass'].some(key=>query.searchParams.has(key)) || pendingClass();
  let pending = requested || !classInvitation && !readStatus() && !hasPreviousUse();
  let active = false, busy = false, closing = false, tour, layer, ring, steps = [], current = -1;
  let cleanupPreview = () => {}, original, savedFocus, resizeFrame = 0, driverModule, targetObserver, exitTimer, transitionVersion = 0;
  const q = selector => document.querySelector(selector);
  const visible = element => Boolean(element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  window.EstudiemosOnboarding = Object.freeze({ start: () => start(true), pending: () => pending || active, isActive: () => active });
  if (requested) { query.searchParams.delete('tutorial'); history.replaceState(history.state, '', query); }
  if (!pending && !readStatus() && !classInvitation) remember('existing');
  function pendingClass() { try { return window.EstudiemosCourseInvitation?.pending(window.EstudiemosAccount?.getUser()?.id||'') || JSON.parse(sessionStorage.getItem('estudiemos_class_invite_v1') || 'null')?.expires > Date.now(); } catch (_) { return false; } }

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
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL(path + '?v=20261027-polished-tour', root);
      link.onload = resolve; link.onerror = reject; document.head.append(link);
    })));
    driverModule = await import(new URL('scripts/vendor/driver/driver.js.mjs', root));
    return driverModule;
  }
  function buildSteps() {
    const result = [
      {id:'welcome', title:'Bienvenido a Estudiemos', text:'Conocé lo esencial, a tu ritmo. Tocá a la derecha para avanzar y a la izquierda para volver. El recorrido no guarda cambios.'},
      {id:'note', title:'Anotá y seguí con tu día', text:'Guardá ideas y pendientes, con o sin fecha. Enter guarda la tarea; Shift + Enter prepara otra.', target:'[data-quick-note-form] .note-entry-title, [data-quick-note-form] [name=title]', view:'inbox', preview:'note'},
      {id:'alarms', title:'Un aviso a tiempo', text:'Elegí día, hora y repetición. La alarma es opcional y solo se activa con tu permiso.', target:'[data-quick-note-form] [name=inboxAlarmEnabled]', view:'inbox', preview:'note', parent:true},
    ];
    if (available('calendar')) result.push(
      {id:'calendar', title:'Tu semana, más clara', text:'Semana o mes, con tus materias y anotaciones. Elegí un día para ver sus horarios y actividades.', target:'[data-dashboard-calendar-widget] .dashboard-widget__head', view:'calendar'},
      {id:'program', title:'Tus horarios, programados', text:'Creá una fecha puntual o un horario que se repita. También podés elegir intervalos personalizados y un color.', target:'[data-calendar-editor] [name=repeat]', view:'calendar', preview:'program', parent:true}
    );
    if (available('focus')) result.push(
      {id:'pomodoro', title:'Tu tiempo de foco', text:'Ajustá el aro para elegir los minutos. Podés pausar o saltar al siguiente bloque o descanso.', target:'[data-home-space=focus] .study-focus__body', view:'overview'},
      {id:'session', title:'Una sesión a tu ritmo', text:'Elegí tiempos de estudio, pausas y cantidad de bloques. La alarma marca el cambio de etapa.', target:'.study-session-dialog .study-session__fields', view:'overview', preview:'session'}
    );
    if (available('progress')) result.push({id:'progress', title:'Cada día cuenta', text:'Tu tiempo de estudio, día por día. La racha suma un día cuando alcanzás tu objetivo diario.', target:'[data-home-space=progress] .study-progress__numbers', view:'overview'});
    result.push({id:'friends', title:'Estudiar, acompañados', text:'Invitá por usuario, correo o enlace. Tu racha es privada hasta que elijas compartirla.', target:'[data-friends-open]', view:'overview'});
    if (q('[data-classes-open]')) result.push({id:'classes',title:'Tu comisión, conectada',text:'Sumate con un enlace o código. Fechas y materiales compartidos, junto a tu agenda personal.',target:'[data-classes-open]',view:'overview'});
    if (window.EstudiemosRelease?.enabled('driveWorkspace') && available('workspace')) result.push({id:'drive', title:'Tus apuntes, en tu Drive', text:'Conectá Google Drive para tener tus carpetas a mano. La conexión y sus permisos los elegís vos.', target:'[data-home-space=workspace] .workspace-section__head', view:'space'});
    result.push(
      {id:'layout', title:'Un inicio a tu manera', text:'Agregá, mové o quitá herramientas sin borrar sus datos. Cada dispositivo guarda su propia distribución.', target:'.home-layout-toolbar', view:'overview', preview:'layout'},
      {id:'account', title:'Tu cuenta, conectada', text:'Usá la misma cuenta para sincronizar tus dispositivos. Acá también activás widgets y avisos, según cada equipo.', target:'.account-head', view:'overview', preview:'account'},
      {id:'done', title:'Listo para empezar', text:'Empezá con tu primera tarea. Podés volver a este recorrido desde tu cuenta cuando lo necesites.'}
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
    layer = document.createElement('dialog'); layer.className = 'onboarding-layer is-starting';
    layer.setAttribute('aria-labelledby', 'driver-popover-title'); layer.setAttribute('aria-describedby', 'driver-popover-description');
    ring = document.createElement('div'); ring.className = 'onboarding-focus'; ring.setAttribute('aria-hidden', 'true'); layer.append(ring);
    document.body.append(layer);
    layer.addEventListener('cancel', event => { event.preventDefault(); finish('skipped'); });
    layer.addEventListener('click', event => { if (!event.target.closest('button,a')) go(current+(event.clientX<innerWidth/2?-1:1)); });
    layer.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft'].includes(event.key)||['Enter',' '].includes(event.key)&&!event.target.closest('button,a')){event.preventDefault();event.stopPropagation();go(current+(event.key==='ArrowLeft'?-1:1));}});
  }
  function resolveTarget(step) {
    if(!step?.target)return null;
    const target=q(step.id==='session'&&innerHeight<650?'.study-session-dialog .study-session__field':step.target);
    return step.parent?target?.closest('label')||target:target;
  }
  function positionSpotlight(target = tour?.getActiveElement()) {
    if (!active) return;
    const box = target?.id !== 'driver-dummy-element' && target?.getBoundingClientRect();
    const width = innerWidth, height = innerHeight, padding = 8;
    const left = box ? Math.min(width, Math.max(0, box.left-padding)) : 0, top = box ? Math.min(height, Math.max(0, box.top-padding)) : 0;
    const right = box ? Math.max(left, Math.min(width, box.right+padding)) : 0, bottom = box ? Math.max(top, Math.min(height, box.bottom+padding)) : 0;
    layer.style.setProperty('--tour-clip', `polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,${left}px ${top}px,${left}px ${bottom}px,${right}px ${bottom}px,${right}px ${top}px,${left}px ${top}px)`);
    ring.hidden = !box; if (box) Object.assign(ring.style, {left:left+'px', top:top+'px', width:right-left+'px', height:bottom-top+'px'});
  }
  async function settlePreview(step) {
    if(reduced.matches || !step.target)return;
    const animations=[];
    for(let node=resolveTarget(step);node&&node!==document.body;node=node.parentElement){
      for(const animation of node.getAnimations()){
        const end=animation.effect?.getComputedTiming().endTime;
        if(animation.playState==='running'&&Number.isFinite(end)&&end<=400)animations.push(animation.finished.catch(()=>{}));
      }
    }
    if(!animations.length)return;
    let timeout;
    await Promise.race([Promise.all(animations),new Promise(resolve=>{timeout=setTimeout(resolve,260);})]);clearTimeout(timeout);
  }
  function revealStep() {
    positionSpotlight();targetObserver?.disconnect();
    const target=tour?.getActiveElement();
    if(target&&target.id!=='driver-dummy-element'&&window.ResizeObserver){targetObserver||=new ResizeObserver(resize);targetObserver.observe(target);}
    const version=transitionVersion;
    requestAnimationFrame(()=>{
      if(!active||closing||version!==transitionVersion)return;
      layer.classList.remove('is-starting','is-changing');busy=false;layer.focus({preventScroll:true});
    });
  }
  function decoratePopover(popover) {
    const groups={welcome:['Tu inicio','book-open'],note:['Organización','file-text'],alarms:['Organización','calendar-days'],calendar:['Organización','calendar-days'],program:['Organización','calendar-days'],pomodoro:['Concentración','book-open'],session:['Concentración','settings-2'],progress:['Tu progreso','book-open'],friends:['Conectados','users-round'],classes:['Conectados','graduation-cap'],drive:['Tus apuntes','folder'],layout:['Personalización','settings-2'],account:['Tu cuenta','users-round'],done:['A tu ritmo','book-open']};
    const [label,icon]=groups[steps[current].id],caption=document.createElement('div'),image=document.createElement('img'),text=document.createElement('span');
    caption.className='tour-context';image.src=new URL('assets/icons/'+icon+'.svg',root);image.alt='';image.width=18;image.height=18;text.textContent=label;caption.append(image,text);popover.wrapper.prepend(caption);
    const hint=document.createElement('span');hint.className='tour-hint';hint.textContent=matchMedia('(pointer:coarse)').matches?'Tocá a los lados':'Clic a los lados o flechas';popover.footer.append(hint);
    popover.wrapper.setAttribute('role','document');popover.closeButton.textContent='Omitir';
    popover.wrapper.style.setProperty('--tour-progress',((current+1)/steps.length*100)+'%');
  }
  async function go(index) {
    if (!active || busy || closing) return;
    if (index >= steps.length) { finish('completed'); return; }
    if (index < 0) return;
    busy = true;const version=++transitionVersion;
    try {
      const previous = steps[current], step = steps[index];
      layer.classList.add('is-changing');
      if(!reduced.matches)await new Promise(resolve=>setTimeout(resolve,80));
      if(!active||closing||version!==transitionVersion)return;
      const changePreview=previous?.preview!==step.preview,changeView=step.view&&previous?.view!==step.view;
      if(changePreview||changeView){
        if(changePreview)restorePreview();if(changeView)navigate(step.view);if(changePreview)cleanupPreview=openPreview(step.preview);
        // Restack above native previews in the same task, without painting an uncovered frame.
        layer.close();layer.showModal();await frame();await settlePreview(step);
      }
      if (!active||closing||version!==transitionVersion) return;
      current = index; layer.dataset.step = step.id;
      tour.moveTo(index);
    } catch (_) { if(version===transitionVersion)finish('interrupted'); }
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
      active = true; busy = true; closing = false; current = 0;transitionVersion++;
      original = {state:history.state, url:location.href, view:history.state?.homeView || 'overview', scrollX, scrollY};
      savedFocus = document.activeElement;
      steps = buildSteps(); createLayer(); layer.dataset.step = steps[0].id; layer.showModal();
      tour = driver({
        animate:false, smoothScroll:false, allowScroll:false, allowKeyboardControl:false,
        overlayOpacity:0, disableActiveInteraction:true, showProgress:true, progressText:'{{current}} de {{total}}',
        showButtons:['close'], closeBtnLabel:'Omitir recorrido',
        popoverClass:'estudiemos-tour', stagePadding:8, stageRadius:8,
        onNextClick:next, onPrevClick:() => go(current-1), onCloseClick:() => finish('skipped'),
        onHighlightStarted:element => positionSpotlight(element || null),
        onHighlighted:revealStep,
        onPopoverRender:popover => {
          layer.append(popover.wrapper);decoratePopover(popover);
        },
        onDestroyed:() => { if (active) finish('skipped'); },
        steps:steps.map(step => ({
          element:step.target ? () => { const target=resolveTarget(step);return visible(target)?target:undefined; } : undefined,
          popover:{title:step.title, description:step.text, side:'bottom', align:'center'}
        }))
      });
      tour.drive();
      return true;
    } catch (_) { pending = false; if (active) finish('interrupted'); else window.dispatchEvent(new CustomEvent('estudiemos:onboarding-finished')); return false; }
  }
  function finish(status) {
    if (!active) return;
    if(status!=='interrupted'&&!reduced.matches&&!closing){
      closing=true;busy=true;transitionVersion++;restorePreview();layer.classList.add('is-exiting');exitTimer=setTimeout(()=>finishNow(status),200);return;
    }
    if(status==='interrupted'||!closing)finishNow(status);
  }
  function finishNow(status) {
    if(!active)return;
    clearTimeout(exitTimer);transitionVersion++;targetObserver?.disconnect();cancelAnimationFrame(resizeFrame);
    restorePreview();
    active = false; pending = false; busy = false; closing = false;
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
  const resize = () => {
    if(!active||closing)return;cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{
      const target=resolveTarget(steps[current]);
      if(!busy&&visible(target)&&target!==tour?.getActiveElement())tour?.moveTo(current);
      else tour?.refresh();
      positionSpotlight();
    });
  };
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('scroll',resize,{capture:true,passive:true});
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
