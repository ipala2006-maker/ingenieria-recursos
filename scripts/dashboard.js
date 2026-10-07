(function () {
  if (window.__estudiemosDashboardInstalled) return;
  window.__estudiemosDashboardInstalled = true;

  const AGENDA_KEY = "bandeja_agenda";
  const SUBJECTS_KEY = "bandeja_materias";
  const STREAK_KEY = "estudiemos_pomodoro_streak";
  const CALENDAR_VIEW_KEY = "estudiemos_calendar_view";
  const workspaceHome = document.body.classList.contains("workspace-home");
  const MAX_AGENDA_ITEMS = 500;
  const mobileHome = matchMedia("(max-width:620px)");
  mobileHome.addEventListener("change", () => renderAgenda());
  const state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    date: toDateValue(new Date()),
    scheduleMode: false,
    calendarView: localStorage.getItem(CALENDAR_VIEW_KEY) === "month" ? "month" : "week"
  };

  addTopbarActions();
  addPanels();
  bindEvents();
  renderDashboard();
  if (window.ResizeObserver) {
    let calendarResizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(calendarResizeFrame);
      calendarResizeFrame = requestAnimationFrame(() => {
        const changed = [...document.querySelectorAll('[data-dashboard-calendar]')].some(grid =>
          grid.clientWidth && (state.calendarView === 'month'
            ? grid.dataset.monthCapacity !== String(monthCapacity(grid)) || grid.dataset.monthCompact !== String(grid.clientHeight / Number(grid.dataset.weeks) < 48)
            : grid.dataset.weekCapacity !== String(weekCapacity(grid)) || grid.dataset.weekCompact !== String(grid.clientHeight / 7 < 44)));
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
            <h3 data-dashboard-month></h3>
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
        <section class="calendar-reader__detail" aria-labelledby="calendarDayTitle">
          <header class="calendar-reader__day-head"><h3 id="calendarDayTitle"></h3><p data-calendar-day-count role="status"></p></header>
          <div class="calendar-reader__activities" data-calendar-day-items></div>
          <footer><button class="calendar-reader__edit" type="button" data-calendar-edit-day>Editar o agregar</button></footer>
        </section>
      </div>`;
    document.body.appendChild(dialog);
    let returnFocus = null;
    let returnDate = null;
    dialog.addEventListener('close', () => {
      document.body.classList.remove('calendar-reader-open');
      const target = returnFocus?.isConnected ? returnFocus : document.querySelector(`[data-dashboard-calendar-widget] [data-dashboard-date="${returnDate}"]`) || document.querySelector('[data-calendar-expand]');
      target?.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('calendar-open', event => { returnFocus = event.detail; returnDate = event.detail?.dataset.dashboardDate; });
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
    });
    noteForm?.addEventListener("submit", saveQuickNote);
    document.querySelector("[data-general-ai-form]")?.addEventListener("submit", routeGeneralAssistant);

    window.addEventListener("popstate", syncPanelsWithHistory);
    window.addEventListener("storage", (event) => {
      if ([AGENDA_KEY, SUBJECTS_KEY, STREAK_KEY].includes(event.key)) {
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:data-change", (event) => {
      if (!event.detail?.key || [AGENDA_KEY, SUBJECTS_KEY, STREAK_KEY].includes(event.detail.key)) {
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:cloud-restored", () => {
      renderDashboard();
    });
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
    hidePanels();
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("quick-panel-open");
    if (history.state?.estudiemosUi !== `quick-${name}`) {
      history.pushState({ ...(history.state || {}), estudiemosUi: `quick-${name}` }, "", location.href);
    }
    requestAnimationFrame(() => panel.querySelector("input,textarea,select")?.focus());
  }

  function closeActivePanel() {
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
    const title = form.elements.title.value.trim();
    if (!title) return;
    const items = readAgenda();
    items.unshift({
      id: `agenda:${Date.now()}:note:${randomId()}`,
      title: title.slice(0, 90),
      type: "Tarea",
      date: "",
      subject: "",
      note: "",
      horaInicio: "",
      horaFin: "",
      done: false,
      alarm: window.EstudiemosInboxAlarms?.readForm(form) || null,
      createdAt: Date.now()
    });
    writeAgenda(items.slice(0, MAX_AGENDA_ITEMS));
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
    const agenda = readAgenda();
    const dated = agenda.reduce((map, item) => {
      if (!item.date) return map;
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
      return map;
    }, new Map());
    const streakDays = readStreakDays();
    const first = new Date(state.year, state.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = state.calendarView === "week"
      ? startOfWeek(focus)
      : new Date(state.year, state.month, 1 - offset);
    const monthWeeks = Math.ceil((offset + new Date(state.year, state.month + 1, 0).getDate()) / 7);
    const cellCount = state.calendarView === "week" ? 7 : monthWeeks * 7;
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
      grid.dataset.weekCompact = String(grid.clientHeight / 7 < 44);
      if (schedule) {
        label.textContent = formatFullDate(state.date);
        surface.dataset.view = 'schedule'; grid.dataset.view = 'schedule';
        const dayItems = dated.get(state.date) || [];
        grid.innerHTML = `<div class="calendar-schedule__summary" role="status">${dayItems.length} ${dayItems.length === 1 ? 'actividad' : 'actividades'}</div>${calendarActivities(dayItems)}`;
        let footer = surface.querySelector('[data-calendar-schedule-footer]');
        if (!footer) {
          footer = document.createElement('footer'); footer.className = 'calendar-schedule__footer'; footer.dataset.calendarScheduleFooter = '';
          footer.innerHTML = '<button class="calendar-reader__edit" type="button" data-calendar-edit-day>Editar o agregar</button>';
          surface.appendChild(footer);
        }
        footer.hidden = false;
        surface.querySelector('[data-calendar-legend]')?.setAttribute('hidden', '');
        if (focusedTask) [...grid.querySelectorAll('[data-dashboard-agenda-done]')].find(input => input.dataset.dashboardAgendaDone === focusedTask)?.focus({ preventScroll: true });
        return;
      }
      const footer = surface.querySelector('[data-calendar-schedule-footer]');
      if (footer) footer.hidden = true;
      const cells = [];
      for (let index = 0; index < cellCount; index += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const value = toDateValue(date);
        const hasStreak = (streakDays[value] || 0) >= 25;
        const dayItems = (dated.get(value) || []).slice().sort(compareCalendarItems);
        const content = state.calendarView === "week" ? renderWeekDay(date, dayItems, weeklyCapacity) : renderMonthDay(dayItems, capacity);
        const description = [formatFullDate(value), ...dayItems.map(item => `${formatCalendarTime(item)}: ${item.title}`), hasStreak ? '25 minutos de estudio registrados' : ''].filter(Boolean).join(', ');
        cells.push(`<button class="dashboard-calendar__day ${state.calendarView === "month" && date.getMonth() !== state.month ? "is-outside" : ""} ${value === today ? "is-today" : ""} ${value === state.date ? "is-selected" : ""} ${dayItems.length ? "has-items" : ""} ${hasStreak ? "has-study-streak" : ""}" type="button" data-dashboard-date="${value}" ${value === today ? 'aria-current="date"' : ''} aria-label="${escapeHtml(description)}"><span class="dashboard-calendar__number">${date.getDate()}</span>${hasStreak ? flameIcon() : ""}${content}</button>`);
      }
      grid.innerHTML = cells.join("");
      if (state.calendarView === 'month') fitMonthPreviews(grid, dated);
      if (focusedDate) grid.querySelector(`[data-dashboard-date="${focusedDate}"]`)?.focus({ preventScroll: true });
      renderMonthLegend(grid, agenda, streakDays);
    });
    renderCalendarDetail(dated.get(state.date) || []);
  }

  function monthCapacity(grid) {
    if (grid.clientWidth / 7 < 82) return 0;
    return Math.min(2, Math.max(0, Math.floor((grid.clientHeight / (Number(grid.dataset.weeks) || 6) - 40) / 50)));
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
      return `<article class="calendar-activity is-${calendarKind(item)} ${item.done ? 'is-done' : ''}">
        <div class="calendar-activity__time"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.type)}</span></div>
        <div class="calendar-activity__content"><h4>${escapeHtml(item.title)}</h4>${item.subject ? `<p class="calendar-activity__subject">${escapeHtml(item.subject)}</p>` : ''}${item.note ? `<p class="calendar-activity__note">${escapeHtml(item.note)}</p>` : ''}${alarm ? `<p class="calendar-activity__alarm">${escapeHtml(alarm)}</p>` : ''}
          <div class="calendar-activity__actions">${isCompletable(item) ? `<label><input type="checkbox" data-dashboard-agenda-done="${escapeHtml(item.id)}" aria-label="${item.done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${escapeHtml(item.title)}" ${item.done ? 'checked' : ''}>${item.done ? 'Completada' : 'Marcar como hecha'}</label>` : ''}${window.EstudiemosInboxAlarms?.button(item) || ''}</div>
        </div></article>`;
    }).join('') : '<p class="calendar-reader__empty">No hay actividades para este día.</p>';
  }

  function calendarKind(item) {
    if (item.type === 'Clase') return 'class';
    if (['Parcial', 'Final', 'Examen'].includes(item.type)) return 'exam';
    return 'task';
  }

  function renderMonthDay(items, capacity) {
    if (!items.length) return '';
    if (!capacity) return `<span class="dashboard-calendar__count">${items.length}<span> act.</span></span>`;
    const entries = items.slice(0, capacity).map(item => `<span class="dashboard-calendar__month-event is-${calendarKind(item)} ${item.done ? 'is-done' : ''}"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.title)}</span></span>`).join('');
    return `<span class="dashboard-calendar__month-events">${entries}${items.length > capacity ? `<span class="dashboard-calendar__month-more">+${items.length - capacity} más</span>` : ''}</span>`;
  }

  function renderMonthLegend(grid, agenda, streakDays) {
    let legend = grid.parentElement.querySelector('[data-calendar-legend]');
    if (!legend) {
      legend = document.createElement('div');
      legend.className = 'dashboard-calendar__legend';
      legend.dataset.calendarLegend = '';
      grid.after(legend);
    }
    legend.hidden = state.calendarView !== 'month';
    if (legend.hidden) return;
    const prefix = `${state.year}-${String(state.month + 1).padStart(2, '0')}-`;
    const items = agenda.filter(item => item.date.startsWith(prefix));
    const kinds = new Set(items.map(calendarKind));
    const references = [['class', 'Clase'], ['exam', 'Examen'], ['task', 'Tarea']].filter(([kind]) => kinds.has(kind));
    const hasStudy = Object.entries(streakDays).some(([day, minutes]) => day.startsWith(prefix) && minutes >= 25);
    legend.innerHTML = `<span class="dashboard-calendar__month-total">${items.length ? `${items.length} ${items.length === 1 ? 'actividad' : 'actividades'} este mes` : 'Sin actividades este mes'}</span>${references.length || hasStudy ? `<span class="dashboard-calendar__references">${references.map(([kind, title]) => `<span class="is-${kind}"><i aria-hidden="true"></i>${title}</span>`).join('')}${hasStudy ? `<span>${flameIcon()}25 min de estudio</span>` : ''}</span>` : ''}`;
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
      <div class="dashboard-agenda__item"><label>
        <input type="checkbox" data-dashboard-agenda-done="${escapeHtml(item.id)}" aria-label="Marcar ${escapeHtml(item.title)} como hecha" />
        <span class="dashboard-agenda__copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subject || item.type)}</small></span>
        <span class="dashboard-agenda__date">${item.date ? shortDate(item.date) : "Sin fecha"}</span></label>
        ${window.EstudiemosInboxAlarms?.button(item) || ''}
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
      ? items.slice(0, capacity).map(item => `<span class="dashboard-calendar__event is-${calendarKind(item)} ${item.done ? 'is-done' : ''}"><time>${escapeHtml(formatCalendarTime(item))}</time><span>${escapeHtml(item.title)}</span></span>`).join('')
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
    return item.type !== "Clase";
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

  function readStreakDays() {
    try {
      const value = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}");
      return value?.days && typeof value.days === "object" ? value.days : {};
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
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function shortDate(value) {
    const parts = String(value).split("-").map(Number);
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : value;
  }

  function formatFullDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
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
