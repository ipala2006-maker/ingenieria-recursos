(function () {
  if (window.__estudiemosDashboardInstalled) return;
  window.__estudiemosDashboardInstalled = true;

  const AGENDA_KEY = "bandeja_agenda";
  const SUBJECTS_KEY = "bandeja_materias";
  const STREAK_KEY = "estudiemos_pomodoro_streak";
  const CALENDAR_VIEW_KEY = "estudiemos_calendar_view";
  const CALENDAR_BACKUP_KEY = "bandeja_calendario_papelera";
  let calendarToolsOwner = '', calendarToolsBusy = false, calendarToolsEpoch = 0;
  const workspaceHome = document.body.classList.contains("workspace-home");
  const MAX_AGENDA_ITEMS = 500;
  const mobileHome = matchMedia("(max-width:620px)");
  mobileHome.addEventListener("change", () => renderAgenda());
  const state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    date: toDateValue(new Date()),
    calendarSource: 'all',
    calendarDraft: null,
    scheduleMode: false,
    calendarView: localStorage.getItem(CALENDAR_VIEW_KEY) === "month" ? "month" : "week"
  };

  addTopbarActions();
  addPanels();
  window.dispatchEvent(new CustomEvent('estudiemos:note-forms-ready'));
  bindEvents();
  renderDashboard();
  if (window.ResizeObserver) {
    let calendarResizeFrame = 0;
    const calendarSizes = new WeakMap();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(calendarResizeFrame);
      calendarResizeFrame = requestAnimationFrame(() => {
        let changed = false;
        for (const grid of document.querySelectorAll('[data-dashboard-calendar]')) {
          if (!grid.clientWidth) continue;
          const size = `${grid.clientWidth}x${grid.clientHeight}`;
          if (calendarSizes.get(grid) !== size) { calendarSizes.set(grid, size); changed = true; }
        }
        if (changed) renderCalendar();
      });
    });
    document.querySelectorAll('[data-dashboard-calendar]').forEach(grid => observer.observe(grid));
  }
  window.addEventListener('estudiemos:alarms-ready', renderDashboard);
  syncPanelsWithHistory();
  restorePendingAssistant();

  function addTopbarActions() {
    const nav = document.querySelector(".topbar__nav");
    if (!nav) return;

    if (!nav.querySelector("[data-quick-note-open]")) {
      const note = document.createElement("button");
      note.className = "topbar__link topbar-icon-btn quick-note-top-btn";
      note.type = "button";
      note.dataset.quickNoteOpen = "true";
      note.setAttribute("aria-label", "Crear una anotación");
      note.title = "Nueva anotación";
      note.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h10v17H5v-17Z"/><path d="m17.2 7.1 2.2 2.2-7.8 7.8-3.2.8.8-3.2 8-7.6Z"/></svg>';
      nav.appendChild(note);
    }

    if (!nav.querySelector("[data-general-ai-open]")) {
      const assistant = document.createElement("button");
      assistant.className = "topbar__link topbar-icon-btn general-ai-top-btn";
      assistant.type = "button";
      assistant.dataset.generalAiOpen = "true";
      assistant.setAttribute("aria-label", "Abrir asistente de Estudiemos");
      assistant.title = "Asistente";
      assistant.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"/><path d="m18.2 14 .7 2.2 2.1 1.1-2.1 1.1-.7 2.2-.7-2.2-2.1-1.1 2.1-1.1.7-2.2Z"/></svg>';
      nav.appendChild(assistant);
    }
  }

  function addPanels() {
    addCalendarReader();
    addCalendarTools();
    if (!document.querySelector('[data-quick-panel="note"]')) {
      const shell = document.createElement("section");
      shell.className = "quick-panel-shell";
      shell.dataset.quickPanel = "note";
      shell.hidden = true;
      shell.setAttribute("aria-hidden", "true");
      shell.innerHTML = `
        <div class="quick-panel" role="dialog" aria-modal="true" aria-labelledby="quickNoteTitle">
          <header class="quick-panel__head">
            <div><p>Anotación rápida</p><h2 id="quickNoteTitle">Nueva tarea</h2></div>
            <button class="quick-panel__close" type="button" data-quick-panel-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </header>
          <form class="quick-panel__form quick-panel__form--note" data-quick-note-form>
            <label class="quick-panel__field">¿Qué tenés que hacer?<input name="title" maxlength="90" required autocomplete="off" placeholder="Ej: Resolver la guía 2" /></label>
            <p class="quick-panel__status" data-quick-note-status role="status" aria-live="polite"></p>
            <button class="quick-panel__submit" type="submit" disabled><svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 17 19 7"/></svg><span>Guardar tarea</span></button>
          </form>
        </div>`;
      document.body.appendChild(shell);
    }

    if (!document.querySelector('[data-quick-panel="assistant"]')) {
      const shell = document.createElement("section");
      shell.className = "quick-panel-shell";
      shell.dataset.quickPanel = "assistant";
      shell.hidden = true;
      shell.setAttribute("aria-hidden", "true");
      shell.innerHTML = `
        <div class="quick-panel quick-panel--assistant" role="dialog" aria-modal="true" aria-labelledby="generalAiTitle">
          <header class="quick-panel__head">
            <div><p>Organizador inteligente</p><h2 id="generalAiTitle">Decilo como te salga.</h2></div>
            <button class="quick-panel__close" type="button" data-quick-panel-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </header>
          <div class="assistant-chat" aria-live="polite">
            <div class="assistant-chat__message assistant-chat__message--assistant">
              <span class="assistant-chat__avatar" aria-hidden="true">✦</span>
              <div><strong>¿Qué necesitás organizar?</strong><p>Puedo trabajar con tu Inbox, calendario, carpetas y archivos.</p></div>
            </div>
            <div class="assistant-chat__message assistant-chat__message--user" data-general-ai-user hidden><p></p></div>
            <p class="quick-panel__status assistant-chat__message assistant-chat__message--assistant" data-general-ai-status role="status"></p>
          </div>
          <form class="quick-panel__form quick-panel__form--assistant" data-general-ai-form>
            <label class="sr-only" for="generalAiInstruction">Tu indicación</label>
            <div class="assistant-chat__composer">
              <textarea id="generalAiInstruction" name="instruction" maxlength="1200" rows="3" required placeholder="Escribí o dictá una indicación..."></textarea>
              <button class="quick-panel__submit" type="submit" aria-label="Enviar indicación"><span aria-hidden="true">↑</span></button>
            </div>
            <p class="quick-panel__hint">Vas a revisar los cambios antes de aplicarlos.</p>
          </form>
        </div>`;
      document.body.appendChild(shell);
    }
  }

  function addCalendarTools() {
    const style = document.createElement('link'); style.rel = 'stylesheet';
    style.href = new URL('../styles/calendar-integration.css?v=20261019-planner', document.currentScript.src); document.head.appendChild(style);
    document.querySelectorAll('[data-calendar-surface] .dashboard-calendar__controls').forEach(controls => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-expand calendar-add';
      button.dataset.calendarAdd = ''; button.title = 'Agregar al calendario'; button.setAttribute('aria-label', 'Agregar al calendario');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      controls.appendChild(button);
    });
    const dialog = document.createElement('dialog'); dialog.className = 'calendar-tools-dialog'; dialog.dataset.calendarTools = ''; dialog.setAttribute('aria-labelledby', 'calendarToolsTitle');
    dialog.innerHTML = `<header><h2 id="calendarToolsTitle">Agregar al calendario</h2><button type="button" data-calendar-tools-close aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <div data-calendar-create-options hidden></div><div data-calendar-color-list hidden></div>
      <section data-calendar-settings-content hidden></section>
      <p class="calendar-settings-status" data-calendar-settings-status role="status" aria-live="polite"></p>`;
    document.body.appendChild(dialog);
    let origin;
    dialog.addEventListener('calendar-tools-open', event => { origin = event.detail; });
    dialog.addEventListener('close', () => { calendarToolsEpoch++; if (origin?.isConnected) origin.focus({preventScroll:true}); });
    for (const name of ['estudiemos:account-change', 'estudiemos:account-synced', 'estudiemos:cloud-restored']) {
      window.addEventListener(name, () => {
        if (dialog.open && calendarToolsOwner !== calendarIdentity()) dialog.close();
      });
    }
  }

  function openCalendarTools(trigger, mode = 'create') {
    const dialog = document.querySelector('[data-calendar-tools]');
    calendarToolsEpoch++;
    calendarToolsOwner = calendarIdentity();
    dialog.dispatchEvent(new CustomEvent('calendar-tools-open', {detail:trigger}));
    dialog.querySelector('#calendarToolsTitle').textContent = mode === 'colors' ? 'Colores del calendario' : mode === 'settings' ? 'Configurar calendario' : 'Agregar al calendario';
    dialog.querySelector('[data-calendar-create-options]').hidden = true;
    dialog.querySelector('[data-calendar-color-list]').hidden = mode !== 'colors';
    dialog.querySelector('[data-calendar-settings-content]').hidden = mode !== 'settings';
    dialog.querySelector('[data-calendar-settings-status]').textContent = '';
    if (mode === 'settings') renderCalendarSettings();
    if (mode === 'colors') {
      const schedules = window.EstudiemosTimetableRules?.list(readList('bandeja_horarios')) || [];
      const colored = readAgenda().filter(item => window.EstudiemosTimetableRules?.COLORS.includes(item.color));
      dialog.querySelector('[data-calendar-color-list]').innerHTML = schedules.map(item => `<div class="calendar-color-key timetable-color--${item.color}"><i aria-hidden="true"></i><span>${escapeHtml(item.title)}<small>Horario fijo · ${item.start}-${item.end}</small></span></div>`).join('') + colored.map(item => `<div class="calendar-color-key timetable-color--${item.color}"><i aria-hidden="true"></i><span>${escapeHtml(item.title)}<small>${escapeHtml(shortDate(item.date))} · ${escapeHtml(formatCalendarTime(item))}</small></span></div>`).join('') + '<div class="calendar-color-key is-class"><i aria-hidden="true"></i><span>Clase puntual</span></div><div class="calendar-color-key is-exam"><i aria-hidden="true"></i><span>Examen</span></div><div class="calendar-color-key is-task"><i aria-hidden="true"></i><span>Tarea o anotación</span></div>';
    }
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-calendar-tools-close]').disabled = false;
    dialog.querySelector('[data-calendar-tools-close]').focus();
  }

  function calendarIdentity() { return window.EstudiemosAccount?.getUser()?.id || 'guest'; }

  function renderCalendarSettings() {
    const schedules = window.EstudiemosTimetableRules?.read(localStorage) || [];
    const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dated = readList(AGENDA_KEY).filter(item => parseDateValue(item?.date));
    document.querySelector('[data-calendar-settings-content]').innerHTML = `<div class="calendar-settings-head"><h3>Horarios fijos <small>${schedules.length}</small></h3><button type="button" data-calendar-add-weekly aria-label="Agregar horario fijo" title="Agregar horario fijo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>
      <div class="calendar-settings-schedules">${schedules.map(item => `<button type="button" class="calendar-settings-schedule timetable-color--${item.color}" data-calendar-edit-schedule="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.recurrence ? window.EstudiemosTimetableRules.describe(item) : item.days.map(day => weekdays[day]).join(' · '))} · ${item.start}–${item.end}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/></svg></button>`).join('') || '<p class="calendar-settings-empty">Todavía no hay horarios fijos.</p>'}</div>
      <div class="calendar-settings-cleanup"><button type="button" data-calendar-clear ${!dated.length && !schedules.length ? 'disabled' : ''}>Vaciar calendario</button><p>Quita las anotaciones con fecha y los horarios fijos. Conserva tus notas sin fecha, tu racha y tu progreso.</p>
      <div data-calendar-clear-confirm hidden><strong>¿Vaciar tu calendario?</strong><p>Podés recuperar esta limpieza desde aquí hasta que vuelvas a vaciarlo.</p><div><button type="button" data-calendar-cleanup-cancel>Cancelar</button><button type="button" data-calendar-cleanup-confirm>Vaciar y guardar copia</button></div></div>
      <button type="button" data-calendar-restore ${readList(CALENDAR_BACKUP_KEY).length ? '' : 'hidden'}>Recuperar última limpieza</button></div>`;
  }

  function calendarCleanupValues(agenda, weekly, backups, restore, now = Date.now()) {
    const rules = window.EstudiemosTimetableRules;
    if (!rules || !Array.isArray(agenda) || !Array.isArray(weekly) || !Array.isArray(backups)) throw new Error('Datos no disponibles.');
    const dated = agenda.filter(item => parseDateValue(item?.date));
    if (!restore) {
      if (!dated.length && !weekly.length) return null;
      return { [CALENDAR_BACKUP_KEY]: [{createdAt:now, agenda:dated, weekly}], [AGENDA_KEY]:agenda.filter(item => !parseDateValue(item?.date)), [rules.KEY]:[] };
    }
    const backup = backups[0];
    if (!backup || !Array.isArray(backup.agenda) || !Array.isArray(backup.weekly)) throw new Error('No hay una copia para recuperar.');
    const merge = (old, current) => [...new Map([...old, ...current].map(item => [item.id, item])).values()];
    const notes = merge(backup.agenda, agenda), schedules = merge(backup.weekly, weekly);
    if (notes.length > MAX_AGENDA_ITEMS || schedules.length > rules.MAX_ITEMS) throw new Error('No hay espacio para recuperar todo. Quitá algunas actividades primero.');
    return { [AGENDA_KEY]:notes, [rules.KEY]:schedules, [CALENDAR_BACKUP_KEY]:[] };
  }

  function writeCalendarCleanup(values) {
    // Save the recovery copy before clearing either list; roll back storage failures.
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, localStorage.getItem(key)]));
    try { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) {
      for (const [key, raw] of Object.entries(previous)) { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }
      throw error;
    }
    for (const key of Object.keys(values)) window.dispatchEvent(new CustomEvent('estudiemos:data-change', {detail:{key}}));
  }

  async function cleanCalendar(restore = false) {
    const dialog = document.querySelector('[data-calendar-tools]'), status = dialog.querySelector('[data-calendar-settings-status]');
    if (calendarToolsBusy || calendarIdentity() !== calendarToolsOwner || !dialog.open) return;
    const owner = calendarToolsOwner, epoch = calendarToolsEpoch;
    calendarToolsBusy = true; dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
    status.textContent = 'Guardando…';
    try {
      if (owner !== 'guest' && !await window.EstudiemosAccount.refresh()) throw new Error('No se pudo sincronizar. Intentá de nuevo cuando tengas conexión.');
      if (calendarIdentity() !== owner || !dialog.open || calendarToolsEpoch !== epoch) return;
      const read = key => { const value = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(value)) throw new Error('No se pudo leer el calendario.'); return value; };
      const values = calendarCleanupValues(read(AGENDA_KEY), read('bandeja_horarios'), read(CALENDAR_BACKUP_KEY), restore);
      if (values) writeCalendarCleanup(values);
      renderCalendarSettings(); renderDashboard();
      const synced = owner === 'guest' || await window.EstudiemosAccount.sync();
      if (calendarIdentity() !== owner || !dialog.open || calendarToolsEpoch !== epoch) return;
      status.textContent = !synced ? 'Guardado en este dispositivo. La sincronización está pendiente.' : restore ? 'Calendario recuperado.' : 'Calendario vacío. Tu copia está disponible para recuperar.';
    } catch (error) { if (calendarIdentity() === owner && dialog.open && calendarToolsEpoch === epoch) status.textContent = error.message || 'No se pudo completar la limpieza.'; }
    finally {
      calendarToolsBusy = false;
      dialog.querySelector('[data-calendar-tools-close]').disabled = false;
      if (calendarIdentity() === owner && dialog.open && calendarToolsEpoch === epoch) { renderCalendarSettings(); dialog.querySelector('[data-calendar-tools-close]').focus(); }
    }
  }

  function openCalendarNote() {
    document.querySelector('[data-calendar-tools]')?.close();
    document.querySelector('[data-calendar-reader][open]')?.close();
    openPanel('note');
    const date = state.date;
    document.querySelector('[data-quick-note-form]').dataset.calendarDate = date;
    waitForElement('[data-quick-note-form] [name="inboxDateEnabled"]', toggle => {
      const form = toggle.form;
      if (form.closest('[data-quick-panel]').hidden) return;
      toggle.checked = true; form.elements.inboxNoteDate.value = date;
      toggle.dispatchEvent(new Event('change', {bubbles:true}));
    });
  }

  function addCalendarReader() {
    if (document.querySelector('[data-calendar-reader]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'calendar-reader';
    dialog.dataset.calendarReader = '';
    dialog.setAttribute('aria-labelledby', 'calendarReaderTitle');
    dialog.innerHTML = `
      <header class="calendar-reader__head">
        <h2 id="calendarReaderTitle">Tu calendario</h2>
        <button class="calendar-expand" type="button" data-calendar-reader-close aria-label="Cerrar calendario" title="Cerrar calendario"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="calendar-reader__body">
        <section class="calendar-reader__overview dashboard-calendar" data-calendar-surface aria-label="Elegir un día">
          <header class="dashboard-widget__head">
            <h3 data-dashboard-month></h3><small class="calendar-reader__preview-label" data-calendar-preview-label hidden>Vista previa · sin guardar</small>
            <div class="dashboard-calendar__controls">
              <button type="button" class="study-calendar-today" data-dashboard-today>Hoy</button>
              <div class="dashboard-calendar__views" aria-label="Vista del calendario">
                <button type="button" data-dashboard-calendar-view="week">Semana</button>
                <button type="button" data-dashboard-calendar-view="month">Mes</button>
              </div>
              <div class="dashboard-widget__nav">
                <button type="button" data-dashboard-month-change="-1" aria-label="Período anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
                <button type="button" data-dashboard-month-change="1" aria-label="Período siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
              </div>
            </div>
          </header>
          <div class="dashboard-calendar__weekdays" aria-hidden="true"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div>
          <div class="dashboard-calendar__grid" data-dashboard-calendar></div>
        </section>
        <section class="calendar-reader__detail" aria-label="Actividades y programación">
          <div class="calendar-reader__tabs" role="tablist" aria-label="Panel del calendario"><button type="button" role="tab" id="calendarAgendaTab" data-calendar-detail-tab="agenda" aria-controls="calendarAgendaPanel" aria-selected="true">Actividades</button><button type="button" role="tab" id="calendarProgramTab" data-calendar-detail-tab="program" aria-controls="calendarProgramPanel" aria-selected="false" tabindex="-1">Programar</button></div>
          <div class="calendar-reader__agenda" id="calendarAgendaPanel" data-calendar-agenda-panel role="tabpanel" aria-labelledby="calendarAgendaTab">
          <header class="calendar-reader__day-head"><h3 id="calendarDayTitle"></h3><p data-calendar-day-count role="status"></p></header>
          <div class="calendar-reader__activities" data-calendar-day-items></div>
          <footer><button class="calendar-reader__edit" type="button" data-calendar-edit-day>Ver en Inbox</button></footer>
          </div>
          <section class="calendar-planner" id="calendarProgramPanel" data-calendar-editor role="tabpanel" aria-labelledby="calendarProgramTab" hidden></section>
        </section>
      </div>`;
    document.body.appendChild(dialog);
    let returnFocus = null;
    let returnDate = null;
    dialog.addEventListener('close', () => {
      document.body.classList.remove('calendar-reader-open');
      setCalendarPane(false);
      state.calendarDraft = null;
      renderCalendar();
      window.dispatchEvent(new CustomEvent('estudiemos:calendar-closed'));
      const target = returnFocus?.isConnected ? returnFocus : document.querySelector(`[data-dashboard-calendar-widget] [data-dashboard-date="${returnDate}"]`) || document.querySelector('[data-calendar-expand]');
      target?.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('calendar-open', event => { returnFocus = event.detail; returnDate = event.detail?.dataset.dashboardDate; });
    window.dispatchEvent(new CustomEvent('estudiemos:calendar-ready'));
  }

  function setCalendarPane(editing) {
    const reader = document.querySelector('[data-calendar-reader]');
    reader.dataset.editing = String(editing);
    reader.querySelector('[data-calendar-agenda-panel]').hidden = editing;
    reader.querySelector('[data-calendar-editor]').hidden = !editing;
    reader.querySelectorAll('[data-calendar-detail-tab]').forEach(tab => {
      const selected = (tab.dataset.calendarDetailTab === 'program') === editing;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    });
  }

  function openCalendarPlanner(options = {}) {
    document.querySelector('[data-calendar-tools]')?.close();
    const start = () => window.EstudiemosTimetable.open({date:state.date, ...options});
    if (window.EstudiemosTimetable) start();
    else waitForElement('[data-calendar-editor] form', start);
  }

  function openCalendarReader(trigger) {
    const dialog = document.querySelector('[data-calendar-reader]');
    if (!dialog || dialog.open) return;
    dialog.dispatchEvent(new CustomEvent('calendar-open', { detail: trigger }));
    document.body.classList.add('calendar-reader-open');
    dialog.showModal();
    renderCalendar();
    dialog.querySelector('[data-calendar-reader-close]').focus();
  }

  function bindEvents() {
    window.addEventListener('estudiemos:calendar-edit-preview', event => {
      state.calendarDraft = event.detail;
      const date = parseDateValue(event.detail?.date);
      if (date) { state.date = toDateValue(date); state.year = date.getFullYear(); state.month = date.getMonth(); }
      renderCalendar();
    });
    window.addEventListener('estudiemos:calendar-edit-open', () => {
      state.calendarSource = 'all';
      openCalendarReader(document.activeElement);
      setCalendarPane(true);
      if (mobileHome.matches) document.querySelector('.calendar-reader__body').scrollTop = 0;
    });
    window.addEventListener('estudiemos:calendar-edit-cancel', () => { state.calendarDraft = null; setCalendarPane(false); renderCalendar(); document.querySelector('[data-calendar-detail-tab="agenda"]')?.focus(); });
    window.addEventListener('estudiemos:calendar-edit-saved', event => {
      const date = parseDateValue(event.detail?.date);
      state.calendarDraft = null;
      if (date) { state.date = toDateValue(date); state.year = date.getFullYear(); state.month = date.getMonth(); }
      state.calendarSource = 'all'; setCalendarPane(false); renderCalendar();
      document.querySelector('[data-calendar-detail-tab="program"]')?.focus();
    });
    window.addEventListener('estudiemos:calendar-entry-added', () => { state.calendarDraft = null; renderCalendar(); });
    let swipeStart = null;
    let suppressCalendarClickUntil = 0;
    const calendar = document.querySelector('[data-dashboard-calendar]');
    calendar?.addEventListener('pointerdown', event => {
      if(event.pointerType === 'mouse' || !event.isPrimary) return;
      swipeStart = {x:event.clientX,y:event.clientY};
    }, {passive:true});
    calendar?.addEventListener('pointercancel', () => { swipeStart = null; });
    calendar?.addEventListener('pointerup', event => {
      if(!swipeStart) return;
      const dx = event.clientX-swipeStart.x, dy = event.clientY-swipeStart.y;
      swipeStart = null;
      if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.5) {
        suppressCalendarClickUntil = Date.now()+400;
        moveMonth(dx<0 ? 1 : -1);
      }
    });
    document.addEventListener('keydown', event => {
      const pane = event.target.closest('[data-calendar-detail-tab]');
      if (pane && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const program = event.key === 'End' || (event.key !== 'Home' && pane.dataset.calendarDetailTab === 'agenda');
        if (program) openCalendarPlanner({retain:true}); else { state.calendarDraft = null; setCalendarPane(false); renderCalendar(); document.querySelector('[data-calendar-detail-tab="agenda"]').focus(); }
        return;
      }
      const activeGrid = event.target.closest('[data-dashboard-calendar]');
      if (!activeGrid) return;
      const cells = Array.from(activeGrid.querySelectorAll('[data-dashboard-date]'));
      const index = cells.indexOf(event.target);
      const delta = {ArrowRight:1,ArrowLeft:-1,ArrowDown:state.calendarView==='month'?7:1,ArrowUp:state.calendarView==='month'?-7:-1}[event.key];
      if(index<0 || delta===undefined) return;
      event.preventDefault();
      cells[Math.max(0,Math.min(cells.length-1,index+delta))]?.focus();
    });
    document.addEventListener("click", (event) => {
      const course = event.target.closest('[data-calendar-class]');
      if (course) { document.querySelector('[data-calendar-reader][open]')?.close(); window.EstudiemosClasses?.open({id:course.dataset.calendarClass}); return; }
      const add = event.target.closest('[data-calendar-add]');
      if (add) return openCalendarPlanner();
      const pane = event.target.closest('[data-calendar-detail-tab]');
      if (pane) { if (pane.dataset.calendarDetailTab === 'program') openCalendarPlanner({retain:true}); else { state.calendarDraft = null; setCalendarPane(false); renderCalendar(); } return; }
      const colors = event.target.closest('[data-calendar-colors]');
      if (colors) return openCalendarTools(colors, 'colors');
      const settings = event.target.closest('[data-calendar-settings]');
      if (settings) return openCalendarTools(settings, 'settings');
      if (event.target.closest('[data-calendar-clear]')) { document.querySelector('[data-calendar-clear-confirm]').hidden = false; document.querySelector('[data-calendar-cleanup-cancel]').focus(); return; }
      if (event.target.closest('[data-calendar-cleanup-cancel]')) { document.querySelector('[data-calendar-clear-confirm]').hidden = true; document.querySelector('[data-calendar-clear]').focus(); return; }
      if (event.target.closest('[data-calendar-cleanup-confirm]')) return cleanCalendar();
      if (event.target.closest('[data-calendar-restore]')) return cleanCalendar(true);
      if (event.target.closest('[data-calendar-tools-close]')) return document.querySelector('[data-calendar-tools]').close();
      if (event.target.closest('[data-calendar-add-note]')) return openCalendarNote();
      const weekly = event.target.closest('[data-calendar-add-weekly],[data-calendar-edit-schedule],[data-calendar-edit-entry]');
      if (weekly) {
        document.querySelector('[data-calendar-tools]')?.close();
        openCalendarPlanner({date:weekly.dataset.calendarDay || state.date, id:weekly.dataset.calendarEditSchedule, agendaId:weekly.dataset.calendarEditEntry, repeat:weekly.hasAttribute('data-calendar-add-weekly') ? 'weekly' : undefined});
        return;
      }
      if (event.target.closest('[data-calendar-schedule]')) {
        state.scheduleMode = true;
        renderCalendar();
        return;
      }
      const expand = event.target.closest('[data-calendar-expand]');
      if (expand) return openCalendarReader(expand);
      if (event.target.closest('[data-calendar-reader-close]')) return document.querySelector('[data-calendar-reader]').close();
      if (event.target.closest('[data-calendar-edit-day]')) {
        const reader = document.querySelector('[data-calendar-reader]');
        if (reader?.open) reader.close();
        // Open after the click finishes so the Inbox's outside-click handler does not close it.
        requestAnimationFrame(() => openAgenda({ date: state.date }));
        return;
      }
      if(event.target.closest('[data-dashboard-today]')) {
        const now = new Date();
        state.date = toDateValue(now); state.month=now.getMonth(); state.year=now.getFullYear();
        renderCalendar();
        return;
      }
      if (event.target.closest("[data-quick-note-open]")) {
        openPanel("note");
        return;
      }
      if (event.target.closest("[data-general-ai-open]")) {
        openPanel("assistant");
        return;
      }
      if (event.target.closest("[data-quick-panel-close]") || event.target.matches(".quick-panel-shell")) {
        closeActivePanel();
        return;
      }
      if (event.target.closest("[data-dashboard-space]")) {
        document.getElementById("mi-espacio")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const monthChange = event.target.closest("[data-dashboard-month-change]");
      if (monthChange) {
        moveMonth(Number(monthChange.dataset.dashboardMonthChange) || 0, Boolean(monthChange.closest('[data-calendar-reader]')));
        return;
      }
      const calendarView = event.target.closest("[data-dashboard-calendar-view]");
      if (calendarView) {
        state.scheduleMode = false;
        state.calendarView = calendarView.dataset.dashboardCalendarView === "month" ? "month" : "week";
        localStorage.setItem(CALENDAR_VIEW_KEY, state.calendarView);
        window.dispatchEvent(new CustomEvent("estudiemos:calendar-view-change", { detail: { view: state.calendarView } }));
        renderCalendar();
        return;
      }
      const day = event.target.closest("[data-dashboard-date]");
      if (day) {
        if(Date.now()<suppressCalendarClickUntil) return;
        const fromReader = Boolean(day.closest('[data-calendar-reader]'));
        const date = parseDateValue(day.dataset.dashboardDate);
        if (!date) return;
        state.date = day.dataset.dashboardDate;
        state.month = date.getMonth();
        state.year = date.getFullYear();
        if (!fromReader) state.scheduleMode = true;
        renderCalendar();
        const target = fromReader
          ? document.querySelector('[data-calendar-reader] [data-dashboard-date="' + state.date + '"]')
          : document.querySelector('[data-calendar-schedule]');
        target?.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest("[data-dashboard-agenda-open]")) {
        openAgenda();
        return;
      }
      const done = event.target.closest("[data-dashboard-agenda-done]");
      if (done) toggleDone(done.dataset.dashboardAgendaDone);
    });

    const noteForm = document.querySelector("[data-quick-note-form]");
    document.addEventListener('change', event => {
      if (!event.target.matches('[data-calendar-filter]')) return;
      state.calendarSource = ['weekly','dated','classes'].includes(event.target.value) ? event.target.value : 'all';
      renderCalendar();
    });
    function selectScheduleDate(event) {
      const date = parseDateValue(event.target.value);
      if (!date || toDateValue(date) === state.date) return;
      state.date = toDateValue(date); state.month = date.getMonth(); state.year = date.getFullYear();
      renderCalendar();
    }
    const scheduleDate = document.querySelector('[data-calendar-schedule-input]');
    scheduleDate?.addEventListener('input', selectScheduleDate);
    scheduleDate?.addEventListener('change', selectScheduleDate);
    noteForm?.elements.title.addEventListener("input", () => {
      noteForm.querySelector('[type="submit"]').disabled = !noteForm.elements.title.value.trim();
      noteForm.querySelector('[data-quick-note-status]').textContent = '';
    });
    noteForm?.addEventListener("submit", saveQuickNote);
    document.querySelector("[data-general-ai-form]")?.addEventListener("submit", routeGeneralAssistant);

    window.addEventListener("popstate", syncPanelsWithHistory);
    window.addEventListener("storage", (event) => {
      if ([AGENDA_KEY, SUBJECTS_KEY, STREAK_KEY, 'bandeja_horarios'].includes(event.key)) {
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:data-change", (event) => {
      if (!event.detail?.key || [AGENDA_KEY, SUBJECTS_KEY, STREAK_KEY, 'bandeja_horarios'].includes(event.detail.key)) {
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:cloud-restored", () => {
      renderDashboard();
    });
    window.addEventListener('estudiemos:timetable-ready', renderCalendar);
    window.addEventListener('estudiemos:classes-updated', renderCalendar);
    window.addEventListener('estudiemos:class-calendar', event => {
      const date = parseDateValue(event.detail?.date); if (!date) return;
      state.date=toDateValue(date); state.year=date.getFullYear(); state.month=date.getMonth(); state.calendarSource='all';
      window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'calendar'}}));
      openCalendarReader(document.activeElement); renderCalendar();
    });
    window.addEventListener('estudiemos:note-colors-ready', renderAgenda);
    window.addEventListener("estudiemos:workspace-update", updateSpaceSummary);
    window.addEventListener("estudiemos:open-general-ai", (event) => {
      openPanel("assistant");
      const input = document.querySelector("[data-general-ai-form] textarea");
      if (input && typeof event.detail?.instruction === "string") {
        input.value = event.detail.instruction.slice(0, 1200);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    window.addEventListener("estudiemos:calendar-view-change", (event) => {
      state.scheduleMode = false;
      state.calendarView = event.detail?.view === "month" ? "month" : "week";
      renderCalendar();
    });
  }

  function openPanel(name) {
    if (name === 'assistant' && !window.EstudiemosRelease?.enabled('ai')) return window.EstudiemosReleaseUI?.show('ai');
    const panel = document.querySelector(`[data-quick-panel="${name}"]`);
    if (!panel) return;
    if (name === 'note') delete panel.querySelector('form').dataset.calendarDate;
    hidePanels();
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("quick-panel-open");
    if (history.state?.estudiemosUi !== `quick-${name}`) {
      history[window.EstudiemosOnboarding?.isActive() ? 'replaceState' : 'pushState']({ ...(history.state || {}), estudiemosUi: `quick-${name}` }, "", location.href);
    }
    if (!window.EstudiemosOnboarding?.isActive()) requestAnimationFrame(() => panel.querySelector("input,textarea,select")?.focus());
  }

  function closeActivePanel() {
    if (window.EstudiemosOnboarding?.isActive()) { hidePanels(); return; }
    if (String(history.state?.estudiemosUi || "").startsWith("quick-")) {
      history.back();
      return;
    }
    hidePanels();
  }

  function hidePanels() {
    document.querySelectorAll("[data-quick-panel]").forEach((panel) => {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    });
    document.body.classList.remove("quick-panel-open");
  }

  function syncPanelsWithHistory() {
    const ui = String(history.state?.estudiemosUi || "");
    const name = ui.startsWith("quick-") ? ui.slice(6) : "";
    hidePanels();
    if (!name) return;
    const panel = document.querySelector(`[data-quick-panel="${name}"]`);
    if (!panel) return;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("quick-panel-open");
  }

  function saveQuickNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset?.calendarDate && !form.elements.inboxDateEnabled) {
      form.querySelector('[data-quick-note-status]').textContent = 'La fecha todavía se está preparando. Probá nuevamente en un momento.';
      return;
    }
    const title = form.elements.title.value.trim();
    if (!title) return;
    const items = readAgenda();
    items.unshift({
      id: `agenda:${Date.now()}:note:${randomId()}`,
      title: title.slice(0, 90),
      type: "Tarea",
      date: window.EstudiemosInboxAlarms?.readDate(form) || "",
      subject: "",
      note: "",
      horaInicio: "",
      horaFin: "",
      done: false,
      alarm: window.EstudiemosInboxAlarms?.readForm(form) || null,
      ...(window.EstudiemosTimetableRules?.COLORS.includes(form.elements?.noteColor?.value) ? { color: form.elements.noteColor.value } : {}),
      createdAt: Date.now()
    });
    writeAgenda(items.slice(0, MAX_AGENDA_ITEMS));
    if (window.EstudiemosNoteEntry?.continuing(form)) {
      form.elements.title.value = '';
      const alarm = form.elements.inboxAlarmEnabled;
      if (alarm) { alarm.checked = false; alarm.dispatchEvent(new Event('change', { bubbles: true })); }
      form.querySelector('[type="submit"]').disabled = true;
      form.querySelector('[data-quick-note-status]').textContent = 'Tarea guardada.';
      form.elements.title.focus();
      return;
    }
    form.reset();
    form.querySelector('[type="submit"]').disabled = true;
    closeActivePanel();
  }

  async function routeGeneralAssistant(event) {
    if (!window.EstudiemosRelease?.enabled('ai')) { event?.preventDefault(); return window.EstudiemosReleaseUI?.show('ai'); }
    event.preventDefault();
    const form = event.currentTarget;
    const instruction = form.elements.instruction.value.trim();
    const button = form.querySelector('[type="submit"]');
    if (!instruction || button.disabled) return;
    showGeneralAssistantUserMessage(instruction);
    if (window.EstudiemosAlarmRules?.hasIntent(instruction)) {
      closeActivePanel();
      handOffToAssistant('agenda', instruction);
      return;
    }
    setAssistantStatus("Estoy entendiendo qué querés organizar...", "loading");
    button.disabled = true;

    try {
      const account = window.EstudiemosAccount;
      if (account) await account.whenReady();
      const accessToken = account?.getSession()?.access_token || "";
      if (!accessToken) {
        setAssistantStatus("Ingresá a tu cuenta para usar el asistente.", "error");
        account?.open();
        return;
      }
      const response = await fetch("/api/assistant-router", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({ instruction })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No pudimos interpretar la indicación.");
      if (result.route?.clarification) {
        setAssistantStatus(result.route.clarification, "info");
        return;
      }
      const destination = result.route?.destination;
      if (!['agenda', 'workspace'].includes(destination)) {
        setAssistantStatus("¿Querés organizar tu Inbox, calendario o archivos?", "info");
        return;
      }
      setAssistantStatus(destination === "agenda" ? "Entendí. Voy a preparar los cambios en tu Inbox y calendario." : "Entendí. Voy a preparar la organización de tu espacio.", "success");
      form.reset();
      await new Promise((resolve) => window.setTimeout(resolve, 380));
      closeActivePanel();
      window.setTimeout(() => handOffToAssistant(destination, instruction), 100);
    } catch (error) {
      setAssistantStatus(error.message || "La IA no respondió. Probá nuevamente.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function handOffToAssistant(destination, instruction) {
    if (destination === "agenda") {
      openAgenda({ assistant: true, prompt: instruction, submit: true });
      return;
    }
    window.dispatchEvent(new CustomEvent("estudiemos:close-agenda"));
    if (!document.querySelector("[data-workspace-ai]")) {
      sessionStorage.setItem("estudiemos_pending_workspace_ai", instruction);
      location.href = document.querySelector(".brand")?.href || "/";
      return;
    }
    window.setTimeout(() => {
      const trigger = document.querySelector("[data-workspace-ai]");
      trigger?.click();
      waitForElement('[data-workspace-ai-form] textarea[name="instruction"]', (input) => {
        input.value = instruction;
        input.closest("form")?.requestSubmit();
      });
    }, 120);
  }

  function restorePendingAssistant() {
    if (!workspaceHome) return;
    const instruction = sessionStorage.getItem("estudiemos_pending_workspace_ai") || "";
    if (!instruction) return;
    sessionStorage.removeItem("estudiemos_pending_workspace_ai");
    window.setTimeout(() => handOffToAssistant("workspace", instruction), 180);
  }

  function setAssistantStatus(message, type) {
    const status = document.querySelector("[data-general-ai-status]");
    if (!status) return;
    status.textContent = message;
    status.className = `quick-panel__status assistant-chat__message assistant-chat__message--assistant${type ? ` is-${type}` : ""}`;
  }

  function showGeneralAssistantUserMessage(message) {
    const bubble = document.querySelector("[data-general-ai-user]");
    const text = bubble?.querySelector("p");
    if (!bubble || !text) return;
    text.textContent = message;
    bubble.hidden = false;
  }

  function waitForElement(selector, callback, attempts = 80) {
    const element = document.querySelector(selector);
    if (element) return callback(element);
    if (attempts <= 0) return setAssistantStatus("No pudimos abrir esa herramienta. Probá nuevamente.", "error");
    window.setTimeout(() => waitForElement(selector, callback, attempts - 1), 50);
  }

  function openAgenda(detail = {}) {
    const dispatch = () => window.dispatchEvent(new CustomEvent("estudiemos:open-agenda", { detail }));
    if (document.querySelector(".agenda-board")) return dispatch();
    waitForElement(".agenda-board", dispatch, 100);
  }

  function renderDashboard() {
    renderCalendar();
    renderAgenda();
  }

  function renderCalendar() {
    const focus = parseDateValue(state.date) || new Date();
    const title = state.calendarView === "week"
      ? formatWeekRange(focus)
      : new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(state.year, state.month, 1));
    const streak = readStreakProgress();
    const first = new Date(state.year, state.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = state.calendarView === "week"
      ? startOfWeek(focus)
      : new Date(state.year, state.month, 1 - offset);
    const monthWeeks = Math.ceil((offset + new Date(state.year, state.month + 1, 0).getDate()) / 7);
    const cellCount = state.calendarView === "week" ? 7 : monthWeeks * 7;
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + cellCount - 1);
    const recurring = window.EstudiemosTimetableRules?.occurrences(readList('bandeja_horarios'), toDateValue(start), toDateValue(end)) || [];
    const draft = state.calendarDraft;
    const previews = (draft?.schedule ? window.EstudiemosTimetableRules.occurrences([draft.schedule], toDateValue(start), toDateValue(end)) : draft?.entry ? [draft.entry] : []).map(item => ({...item,preview:true}));
    const shared = window.EstudiemosClasses?.events(toDateValue(start),toDateValue(end)) || [];
    const agenda = [...readAgenda(), ...recurring, ...shared].filter(item => !draft?.replaceId || (item.id !== draft.replaceId && item.scheduleId !== draft.replaceId)).concat(previews).filter(item => state.calendarSource === 'all' || (state.calendarSource === 'classes' ? item.classId : state.calendarSource === 'weekly' ? item.scheduleId : !item.scheduleId&&!item.classId));
    document.querySelectorAll('[data-calendar-preview-label]').forEach(label => { label.hidden = !previews.length; });
    const dated = agenda.reduce((map, item) => {
      if (!item.date) return map;
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
      return map;
    }, new Map());
    const today = toDateValue(new Date());
    document.querySelectorAll("[data-dashboard-calendar-view]").forEach((button) => {
      const active = button.dataset.dashboardCalendarView === state.calendarView && (!state.scheduleMode || Boolean(button.closest('[data-calendar-reader]')));
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const scheduleButton = document.querySelector('[data-calendar-schedule]');
    scheduleButton?.classList.toggle('is-active', state.scheduleMode);
    scheduleButton?.setAttribute('aria-pressed', String(state.scheduleMode));
    const dateControl = document.querySelector('[data-calendar-schedule-date]');
    if (dateControl) { dateControl.hidden = !state.scheduleMode; dateControl.querySelector('input').value = state.date; }
    document.querySelectorAll('[data-calendar-surface]').forEach(surface => {
      const grid = surface.querySelector('[data-dashboard-calendar]');
      const label = surface.querySelector('[data-dashboard-month]');
      if (!grid || !label) return;
      const focusedDate = grid.contains(document.activeElement) ? document.activeElement.dataset.dashboardDate : null;
      const focusedTask = grid.contains(document.activeElement) ? document.activeElement.dataset.dashboardAgendaDone : null;
      const schedule = state.scheduleMode && !surface.closest('[data-calendar-reader]');
      label.textContent = title.charAt(0).toUpperCase() + title.slice(1);
      surface.dataset.view = state.calendarView;
      grid.dataset.view = state.calendarView;
      grid.dataset.weeks = String(monthWeeks);
      grid.style.setProperty('--calendar-weeks', monthWeeks);
      const capacity = monthCapacity(grid);
      const weeklyCapacity = weekCapacity(grid);
      grid.dataset.monthCapacity = String(capacity);
      grid.dataset.weekCapacity = String(weeklyCapacity);
      grid.dataset.monthCompact = String(grid.clientHeight / monthWeeks < 48);
      grid.dataset.weekCompact = String((grid.clientHeight - 18) / 7 < 50);
      if (schedule) {
        label.textContent = formatFullDate(state.date);
        surface.dataset.view = 'schedule'; grid.dataset.view = 'schedule';
        const dayItems = dated.get(state.date) || [];
        grid.innerHTML = `<div class="calendar-schedule__summary" role="status">${dayItems.length} ${dayItems.length === 1 ? 'actividad' : 'actividades'}</div>${calendarActivities(dayItems)}`;
        let footer = surface.querySelector('[data-calendar-schedule-footer]');
        if (!footer) {
          footer = document.createElement('footer'); footer.className = 'calendar-schedule__footer'; footer.dataset.calendarScheduleFooter = '';
          footer.innerHTML = '<button class="calendar-reader__edit" type="button" data-calendar-edit-day>Ver en Inbox</button>';
          surface.appendChild(footer);
        }
        footer.hidden = false;
        renderMonthLegend(grid, agenda, streak);
        if (focusedTask) [...grid.querySelectorAll('[data-dashboard-agenda-done]')].find(input => input.dataset.dashboardAgendaDone === focusedTask)?.focus({ preventScroll: true });
        return;
      }
      const footer = surface.querySelector('[data-calendar-schedule-footer]');
      if (footer) footer.hidden = true;
      const cells = [];
      for (let index = 0; index < cellCount; index += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const value = toDateValue(date);
        const hasStreak = window.EstudiemosStudyGoal.active(streak, value);
        const dayItems = (dated.get(value) || []).slice().sort(compareCalendarItems);
        const content = state.calendarView === "week" ? renderWeekDay(date, dayItems, weeklyCapacity) : renderMonthDay(dayItems, capacity);
        const description = [formatFullDate(value), ...dayItems.map(item => `${formatCalendarTime(item)}: ${item.title}`), hasStreak ? 'Objetivo de estudio completo' : ''].filter(Boolean).join(', ');
        cells.push(`<button class="dashboard-calendar__day ${state.calendarView === "month" && date.getMonth() !== state.month ? "is-outside" : ""} ${value === today ? "is-today" : ""} ${value === state.date ? "is-selected" : ""} ${dayItems.length ? "has-items" : ""} ${hasStreak ? "has-study-streak" : ""}" type="button" data-dashboard-date="${value}" ${value === today ? 'aria-current="date"' : ''} aria-label="${escapeHtml(description)}"><span class="dashboard-calendar__number">${date.getDate()}</span>${hasStreak ? flameIcon() : ""}${content}</button>`);
      }
      grid.innerHTML = cells.join("");
      if (state.calendarView === 'month') fitMonthPreviews(grid, dated);
      if (focusedDate) grid.querySelector(`[data-dashboard-date="${focusedDate}"]`)?.focus({ preventScroll: true });
      renderMonthLegend(grid, agenda, streak);
    });
    renderCalendarDetail(dated.get(state.date) || []);
  }

  function monthCapacity(grid) {
    if (grid.clientWidth / 7 < 82) return 0;
    return Math.min(3, Math.max(0, Math.floor((grid.clientHeight / (Number(grid.dataset.weeks) || 6) - 34) / 36)));
  }

  function fitMonthPreviews(grid, dated) {
    const days = [...grid.querySelectorAll('.dashboard-calendar__day')].filter(day => day.querySelector('.dashboard-calendar__month-events'));
    for (const day of days) {
      const events = day.querySelector('.dashboard-calendar__month-events');
      const total = dated.get(day.dataset.dashboardDate)?.length || 0;
      while (day.scrollHeight > day.clientHeight + 1) {
        const entries = events.querySelectorAll('.dashboard-calendar__month-event');
        if (!entries.length) break;
        entries[entries.length - 1].remove();
        if (entries.length === 1) {
          events.remove();
          const count = document.createElement('span'); count.className = 'dashboard-calendar__count';
          count.textContent = `${total} act.`; day.appendChild(count);
          break;
        }
        let more = events.querySelector('.dashboard-calendar__month-more');
        if (!more) { more = document.createElement('span'); more.className = 'dashboard-calendar__month-more'; events.appendChild(more); }
        more.textContent = `+${total - entries.length + 1} más`;
      }
    }
  }

  function weekCapacity(grid) {
    return grid.clientHeight / 7 >= 84 ? 2 : 1;
  }

  function renderCalendarDetail(items) {
    const dialog = document.querySelector('[data-calendar-reader]');
    if (!dialog?.open) return;
    const container = dialog.querySelector('[data-calendar-day-items]');
    const focusId = container.contains(document.activeElement) ? document.activeElement.dataset.dashboardAgendaDone : null;
    dialog.querySelector('#calendarDayTitle').textContent = formatFullDate(state.date);
    dialog.querySelector('[data-calendar-day-count]').textContent = `${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}`;
    container.innerHTML = calendarActivities(items);
    if (focusId) [...container.querySelectorAll('[data-dashboard-agenda-done]')].find(input => input.dataset.dashboardAgendaDone === focusId)?.focus({ preventScroll: true });
  }

  function calendarActivities(items) {
    return items.length ? items.slice().sort(compareCalendarItems).map(item => {
      const alarm = item.alarm ? window.EstudiemosAlarmRules?.describe(item.alarm) : '';
      return `<article class="calendar-activity is-${calendarKind(item)} ${eventColorClass(item)} ${item.done ? 'is-done' : ''}">
        <div class="calendar-activity__time"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.type)}</span></div>
        <div class="calendar-activity__content"><h4>${escapeHtml(item.title)}</h4>${item.subject ? `<p class="calendar-activity__subject">${escapeHtml(item.subject)}</p>` : ''}${item.note ? `<p class="calendar-activity__note">${escapeHtml(item.note)}</p>` : ''}${alarm ? `<p class="calendar-activity__alarm">${escapeHtml(alarm)}</p>` : ''}
          <div class="calendar-activity__actions">${item.preview ? '' : item.classId ? `<button type="button" class="calendar-activity__edit" data-calendar-class="${escapeHtml(item.classId)}">Ver clase</button>` : item.scheduleId ? `<button type="button" class="calendar-activity__edit" data-calendar-day="${escapeHtml(item.date)}" data-calendar-edit-schedule="${escapeHtml(item.scheduleId)}">Editar horario</button>` : `<button type="button" class="calendar-activity__edit" data-calendar-edit-entry="${escapeHtml(item.id)}" data-calendar-day="${escapeHtml(item.date)}">Editar actividad</button>${isCompletable(item) ? `<label><input type="checkbox" data-dashboard-agenda-done="${escapeHtml(item.id)}" aria-label="${item.done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${escapeHtml(item.title)}" ${item.done ? 'checked' : ''}>${item.done ? 'Completada' : 'Marcar como hecha'}</label>` : ''}${window.EstudiemosInboxAlarms?.button(item) || ''}`}</div>
        </div></article>`;
    }).join('') : '<p class="calendar-reader__empty">No hay actividades para este día.</p>';
  }

  function calendarKind(item) {
    if (item.classId) return 'class';
    if (item.scheduleId) return 'recurring';
    if (item.type === 'Clase') return 'class';
    if (['Parcial', 'Final', 'Examen'].includes(item.type)) return 'exam';
    return 'task';
  }

  function eventColorClass(item) { return (window.EstudiemosTimetableRules?.eventClass(item) || '') + (item.preview ? ' is-preview' : ''); }

  function renderMonthDay(items, capacity) {
    if (!items.length) return '';
    if (!capacity) return `<span class="dashboard-calendar__count">${items.length}<span> act.</span></span><span class="calendar-month-colors" aria-hidden="true">${items.slice(0,4).map(item => `<i class="is-${calendarKind(item)} ${eventColorClass(item)}"></i>`).join('')}</span>`;
    const entries = items.slice(0, capacity).map(item => `<span class="dashboard-calendar__month-event is-${calendarKind(item)} ${eventColorClass(item)} ${item.done ? 'is-done' : ''}"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.title)}</span></span>`).join('');
    return `<span class="dashboard-calendar__month-events">${entries}${items.length > capacity ? `<span class="dashboard-calendar__month-more">+${items.length - capacity} más</span>` : ''}</span>`;
  }

  function renderMonthLegend(grid, agenda, streak) {
    let legend = grid.parentElement.querySelector('[data-calendar-legend]');
    if (!legend) {
      legend = document.createElement('div');
      legend.className = 'dashboard-calendar__legend';
      legend.dataset.calendarLegend = '';
      legend.innerHTML = '<select data-calendar-filter aria-label="Mostrar actividades"><option value="all">Todo</option><option value="weekly">Horarios fijos</option><option value="dated">Anotaciones</option><option value="classes">Mis clases</option></select><button type="button" data-calendar-add>Programar</button><button type="button" data-calendar-colors>Colores</button><button type="button" data-calendar-settings aria-label="Configurar calendario" title="Configurar calendario"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-9M14 17H4"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/></svg></button><span class="dashboard-calendar__month-total"></span>';
      grid.after(legend);
    }
    legend.hidden = false;
    legend.querySelector('[data-calendar-filter]').value = state.calendarSource;
    const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}-`;
    const weekStart = startOfWeek(parseDateValue(state.date) || new Date());
    const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()+6);
    const items = agenda.filter(item => state.scheduleMode ? item.date === state.date : state.calendarView === 'month' ? item.date.startsWith(prefix) : item.date >= toDateValue(weekStart) && item.date <= toDateValue(weekEnd));
    const period = state.scheduleMode ? '' : state.calendarView === 'month' ? ' este mes' : ' esta semana';
    legend.querySelector('.dashboard-calendar__month-total').textContent = items.length ? `${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}${period}` : `Sin actividades${period}`;
  }

  function renderAgenda() {
    const container = document.querySelector("[data-dashboard-agenda]");
    if (!container) return;
    const items = readAgenda().filter((item) => isCompletable(item) && !item.done).sort(compareAgenda).slice(0, workspaceHome || mobileHome.matches ? MAX_AGENDA_ITEMS : 4);
    if (!items.length) {
      container.innerHTML = '<p class="dashboard-agenda__empty">No tenés tareas pendientes.</p>';
      return;
    }
    container.innerHTML = items.map((item) => `
      <div class="dashboard-agenda__item ${eventColorClass(item)}"><label>
        <input type="checkbox" data-dashboard-agenda-done="${escapeHtml(item.id)}" aria-label="Marcar ${escapeHtml(item.title)} como hecha" />
        <span class="dashboard-agenda__copy"><strong>${escapeHtml(item.title)}</strong><span class="dashboard-agenda__meta"><small>${escapeHtml(item.subject || item.type)}</small><span class="dashboard-agenda__date">${item.date ? shortDate(item.date) : "Sin fecha"}</span></span></span></label>
        <div class="dashboard-agenda__actions">${window.EstudiemosNoteColors?.button(item) || ''}${window.EstudiemosInboxAlarms?.button(item) || ''}</div>
      </div>`).join("");
  }

  function moveMonth(direction, fromReader = false) {
    const current = parseDateValue(state.date) || new Date(state.year, state.month, 1);
    const next = state.scheduleMode && !fromReader
      ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction)
      : state.calendarView === "week"
      ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7)
      : new Date(state.year, state.month + direction, 1);
    state.year = next.getFullYear();
    state.month = next.getMonth();
    state.date = toDateValue(next);
    renderCalendar();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('[data-dashboard-calendar]')?.animate([{opacity:.45,transform:`translateX(${direction*12}px)`},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  }

  function startOfWeek(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
  }

  function formatWeekRange(date) {
    const start = startOfWeek(date);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const first = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: start.getMonth() === end.getMonth() ? undefined : "short" }).format(start);
    const last = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(end);
    return `${first} - ${last}`;
  }

  function renderWeekDay(date, items, capacity = 1) {
    const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).replace(".", "");
    const events = items.length
      ? items.slice(0, capacity).map(item => `<span class="dashboard-calendar__event is-${calendarKind(item)} ${eventColorClass(item)} ${item.done ? 'is-done' : ''}"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.title)}</span></span>`).join('')
      : '<span class="dashboard-calendar__empty">Sin actividades</span>';
    return `<span class="dashboard-calendar__date"><small>${escapeHtml(weekday)}</small><strong>${date.getDate()}</strong></span><span class="dashboard-calendar__events">${events}</span>${items.length > capacity ? `<b class="dashboard-calendar__more">+${items.length - capacity}</b>` : ""}`;
  }

  function formatCalendarTime(item) {
    if (!item.horaInicio) return "Todo el día";
    return item.horaFin ? `${item.horaInicio}-${item.horaFin}` : item.horaInicio;
  }

  function compareCalendarItems(a, b) {
    if (a.horaInicio && !b.horaInicio) return -1;
    if (!a.horaInicio && b.horaInicio) return 1;
    return String(a.horaInicio || "").localeCompare(String(b.horaInicio || ""));
  }

  function toggleDone(id) {
    writeAgenda(readAgenda().map((item) => item.id === id ? { ...item, done: !item.done } : item));
  }

  function isCompletable(item) {
    return !item.classId && !item.scheduleId && item.type !== "Clase";
  }

  function updateSpaceSummary(event) {
    const target = document.querySelector("[data-dashboard-space-summary]");
    if (!target) return;
    const detail = event.detail || {};
    if (!detail.user) {
      target.textContent = "Ingresá para sincronizar tus carpetas y archivos.";
      return;
    }
    const parts = [];
    if (detail.folders) parts.push(`${detail.folders} ${detail.folders === 1 ? "carpeta" : "carpetas"}`);
    if (detail.files) parts.push(`${detail.files} ${detail.files === 1 ? "archivo" : "archivos"}`);
    target.textContent = parts.length ? parts.join(" · ") : "Tu espacio está listo para empezar.";
  }

  function readAgenda() {
    return readList(AGENDA_KEY).filter((item) => item?.id && item?.title).map((item) => ({
      ...item,
      date: typeof item.date === 'string' ? item.date : "",
      subject: item.subject || "",
      type: item.type || "Tarea",
      done: Boolean(item.done),
      createdAt: Number(item.createdAt) || 0
    }));
  }

  function readStreakProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}");
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function flameIcon() {
    return '<svg class="study-streak-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.2c.4 3-1 4.7-2.4 6.3-1.2-2.2-2.9-3.8-5-5.4.3 3.8-2.4 5.7-2.4 10.3A8.6 8.6 0 0 0 12 22a8.6 8.6 0 0 0 8.6-8.6c0-4.1-2.3-7.8-7.4-11.2ZM12 19.7a4.2 4.2 0 0 1-4.2-4.2c0-1.8.9-3.1 2.1-4.4.2 1.5.9 2.4 1.7 3.2 1.1-1.4 1.8-2.8 1.8-4.7 1.8 1.5 2.8 3.4 2.8 5.9a4.2 4.2 0 0 1-4.2 4.2Z"/></svg>';
  }

  function writeAgenda(items) {
    localStorage.setItem(AGENDA_KEY, JSON.stringify(items));
    try {
      window.EstudiemosAndroid?.postMessage?.(JSON.stringify({ type: "agenda-sync", items }));
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key: AGENDA_KEY } }));
    renderDashboard();
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function compareAgenda(a, b) {
    if (!a.date && b.date) return -1;
    if (a.date && !b.date) return 1;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return b.createdAt - a.createdAt;
  }

  function toDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateValue(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function shortDate(value) {
    if (!parseDateValue(value)) return "Fecha no válida";
    const parts = String(value).split("-").map(Number);
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
  }

  function formatFullDate(value) {
    const date = parseDateValue(value);
    return date ? new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(date) : "Elegí un día";
  }

  function randomId() {
    return window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }
})();
