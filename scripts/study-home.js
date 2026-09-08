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
  let depthPending = false;
  let generation = 0;
  let chartSignature = '';
  let days = [];
  let selection = 6;
  const buttons = Array.from({ length:7 }, () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.appendChild(document.createElement('span'));
    chart.appendChild(button);
    return button;
  });
  function selectDay(index) {
    selection = index;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    const day = days[index];
    if (day) write('[data-home-chart-detail]', `${new Date(day.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'short', day:'numeric' })} · ${duration(day.minutes)}`);
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => selectDay(index)));
  function cloneIcon(source, target) {
    const node = home.querySelector(target);
    const svg = document.querySelector(source)?.querySelector('svg');
    if (node && svg && !node.querySelector('svg')) node.replaceChildren(svg.cloneNode(true));
  }
  async function prepareDepth() {
    if (depth || depthPending || reduced.matches || navigator.connection?.saveData || document.hidden || home.hidden) return;
    const request = ++generation;
    depthPending = true;
    try {
      const module = await import('./study-scene.js?v=20260908-home');
      if (request !== generation || reduced.matches || home.hidden) return;
      depth = module.createStudyScene(host);
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
    write('[data-home-clock]', `${String(Math.floor(state.remaining / 60)).padStart(2,'0')}:${String(state.remaining % 60).padStart(2,'0')}`);
    write('[data-home-phase]', state.phase === 'study' ? 'Estudio' : 'Descanso');
    write('[data-home-block]', `Bloque ${state.block} de ${state.blocks}`);
    write('[data-home-timer-state]', state.running ? 'Sesión en curso' : state.alarm ? 'Bloque finalizado' : 'A tu ritmo');
    write('[data-home-today]', duration(state.todayMinutes));
    write('[data-home-week]', duration(state.weekMinutes));
    write('[data-home-streak]', `${state.currentStreak} ${state.currentStreak === 1 ? 'día' : 'días'} de racha`);
    write('[data-home-presence]', state.todayActive ? 'Objetivo diario completo' : `${Math.floor(state.todayMinutes)} de 25 min hoy`);
    write('[data-home-date]', new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' }));
    const signature = JSON.stringify(state.days);
    if (signature !== chartSignature) {
      chartSignature = signature;
      days = state.days;
      const max = Math.max(25, ...days.map(day => day.minutes));
      days.forEach((day,index) => {
        const date = new Date(day.date + 'T12:00:00');
        buttons[index].style.setProperty('--bar', `${Math.max(2, day.minutes / max * 100)}%`);
        buttons[index].firstChild.textContent = date.toLocaleDateString('es-AR',{weekday:'narrow'});
        const label = `${date.toLocaleDateString('es-AR',{weekday:'long',day:'numeric'})}: ${duration(day.minutes)}`;
        buttons[index].title = label;
        buttons[index].setAttribute('aria-label', label);
      });
      selectDay(selection);
    }
    depth?.update(state);
    cloneIcon('[data-streak-open]', '[data-home-flame]');
    cloneIcon('[data-general-ai-open]', '[data-home-ai-icon]');
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
    const prompt = event.target.closest('[data-home-prompt]');
    if (prompt) openAssistant(prompt.dataset.homePrompt);
    const shortcut = event.target.closest('[data-home-shortcut]');
    if (shortcut) window.dispatchEvent(new CustomEvent('estudiemos:home-navigate', { detail:{ view:shortcut.dataset.homeShortcut } }));
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
    prepareDepth();
  });
  window.addEventListener('pagehide', () => { depth?.dispose(); depth = null; generation++; depthPending = false; });
  window.addEventListener('pageshow', () => { prepareDepth(); update(); });
  organizationSummary();
  update();
  prepareDepth();
}
