import { attachTimerDial } from './timer-dial.js?v=20260909-depth2';
const home = document.querySelector('[data-study-home]');
if (home) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const host = home.querySelector('[data-home-depth]');
  const chart = home.querySelector('[data-home-chart]');
  const write = (selector, text) => {
    const node = home.querySelector(selector);
    if (node && node.textContent !== String(text)) node.textContent = text;
  };
  const duration = value => `${Math.floor(value / 60)} h ${Math.floor(value % 60)} min`;
  let depth = null;
  let progressDepth = null;
  let organizerDepth = null;
  let motionEnabled = localStorage.getItem('estudiemos_scene_motion') !== 'off';
  const modelHost=home.querySelector('.study-assistant__route');
  const motionButton=home.querySelector('[data-home-motion]');
  let depthPending = false;
  let generation = 0;
  let chartSignature = '';
  let days = [];
  let selection = 6;
  let range = 'week';
  let period = 0;
  let dialPreview = null;
  let sequenceSignature = '';
  const session = home.querySelector('[data-home-session]');
  const sessionSummary = session.querySelector('summary');
  const sessionDialog = document.createElement('dialog');
  sessionDialog.className = 'study-session-dialog';
  sessionDialog.setAttribute('aria-labelledby','sessionDialogTitle');
  const sessionHead=document.createElement('header');
  const sessionTitle=document.createElement('h2');
  sessionTitle.id='sessionDialogTitle'; sessionTitle.textContent='Tu sesión';
  const sessionClose=document.createElement('button');
  sessionClose.type='button'; sessionClose.className='study-icon'; sessionClose.dataset.homeSessionClose='';
  sessionClose.setAttribute('aria-label','Cerrar configuración'); sessionClose.title='Cerrar';
  sessionHead.append(sessionTitle,sessionClose);
  const sessionBody=document.createElement('div'); sessionBody.className='study-session';
  sessionDialog.append(sessionHead,sessionBody);
  for(const child of Array.from(session.children)) if(child!==sessionSummary) sessionBody.appendChild(child);
  home.appendChild(sessionDialog);
  sessionSummary.setAttribute('aria-haspopup','dialog');
  sessionSummary.addEventListener('click',event=>{
    event.preventDefault();
    history.pushState({...history.state,estudiemosUi:'home-session'},'',location.href);
    sessionDialog.showModal();
    organizerDepth?.setVisible(false);
  });
  const closeSession=()=>{
    if(history.state?.estudiemosUi==='home-session') history.back();
    else sessionDialog.close();
  };
  sessionDialog.querySelector('[data-home-session-close]').addEventListener('click',closeSession);
  sessionDialog.querySelector('[data-home-session-done]').addEventListener('click',closeSession);
  sessionDialog.addEventListener('close',()=>{endHold();organizerDepth?.setVisible(!home.hidden);});
  sessionDialog.addEventListener('cancel',event=>{event.preventDefault();closeSession();});
  sessionDialog.addEventListener('click',event=>{
    const box=sessionDialog.getBoundingClientRect();
    if(event.target===sessionDialog && (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)) closeSession();
  });
  window.addEventListener('popstate',()=>{
    if(history.state?.estudiemosUi==='home-session' && !sessionDialog.open) sessionDialog.showModal();
    else if(history.state?.estudiemosUi!=='home-session' && sessionDialog.open) sessionDialog.close();
    organizerDepth?.setVisible(!home.hidden&&!sessionDialog.open);
  });
  if(history.state?.estudiemosUi==='home-session') sessionDialog.showModal();
  const dial = attachTimerDial(home.querySelector('[data-home-dial]'), {
    read: () => window.EstudiemosStudy?.snapshot().remaining ?? 1500,
    commit: seconds => window.EstudiemosStudy?.seek(seconds),
    preview: seconds => {
      dialPreview = seconds;
      if(seconds === null) update();
      else write('[data-home-clock]', `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
    }
  });
  const buttons = Array.from({ length:30 }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.appendChild(document.createElement('span'));
    chart.appendChild(button);
    button.hidden = index >= 7;
    return button;
  });
  function selectDay(index) {
    selection = index;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const day = days[index];
    if (day) write('[data-home-chart-detail]', `${new Date(day.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'short', day:'numeric' })} · ${duration(day.minutes)}`);
    const scrubber=home.querySelector('[data-home-day-scrubber]');
    scrubber.max=Math.max(0,days.length-1); scrubber.value=index;
    if(day) scrubber.setAttribute('aria-valuetext',buttons[index].getAttribute('aria-label'));
    progressDepth?.update(days,index);
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectDay(index));
    button.addEventListener('focus', () => selectDay(index));
    button.addEventListener('pointerenter', event => { if(event.pointerType === 'mouse') selectDay(index); });
    button.addEventListener('keydown', event => {
      const delta = {ArrowLeft:-1,ArrowRight:1}[event.key];
      if(delta === undefined) return;
      event.preventDefault();
      buttons[Math.max(0,Math.min(days.length-1,index+delta))].focus();
    });
  });
  function cloneIcon(source, target) {
    const origin = document.querySelector(source);
    const svg = origin?.matches('svg') ? origin : origin?.querySelector('svg');
    for(const node of home.querySelectorAll(target)) if(svg && !node.querySelector('svg')) node.replaceChildren(svg.cloneNode(true));
  }
  function updateMotionButton() {
    const label=motionEnabled?'Pausar movimiento 3D':'Activar movimiento 3D';
    motionButton.title=label;motionButton.setAttribute('aria-label',label);motionButton.setAttribute('aria-pressed',String(motionEnabled));
    if(motionButton.dataset.mode===label)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',motionEnabled?'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z':'M8 5.2v13.6L19 12 8 5.2Z');
    svg.appendChild(path);motionButton.replaceChildren(svg);motionButton.dataset.mode=label;
  }
  async function prepareDepth() {
    if ((depth && progressDepth && organizerDepth) || depthPending || reduced.matches || navigator.connection?.saveData || document.hidden || home.hidden) return;
    const request = ++generation;
    depthPending = true;
    try {
      const module = await import('./study-scene.js?v=20260909-depth2');
      if (request !== generation || reduced.matches || home.hidden) return;
      if(!depth) depth = module.createStudyScene(host);
      const progress = await import('./progress-depth.js?v=20260909-console');
      if(request !== generation || reduced.matches || home.hidden) return;
      if(!progressDepth) progressDepth = progress.createProgressDepth(chart,selectDay);
      home.querySelector('[data-progress-reset]').hidden=false;
      update();
      const organizer=await import('./organizer-depth.js?v=20260910-motion');
      if(request !== generation || reduced.matches || home.hidden)return;
      if(!organizerDepth) organizerDepth=organizer.createOrganizerDepth(modelHost,{motion:motionEnabled,onOpen:view=>window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view}}))});
      organizerDepth.setVisible(!sessionDialog.open);
      motionButton.hidden=false;updateMotionButton();
    } catch (_) {
      // The timer remains fully usable without WebGL.
    } finally { if (request === generation) depthPending = false; }
  }
  function update() {
    const state = window.EstudiemosStudy?.snapshot();
    if (!state) return;
    const toggle = home.querySelector('[data-home-timer]');
    toggle.disabled = false;
    const label = state.alarm ? 'Silenciar' : state.running ? 'Pausar' : 'Empezar';
    toggle.setAttribute('aria-label', `${label} Pomodoro`);
    write('[data-home-timer-label]', label);
    const iconHost = home.querySelector('[data-home-play]');
    if (iconHost.dataset.state !== label) {
      const icon = document.querySelector('[data-pomodoro-toggle] svg');
      if (icon) iconHost.replaceChildren(icon.cloneNode(true));
      iconHost.dataset.state = label;
    }
    const remaining = dialPreview ?? state.remaining;
    write('[data-home-adjust-value]', `${Math.ceil(remaining/60)} min`);
    write('[data-home-clock]', `${String(Math.floor(remaining / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}`);
    dial.update();
    write('[data-home-phase]', state.phase === 'study' ? 'Estudio' : 'Descanso');
    write('[data-home-block]', `Bloque ${state.block} de ${state.blocks}`);
    write('[data-home-timer-state]', state.running ? 'Sesión en curso' : state.alarm ? 'Bloque finalizado' : 'A tu ritmo');
    home.querySelector('[data-home-timer]').dataset.running=String(state.running);
    home.querySelector('[data-home-adjust="-1"]').disabled=remaining<=60;
    home.querySelector('[data-home-adjust="1"]').disabled=remaining>=3540;
    write('[data-home-today]', duration(state.todayMinutes));
    write('[data-home-week]', duration(state.weekMinutes));
    write('[data-home-streak]', `${state.currentStreak} ${state.currentStreak === 1 ? 'día' : 'días'} de racha`);
    write('[data-home-presence]', state.todayActive ? 'Objetivo diario completo' : `${Math.floor(state.todayMinutes)} de 25 min hoy`);
    write('[data-home-date]', new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' }));
    const history = window.EstudiemosStudy.history(range,period);
    const signature = JSON.stringify(history);
    if (signature !== chartSignature) {
      chartSignature = signature;
      days = history;
      chart.dataset.range = range;
      chart.style.setProperty('--days', days.length);
      buttons.forEach((button,index) => { button.hidden = index >= days.length; });
      const max = Math.max(25, ...days.map(day => day.minutes));
      write('[data-home-chart-scale]', `Máx. ${duration(max)}`);
      days.forEach((day,index) => {
        const date = new Date(day.date + 'T12:00:00');
        buttons[index].style.setProperty('--bar', `${Math.max(2, day.minutes / max * 100)}%`);
        buttons[index].firstChild.textContent = range === 'week' ? date.toLocaleDateString('es-AR',{weekday:'narrow'}) : (index % 5 === 0 || index === days.length-1 ? date.getDate() : '');
        const label = `${date.toLocaleDateString('es-AR',{weekday:'long',day:'numeric'})}: ${duration(day.minutes)}`;
        buttons[index].title = label;
        buttons[index].setAttribute('aria-label', label);
      });
      selectDay(Math.min(selection, days.length-1));
      const short = value => new Date(value+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'});
      write('[data-home-period-label]', `${short(days[0].date)} – ${short(days.at(-1).date)}`);
    }
    home.querySelector('[data-home-period-step="1"]').disabled = period === 0;
    for (const input of home.querySelectorAll('[data-home-config], [data-home-config-range]')) {
      const key = input.dataset.homeConfig || input.dataset.homeConfigRange;
      const active = document.activeElement;
      const editingKey = active?.dataset.homeConfig || active?.dataset.homeConfigRange;
      if(editingKey !== key) input.value = state.config[key];
    }
    home.querySelector('[data-home-auto]').checked = state.autoStart;
    home.querySelector('[data-home-alarm]').value = state.alarmMode;
    write('[data-home-alarm-name]',home.querySelector('[data-home-alarm] option:checked')?.textContent || 'Digital');
    if(document.activeElement !== home.querySelector('[data-home-volume]')) home.querySelector('[data-home-volume]').value = state.alarmVolume;
    write('[data-home-session-summary]', `${state.config.blocks} × ${state.config.study} min`);
    write('[data-home-session-total]', duration(state.config.blocks*state.config.study));
    for(const button of home.querySelectorAll('[data-home-config-step]')) {
      const input=home.querySelector(`[data-home-config="${button.dataset.configKey}"]`);
      const value=state.config[button.dataset.configKey];
      button.disabled=Number(button.dataset.homeConfigStep)<0 ? value<=Number(input.min) : value>=Number(input.max);
    }
    const sequence = JSON.stringify([state.config,state.block,state.phase]);
    if(sequenceSignature !== sequence) {
      sequenceSignature = sequence;
      const timeline = home.querySelector('[data-home-sequence]');
      timeline.replaceChildren();
      for(let index=0;index<Math.min(12,state.config.blocks);index++) {
        const segment = document.createElement('i');
        segment.classList.toggle('is-current',index+1===state.block);
        segment.style.flexGrow = Math.max(1,state.config.study);
        const rest = document.createElement('b');
        rest.style.flexGrow = Math.max(1,state.config.break);
        timeline.append(segment,rest);
      }
      home.querySelectorAll('[data-home-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.homePreset === [state.config.study,state.config.break,state.config.blocks].join(','))));
    }
    depth?.update(state);
    progressDepth?.update(days,selection);
    cloneIcon('[data-streak-open]', '[data-home-flame]');
    cloneIcon('[data-general-ai-open]', '[data-home-ai-icon]');
    cloneIcon('[data-pomodoro-config-toggle]', '[data-home-settings-icon]');
    cloneIcon('[data-pomodoro-alarm-preview]', '[data-home-bell]');
    cloneIcon('[data-pomodoro-reset]', '[data-progress-reset]');
    cloneIcon('[data-pomodoro-reset]', '[data-home-reset]');
    cloneIcon('[data-pomodoro-close]', '[data-home-session-close]');
    cloneIcon('[data-pomodoro-config-toggle] svg:last-child', '[data-home-alarm-chevron]');
    cloneIcon('[data-pomodoro-step="-1"]', '[data-home-config-step="-1"],[data-home-adjust="-1"]');
    cloneIcon('[data-pomodoro-step="1"]', '[data-home-config-step="1"],[data-home-adjust="1"]');
    cloneIcon('[data-quick-note-open]', '[data-home-node="inbox"]');
    cloneIcon('[data-agenda-open]', '[data-home-node="calendar"]');
    cloneIcon('[data-workspace-new-folder]', '[data-home-node="space"]');
  }
  function organizationSummary() {
    let agenda = [];
    try { const value = JSON.parse(localStorage.getItem('bandeja_agenda') || '[]'); if (Array.isArray(value)) agenda = value; } catch (_) {}
    const pending = agenda.filter(item => !item.done && !['clase','class','rutina'].includes(String(item.type || '').toLowerCase()));
    write('[data-home-pending]', `${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'}`);
  }
  function openAssistant(instruction = '') {
    window.dispatchEvent(new CustomEvent('estudiemos:open-general-ai', { detail:{ instruction } }));
  }
  function adjustControl(button) {
    if(button.disabled)return;
    if(button.hasAttribute('data-home-adjust')) window.EstudiemosStudy?.seek(window.EstudiemosStudy.snapshot().remaining + Number(button.dataset.homeAdjust)*60);
    else {
      const key=button.dataset.configKey,input=home.querySelector(`[data-home-config="${key}"]`);
      const value=Math.max(Number(input.min),Math.min(Number(input.max),window.EstudiemosStudy.snapshot().config[key]+Number(button.dataset.homeConfigStep)));
      window.EstudiemosStudy.configure(key,value);
    }
  }
  let hold=null,suppressed=null;
  function endHold(event) {
    if(!hold)return;
    const previous=hold;hold=null;clearTimeout(previous.timer);
    suppressed=previous.repeated&&event?.type==='pointerup'?previous.button:null;
    if(previous.button.hasPointerCapture(previous.id))previous.button.releasePointerCapture(previous.id);
  }
  home.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-home-config-step],[data-home-adjust]');
    if(!button || button.disabled || event.button!==0 || !event.isPrimary)return;
    endHold();suppressed=null;
    hold={button,id:event.pointerId,repeated:false,timer:0};button.setPointerCapture(event.pointerId);
    const repeat=()=>{
      if(!hold || button.disabled || !button.isConnected)return;
      hold.repeated=true;adjustControl(button);hold.timer=setTimeout(repeat,110);
    };
    hold.timer=setTimeout(repeat,400);
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])home.addEventListener(name,endHold);
  window.addEventListener('blur',endHold);
  home.addEventListener('click', event => {
    if(suppressed && event.detail>0 && event.target.closest('button')===suppressed){suppressed=null;event.preventDefault();return;}
    suppressed=null;
    const open = event.target.closest('[data-home-open]')?.dataset.homeOpen;
    if (open) event.stopPropagation();
    if (open === 'assistant') openAssistant();
    else if (open) document.querySelector(open === 'pomodoro' ? '.topbar [data-pomodoro-open]' : '.topbar [data-streak-open]')?.click();
    if (event.target.closest('[data-home-timer]')) window.EstudiemosStudy?.toggle();
    if(event.target.closest('[data-home-reset]'))document.querySelector('[data-pomodoro-reset]')?.click();
    const adjust = event.target.closest('[data-home-adjust],[data-home-config-step]');
    if(adjust)adjustControl(adjust);
    if(event.target.closest('[data-home-motion]')) {
      motionEnabled=!motionEnabled;localStorage.setItem('estudiemos_scene_motion',motionEnabled?'on':'off');
      organizerDepth?.setMotion(motionEnabled);updateMotionButton();
    }
    const preset = event.target.closest('[data-home-preset]');
    if(preset) ['study','break','blocks'].forEach((key,index) => window.EstudiemosStudy?.configure(key,Number(preset.dataset.homePreset.split(',')[index])));
    if(event.target.closest('[data-home-preview-alarm]')) window.EstudiemosStudy?.previewAlarm();
    if(event.target.closest('[data-progress-reset]')) progressDepth?.reset();
    const rangeButton = event.target.closest('[data-home-range]');
    if(rangeButton) {
      range = rangeButton.dataset.homeRange;
      period = 0; selection = range === 'week' ? 6 : 29;
      home.querySelectorAll('[data-home-range]').forEach(button => button.setAttribute('aria-pressed',String(button === rangeButton)));
      update();
    }
    const step = event.target.closest('[data-home-period-step]');
    if(step) { period = Math.max(-120,Math.min(0,period+Number(step.dataset.homePeriodStep))); update(); }
    const prompt = event.target.closest('[data-home-prompt]');
    if (prompt) openAssistant(prompt.dataset.homePrompt);
    const shortcut = event.target.closest('[data-home-shortcut], [data-home-destination]');
    if (shortcut) window.dispatchEvent(new CustomEvent('estudiemos:home-navigate', { detail:{ view:shortcut.dataset.homeShortcut || shortcut.dataset.homeDestination } }));
  });
  home.addEventListener('change', event => {
    const target = event.target;
    const key = target.dataset.homeConfig || target.dataset.homeConfigRange;
    if(key) window.EstudiemosStudy?.configure(key,Math.max(Number(target.min),Math.min(Number(target.max),Number(target.value)||0)));
    if(target.matches('[data-home-alarm]')) window.EstudiemosStudy?.alarm('mode',target.value);
    if(target.matches('[data-home-auto]')) window.EstudiemosStudy?.alarm('auto',target.checked);
    if(target.matches('[data-home-volume]')) window.EstudiemosStudy?.alarm('volume',target.value);
    if(key) { target.value = window.EstudiemosStudy.snapshot().config[key]; update(); }
  });
  home.addEventListener('input', event => {
    if(event.target.matches('[data-home-day-scrubber]')) selectDay(Number(event.target.value));
    const key = event.target.dataset.homeConfigRange;
    if(key) home.querySelector(`[data-home-config="${key}"]`).value = event.target.value;
  });
  home.querySelector('[data-home-ai-form]').addEventListener('submit', event => {
    event.preventDefault();
    openAssistant(home.querySelector('#homeAiPrompt').value.trim());
  });
  for (const name of ['estudiemos:study-ready','estudiemos:study-update','estudiemos:cloud-restored']) window.addEventListener(name, update);
  for (const name of ['storage','estudiemos:data-change','estudiemos:cloud-restored']) window.addEventListener(name, organizationSummary);
  window.addEventListener('estudiemos:home-view', () => { organizerDepth?.setVisible(!home.hidden&&!sessionDialog.open);prepareDepth(); update(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) endHold(); else { prepareDepth(); update(); } });
  reduced.addEventListener('change', () => {
    generation++;
    depthPending = false;
    depth?.dispose();
    depth = null;
    progressDepth?.dispose(); progressDepth=null;
    organizerDepth?.dispose(); organizerDepth=null;motionButton.hidden=true;
    home.querySelector('[data-progress-reset]').hidden=true;
    prepareDepth();
  });
  window.addEventListener('pagehide', () => { endHold();depth?.dispose(); depth = null; progressDepth?.dispose(); progressDepth=null;organizerDepth?.dispose();organizerDepth=null; generation++; depthPending = false; });
  window.addEventListener('pageshow', () => { prepareDepth(); update(); });
  organizationSummary();
  update();
  prepareDepth();
}
