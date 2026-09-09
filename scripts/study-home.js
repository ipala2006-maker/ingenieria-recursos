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
  let depthPending = false;
  let generation = 0;
  let chartSignature = '';
  let days = [];
  let selection = 6;
  let range = 'week';
  let period = 0;
  let dialPreview = null;
  let sequenceSignature = '';
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
    const node = home.querySelector(target);
    const svg = document.querySelector(source)?.querySelector('svg');
    if (node && svg && !node.querySelector('svg')) node.replaceChildren(svg.cloneNode(true));
  }
  async function prepareDepth() {
    if ((depth && progressDepth) || depthPending || reduced.matches || navigator.connection?.saveData || document.hidden || home.hidden) return;
    const request = ++generation;
    depthPending = true;
    try {
      const module = await import('./study-scene.js?v=20260909-depth2');
      if (request !== generation || reduced.matches || home.hidden) return;
      if(!depth) depth = module.createStudyScene(host);
      const progress = await import('./progress-depth.js?v=20260909-depth2');
      if(request !== generation || reduced.matches || home.hidden) return;
      progressDepth = progress.createProgressDepth(chart,selectDay);
      home.querySelector('[data-progress-reset]').hidden=false;
      update();
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
    write('[data-home-clock]', `${String(Math.floor(remaining / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}`);
    dial.update();
    write('[data-home-phase]', state.phase === 'study' ? 'Estudio' : 'Descanso');
    write('[data-home-block]', `Bloque ${state.block} de ${state.blocks}`);
    write('[data-home-timer-state]', state.running ? 'Sesión en curso' : state.alarm ? 'Bloque finalizado' : 'A tu ritmo');
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
    if(document.activeElement !== home.querySelector('[data-home-volume]')) home.querySelector('[data-home-volume]').value = state.alarmVolume;
    write('[data-home-session-summary]', `${state.config.blocks} × ${state.config.study} min`);
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
  home.addEventListener('click', event => {
    const open = event.target.closest('[data-home-open]')?.dataset.homeOpen;
    if (open) event.stopPropagation();
    if (open === 'assistant') openAssistant();
    else if (open) document.querySelector(open === 'pomodoro' ? '.topbar [data-pomodoro-open]' : '.topbar [data-streak-open]')?.click();
    if (event.target.closest('[data-home-timer]')) window.EstudiemosStudy?.toggle();
    const adjust = event.target.closest('[data-home-adjust]');
    if(adjust) window.EstudiemosStudy?.seek(window.EstudiemosStudy.snapshot().remaining + Number(adjust.dataset.homeAdjust)*60);
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
    if(key) window.EstudiemosStudy?.configure(key,target.value);
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
  window.addEventListener('estudiemos:home-view', () => { prepareDepth(); update(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { prepareDepth(); update(); } });
  reduced.addEventListener('change', () => {
    generation++;
    depthPending = false;
    depth?.dispose();
    depth = null;
    progressDepth?.dispose(); progressDepth=null;
    home.querySelector('[data-progress-reset]').hidden=true;
    prepareDepth();
  });
  window.addEventListener('pagehide', () => { depth?.dispose(); depth = null; progressDepth?.dispose(); progressDepth=null; generation++; depthPending = false; });
  window.addEventListener('pageshow', () => { prepareDepth(); update(); });
  organizationSummary();
  update();
  prepareDepth();
}
