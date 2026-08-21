(function () {
  if (!document.body.classList.contains("workspace-home")) return;

  const AGENDA_KEY = "bandeja_agenda";
  const SUBJECTS_KEY = "bandeja_materias";
  const MAX_AGENDA_ITEMS = 500;
  const state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear()
  };

  addTopbarActions();
  addPanels();
  bindEvents();
  fillSubjectOptions();
  renderDashboard();
  syncPanelsWithHistory();

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
    if (!document.querySelector('[data-quick-panel="note"]')) {
      const shell = document.createElement("section");
      shell.className = "quick-panel-shell";
      shell.dataset.quickPanel = "note";
      shell.hidden = true;
      shell.setAttribute("aria-hidden", "true");
      shell.innerHTML = `
        <div class="quick-panel" role="dialog" aria-modal="true" aria-labelledby="quickNoteTitle">
          <header class="quick-panel__head">
            <div><p>Anotación rápida</p><h2 id="quickNoteTitle">Agregar una tarea</h2></div>
            <button class="quick-panel__close" type="button" data-quick-panel-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </header>
          <form class="quick-panel__form" data-quick-note-form>
            <label class="quick-panel__field">Materia<select name="subject"></select></label>
            <label class="quick-panel__field">Qué tenés que hacer<input name="title" maxlength="90" required autocomplete="off" placeholder="Ej: Resolver la guía 2" /></label>
            <label class="quick-panel__field">Detalle opcional<textarea name="note" maxlength="240" rows="3" placeholder="Algo que no quieras olvidar"></textarea></label>
            <p class="quick-panel__hint">Se guardará en la agenda como una tarea sin fecha.</p>
            <p class="quick-panel__status" data-quick-note-status role="status" aria-live="polite"></p>
            <button class="quick-panel__submit" type="submit" disabled><svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 17 19 7"/></svg><span>Guardar anotación</span></button>
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
            <div><p>Asistente de Estudiemos</p><h2 id="generalAiTitle">¿Qué querés organizar?</h2></div>
            <button class="quick-panel__close" type="button" data-quick-panel-close aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </header>
          <form class="quick-panel__form" data-general-ai-form>
            <label class="quick-panel__field">Tu indicación<textarea name="instruction" maxlength="1200" rows="5" required placeholder="Ej: Agendá el parcial de Física para el viernes, o creá carpetas para ordenar mis apuntes."></textarea></label>
            <p class="quick-panel__hint">Puede ayudarte con la agenda, las tareas, las carpetas y los archivos. Siempre revisás los cambios antes de aplicarlos.</p>
            <p class="quick-panel__status" data-general-ai-status role="status" aria-live="polite"></p>
            <button class="quick-panel__submit" type="submit"><svg viewBox="0 0 24 24"><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"/></svg><span>Continuar</span></button>
          </form>
        </div>`;
      document.body.appendChild(shell);
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
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
        moveMonth(Number(monthChange.dataset.dashboardMonthChange) || 0);
        return;
      }
      const day = event.target.closest("[data-dashboard-date]");
      if (day) {
        openAgenda({ date: day.dataset.dashboardDate });
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
    noteForm?.elements.title.addEventListener("input", () => {
      noteForm.querySelector('[type="submit"]').disabled = !noteForm.elements.title.value.trim();
    });
    noteForm?.addEventListener("submit", saveQuickNote);
    document.querySelector("[data-general-ai-form]")?.addEventListener("submit", routeGeneralAssistant);

    window.addEventListener("popstate", syncPanelsWithHistory);
    window.addEventListener("storage", (event) => {
      if ([AGENDA_KEY, SUBJECTS_KEY].includes(event.key)) {
        fillSubjectOptions();
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:data-change", (event) => {
      if (!event.detail?.key || [AGENDA_KEY, SUBJECTS_KEY].includes(event.detail.key)) {
        fillSubjectOptions();
        renderDashboard();
      }
    });
    window.addEventListener("estudiemos:cloud-restored", () => {
      fillSubjectOptions();
      renderDashboard();
    });
    window.addEventListener("estudiemos:workspace-update", updateSpaceSummary);
    window.addEventListener("estudiemos:open-general-ai", () => openPanel("assistant"));
  }

  function openPanel(name) {
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

  function fillSubjectOptions() {
    const select = document.querySelector('[data-quick-note-form] select[name="subject"]');
    if (!select || !window.DATA?.carreras) return;
    const selected = new Set(readList(SUBJECTS_KEY));
    const subjects = DATA.carreras.flatMap((career) => career.materias || []);
    subjects.sort((a, b) => {
      const selectedDifference = Number(selected.has(b.slug)) - Number(selected.has(a.slug));
      return selectedDifference || a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    });
    const previous = select.value;
    select.innerHTML = `${subjects.map((subject) => `<option value="${escapeHtml(subject.title)}">${escapeHtml(subject.title)}</option>`).join("")}<option value="">Sin materia</option>`;
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
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
      subject: form.elements.subject.value.trim().slice(0, 80),
      note: form.elements.note.value.trim().slice(0, 240),
      horaInicio: "",
      horaFin: "",
      done: false,
      createdAt: Date.now()
    });
    writeAgenda(items.slice(0, MAX_AGENDA_ITEMS));
    form.reset();
    fillSubjectOptions();
    form.querySelector('[type="submit"]').disabled = true;
    closeActivePanel();
  }

  async function routeGeneralAssistant(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const instruction = form.elements.instruction.value.trim();
    const button = form.querySelector('[type="submit"]');
    if (!instruction || button.disabled) return;
    setAssistantStatus("Interpretando lo que necesitás...", "");
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
        setAssistantStatus("¿Querés organizar tu agenda o tus archivos?", "info");
        return;
      }
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
    window.setTimeout(() => {
      const trigger = document.querySelector("[data-workspace-ai]");
      trigger?.click();
      waitForElement('[data-workspace-ai-form] textarea[name="instruction"]', (input) => {
        input.value = instruction;
        input.closest("form")?.requestSubmit();
      });
    }, 120);
  }

  function setAssistantStatus(message, type) {
    const status = document.querySelector("[data-general-ai-status]");
    if (!status) return;
    status.textContent = message;
    status.className = `quick-panel__status${type ? ` is-${type}` : ""}`;
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
    const label = document.querySelector("[data-dashboard-month]");
    const grid = document.querySelector("[data-dashboard-calendar]");
    if (!label || !grid) return;
    label.textContent = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(state.year, state.month, 1));
    label.textContent = label.textContent.charAt(0).toUpperCase() + label.textContent.slice(1);
    const dated = new Set(readAgenda().filter((item) => item.date).map((item) => item.date));
    const first = new Date(state.year, state.month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(state.year, state.month, 1 - offset);
    const today = toDateValue(new Date());
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const value = toDateValue(date);
      cells.push(`<button class="dashboard-calendar__day ${date.getMonth() !== state.month ? "is-outside" : ""} ${value === today ? "is-today" : ""} ${dated.has(value) ? "has-items" : ""}" type="button" data-dashboard-date="${value}" aria-label="${formatFullDate(value)}">${date.getDate()}</button>`);
    }
    grid.innerHTML = cells.join("");
  }

  function renderAgenda() {
    const container = document.querySelector("[data-dashboard-agenda]");
    if (!container) return;
    const items = readAgenda().filter((item) => !item.done).sort(compareAgenda).slice(0, 4);
    if (!items.length) {
      container.innerHTML = '<p class="dashboard-agenda__empty">No tenés tareas pendientes.</p>';
      return;
    }
    container.innerHTML = items.map((item) => `
      <label class="dashboard-agenda__item">
        <input type="checkbox" data-dashboard-agenda-done="${escapeHtml(item.id)}" aria-label="Marcar ${escapeHtml(item.title)} como hecha" />
        <span class="dashboard-agenda__copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subject || item.type)}</small></span>
        <span class="dashboard-agenda__date">${item.date ? shortDate(item.date) : "Sin fecha"}</span>
      </label>`).join("");
  }

  function moveMonth(direction) {
    const next = new Date(state.year, state.month + direction, 1);
    state.year = next.getFullYear();
    state.month = next.getMonth();
    renderCalendar();
  }

  function toggleDone(id) {
    writeAgenda(readAgenda().map((item) => item.id === id ? { ...item, done: !item.done } : item));
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
      date: item.date || "",
      subject: item.subject || "",
      type: item.type || "Tarea",
      done: Boolean(item.done),
      createdAt: Number(item.createdAt) || 0
    }));
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
