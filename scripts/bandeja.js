(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;
  if (document.querySelector(".tray-shell")) return;

  const STORAGE_KEYS = {
    favorites: "bandeja_favoritos",
    saved: "bandeja_guardados",
    subjects: "bandeja_materias",
    recent: "bandeja_recientes",
    agenda: "bandeja_agenda",
    open: "bandeja_abierta"
  };

  const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc8KLH9N0kcYRryZa0tNtLSRIMe0ol_wKWVUwBt9T-3m9WD1A/viewform?usp=header";
  const AGENDA_TYPES = ["Tarea", "Parcial", "Clase", "Entrega", "Estudio", "Recordatorio"];
  let refreshQueued = false;
  let agendaFilter = "day";
  let agendaMonth = new Date().getMonth();
  let agendaYear = new Date().getFullYear();
  let selectedAgendaDate = toDateValue(new Date());

  addTray();
  addAgendaPanel();
  addTrayButton();
  addAgendaButton();
  bindTray();
  trackRecentTopic();
  refreshPageActions();
  renderTray();
  restoreTrayState();
  markActiveTheme();
  observeLateCards();

  function addTray() {
    const shell = document.createElement("aside");
    shell.className = "tray-shell";
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML = `
      <div class="tray-panel" aria-label="Recursos rápidos">
        <div class="tray-head">
          <div>
            <p class="tray-kicker">Recursos</p>
            <h2>Accesos rápidos</h2>
          </div>
          <button class="tray-close" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="tray-content">
          ${traySection("favorites", "Favoritos", "Recursos marcados para volver rápido.", "favoritesList")}
          ${traySection("subjects", "Mis materias", "Acceso rápido a tus materias elegidas.", "mySubjectsQuick")}
          ${traySection("recent", "Recientes", "Últimos temas visitados.", "recentList")}
          ${traySection("saved", "Guardados para después", "Material para revisar después.", "savedList")}
          <section class="tray-accordion" data-tray-section="suggestions">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Sugerencias</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">¿Encontraste un error o querés sugerir un recurso?</p>
              <a id="suggestionLink" class="btn tray-submit" href="${GOOGLE_FORM_URL}" target="_blank" rel="noopener">Enviar sugerencia</a>
            </div>
          </section>
        </div>
        <div class="tray-footer">
          <p class="tray-footer__label">Tema</p>
          <div class="theme-switcher" aria-label="Cambiar tema">
            <button class="theme-switcher__btn" type="button" data-theme-choice="light" aria-label="Tema claro" title="Tema claro">${icon("sun")}</button>
            <button class="theme-switcher__btn" type="button" data-theme-choice="dark" aria-label="Tema oscuro" title="Tema oscuro">${icon("moon")}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(shell);
  }

  function addAgendaPanel() {
    const panel = document.createElement("section");
    panel.className = "agenda-board";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="agenda-board__panel" role="dialog" aria-modal="false" aria-label="Agenda de estudio">
        <header class="agenda-toolbar">
          <div class="agenda-toolbar__main">
            <button class="agenda-toolbar__today" type="button" data-agenda-today>Hoy</button>
            <div class="agenda-toolbar__nav">
              <button class="agenda-calendar__nav" type="button" data-agenda-month="prev" aria-label="Mes anterior">${icon("chevronLeft")}</button>
              <button class="agenda-calendar__nav" type="button" data-agenda-month="next" aria-label="Mes siguiente">${icon("chevronRight")}</button>
            </div>
            <div>
              <p class="tray-kicker">Agenda</p>
              <h2 id="agendaMonthLabel"></h2>
            </div>
          </div>
          <div class="agenda-toolbar__actions">
            <button class="agenda-create-btn" type="button" data-agenda-create>${icon("plus")}<span>Crear</span></button>
            <button class="tray-close" type="button" data-agenda-close aria-label="Cerrar agenda">×</button>
          </div>
        </header>

        <div class="agenda-layout">
          <section class="agenda-calendar" aria-label="Calendario">
            <div class="agenda-weekdays" aria-hidden="true">
              <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
            </div>
            <div id="agendaCalendarGrid" class="agenda-calendar__grid"></div>
          </section>

          <aside class="agenda-editor" aria-label="Detalle de agenda">
            <div class="agenda-selected-day">
              <p class="tray-kicker">Día seleccionado</p>
              <h3 id="agendaSelectedLabel"></h3>
            </div>

            <form id="agendaForm" class="agenda-form">
              <label class="tray-field">
                Qué querés anotar
                <input id="agendaTitle" type="text" maxlength="90" placeholder="Ej: Entrega de ejercicios" required />
              </label>

              <div class="agenda-form__row agenda-form__row--type">
                <label class="tray-field">
                  Tipo
                  <select id="agendaType">
                    ${agendaTypeOptions()}
                  </select>
                </label>
                <label class="tray-field">
                  Fecha
                  <input id="agendaDate" type="date" />
                </label>
                <label class="tray-field">
                  Materia
                  <select id="agendaSubject">
                    ${agendaSubjectOptions()}
                  </select>
                </label>
              </div>

              <div class="agenda-form__row agenda-form__row--time">
                <label class="tray-field">
                  Hora inicio
                  <input id="agendaStartTime" type="time" />
                </label>
                <label class="tray-field">
                  Hora fin
                  <input id="agendaEndTime" type="time" />
                </label>
              </div>

              <label class="tray-field">
                Nota breve
                <textarea id="agendaNote" rows="2" maxlength="160" placeholder="Ej: revisar guía 2 y fórmulas principales"></textarea>
              </label>

              <button class="agenda-save-btn" type="submit" disabled>${icon("plus")}<span>Agregar</span></button>
            </form>

            <div class="agenda-filter" aria-label="Filtrar agenda">
              <button class="agenda-filter__btn is-active" type="button" data-agenda-filter="day">Este día</button>
              <button class="agenda-filter__btn" type="button" data-agenda-filter="pending">Pendientes</button>
              <button class="agenda-filter__btn" type="button" data-agenda-filter="all">Todo</button>
              <button class="agenda-filter__btn" type="button" data-agenda-filter="done">Hechas</button>
            </div>

            <div id="agendaList" class="agenda-list"></div>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function traySection(name, title, help, listId) {
    return `
      <section class="tray-accordion" data-tray-section="${name}">
        <button class="tray-accordion__trigger" type="button" aria-expanded="false">
          <span>${title}</span>
          <span class="tray-chevron">+</span>
        </button>
        <div class="tray-accordion__body">
          <p class="tray-help">${help}</p>
          <div id="${listId}" class="bandeja-list"></div>
        </div>
      </section>
    `;
  }

  function addTrayButton() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-bandeja-trigger]")) return;

    const button = document.createElement("button");
    button.className = "topbar__link tray-trigger";
    button.type = "button";
    button.dataset.bandejaTrigger = "true";
    button.setAttribute("aria-label", "Abrir recursos");
    button.innerHTML = '<span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span>';

    const brand = topbar.querySelector(".brand");
    topbar.insertBefore(button, brand || topbar.firstChild);
  }

  function addAgendaButton() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector(".agenda-top-btn")) return;

    let nav = topbar.querySelector(".topbar__nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "topbar__nav";
      nav.setAttribute("aria-label", "Acciones rápidas");
      topbar.appendChild(nav);
    }

    const button = document.createElement("button");
    button.className = "topbar__link topbar-icon-btn agenda-top-btn";
    button.type = "button";
    button.dataset.agendaOpen = "true";
    button.setAttribute("aria-label", "Abrir agenda");
    button.title = "Agenda";
    button.innerHTML = icon("calendar");
    nav.prepend(button);
  }

  function bindTray() {
    document.querySelector("[data-bandeja-trigger]")?.addEventListener("click", () => {
      const isOpen = !document.body.classList.contains("tray-open");
      document.body.classList.add("tray-transition-enabled");
      setTrayOpen(isOpen, true);
      if (isOpen) renderTray();
    });

    document.querySelector(".tray-close")?.addEventListener("click", () => {
      document.body.classList.add("tray-transition-enabled");
      closeAgendaBoard();
      setTrayOpen(false, true);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (document.body.classList.contains("agenda-open")) {
          closeAgendaBoard();
          return;
        }
        document.body.classList.add("tray-transition-enabled");
        setTrayOpen(false, true);
      }
    });

    document.querySelector(".tray-shell")?.addEventListener("click", (event) => {
      const trigger = event.target.closest(".tray-accordion__trigger");
      const remove = event.target.closest("[data-bandeja-remove]");
      const agendaOpen = event.target.closest("[data-agenda-open]");
      const theme = event.target.closest("[data-theme-choice]");

      if (trigger) {
        const section = trigger.closest(".tray-accordion");
        const isOpen = section.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(isOpen));
        section.querySelector(".tray-chevron").textContent = isOpen ? "−" : "+";
        return;
      }

      if (theme) {
        setTheme(theme.dataset.themeChoice, true);
        return;
      }

      if (agendaOpen) {
        openAgendaBoard();
        return;
      }

      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        removeItem(remove.dataset.bandejaRemove, remove.dataset.bandejaRemoveId);
      }
    });

    document.querySelector(".agenda-board")?.addEventListener("click", (event) => {
      if (event.target.closest(".agenda-board__panel")) event.stopPropagation();

      const agendaRemove = event.target.closest("[data-agenda-remove]");
      const agendaDone = event.target.closest("[data-agenda-done]");
      const agendaClose = event.target.closest("[data-agenda-close]");
      const agendaFilterButton = event.target.closest("[data-agenda-filter]");
      const agendaMonthButton = event.target.closest("[data-agenda-month]");
      const agendaDay = event.target.closest("[data-agenda-date]");
      const agendaToday = event.target.closest("[data-agenda-today]");
      const agendaCreate = event.target.closest("[data-agenda-create]");

      if (agendaClose) {
        closeAgendaBoard();
        return;
      }

      if (agendaToday) {
        goToToday();
        return;
      }

      if (agendaCreate) {
        focusAgendaForm();
        return;
      }

      if (agendaMonthButton) {
        moveAgendaMonth(agendaMonthButton.dataset.agendaMonth === "next" ? 1 : -1);
        return;
      }

      if (agendaDay) {
        selectAgendaDate(agendaDay.dataset.agendaDate);
        return;
      }

      if (agendaFilterButton) {
        agendaFilter = agendaFilterButton.dataset.agendaFilter || "pending";
        renderAgenda();
        return;
      }

      if (agendaRemove) {
        event.preventDefault();
        event.stopPropagation();
        removeAgendaItem(agendaRemove.dataset.agendaRemove);
      }

      if (agendaDone) {
        toggleAgendaDone(agendaDone.dataset.agendaDone);
      }
    });

    document.getElementById("agendaForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      addAgendaItem();
    });

    document.getElementById("agendaTitle")?.addEventListener("input", updateAgendaSubmitState);

    document.getElementById("agendaDate")?.addEventListener("change", (event) => {
      selectAgendaDate(event.target.value, false);
    });

    document.addEventListener("click", (event) => {
      const agendaOpen = event.target.closest("[data-agenda-open]");

      if (agendaOpen) {
        event.preventDefault();
        event.stopPropagation();
        openAgendaBoard();
        return;
      }

      if (shouldCloseAgendaBoard(event)) {
        closeAgendaBoard();
        return;
      }

      if (shouldCloseMobileTray(event)) {
        event.preventDefault();
        event.stopPropagation();
        document.body.classList.add("tray-transition-enabled");
        setTrayOpen(false, true);
        return;
      }

      const action = event.target.closest("[data-bandeja-action]");
      const subject = event.target.closest("[data-subject-toggle]");

      if (action) {
        event.preventDefault();
        event.stopPropagation();
        toggleItem(action.dataset.bandejaAction, action.__bandejaItem);
        syncActionButtons();
        renderTray();
      }

      if (subject) {
        event.preventDefault();
        event.stopPropagation();
        toggleSubject(subject.dataset.subjectToggle);
        syncSubjectButtons();
        renderTray();
      }
    });

    window.addEventListener("pageshow", () => {
      refreshPageActions();
      syncActionButtons();
      syncSubjectButtons();
      renderTray();
      restoreTrayState();
      markActiveTheme();
    });

    document.addEventListener("estudiemos:navigation", () => {
      refreshPageActions();
      syncActionButtons();
      syncSubjectButtons();
      renderTray();
      restoreTrayState();
      markActiveTheme();
    });
  }

  function shouldCloseMobileTray(event) {
    if (!document.body.classList.contains("tray-open")) return false;
    if (!window.matchMedia("(max-width: 760px)").matches) return false;
    if (event.target.closest(".tray-shell")) return false;
    if (event.target.closest(".agenda-board")) return false;
    if (event.target.closest("[data-agenda-open]")) return false;
    if (event.target.closest("[data-bandeja-trigger]")) return false;
    return true;
  }

  function shouldCloseAgendaBoard(event) {
    if (!document.body.classList.contains("agenda-open")) return false;
    if (event.target.closest(".agenda-board__panel")) return false;
    if (event.target.closest("[data-agenda-open]")) return false;
    return true;
  }

  function setTrayOpen(isOpen, shouldSave) {
    document.body.classList.toggle("tray-open", isOpen);
    document.querySelector(".tray-shell")?.setAttribute("aria-hidden", String(!isOpen));
    if (!isOpen) closeAgendaBoard();
    if (shouldSave) localStorage.setItem(STORAGE_KEYS.open, String(isOpen));
  }

  function openAgendaBoard() {
    document.body.classList.add("agenda-open");
    document.querySelector(".agenda-board")?.setAttribute("aria-hidden", "false");
    if (document.getElementById("agendaDate")) document.getElementById("agendaDate").value = selectedAgendaDate;
    renderAgenda();
    setTimeout(() => document.querySelector("[data-agenda-create]")?.focus(), 0);
  }

  function closeAgendaBoard() {
    document.body.classList.remove("agenda-open");
    document.querySelector(".agenda-board")?.setAttribute("aria-hidden", "true");
  }

  function restoreTrayState() {
    document.body.classList.remove("tray-transition-enabled");
    setTrayOpen(localStorage.getItem(STORAGE_KEYS.open) === "true", false);
    document.documentElement.classList.remove("tray-preopen");
  }

  function setTheme(theme, save) {
    const next = theme === "dark" ? "dark" : "light";
    if (window.EstudiemosTheme && save) {
      window.EstudiemosTheme.set(next);
    } else {
      document.documentElement.classList.toggle("theme-dark", next === "dark");
      document.documentElement.classList.toggle("theme-light", next === "light");
      if (save) localStorage.setItem("estudiemos_theme", next);
      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) themeColor.setAttribute("content", next === "dark" ? "#0f172a" : "#f8fafc");
    }
    markActiveTheme();
  }

  function markActiveTheme() {
    const isDark = document.documentElement.classList.contains("theme-dark");
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.themeChoice === (isDark ? "dark" : "light"));
    });
  }

  function refreshPageActions() {
    addSubjectButtons();
    addResourceButtons();
    syncActionButtons();
    syncSubjectButtons();
  }

  function addSubjectButtons() {
    document.querySelectorAll('a.card[href*="/materia/"], a.card[href^="../materia/"], a.card[href^="./pages/materia/"]').forEach((card) => {
      if (card.querySelector("[data-subject-toggle]")) return;

      const slug = getSlug(card.getAttribute("href"));
      if (!slug || !getSubjects().some((subject) => subject.slug === slug)) return;

      card.classList.add("bandeja-card-wrap");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-toggle";
      button.dataset.subjectToggle = slug;
      card.appendChild(button);
    });
  }

  function addResourceButtons() {
    const currentTopic = findCurrentTopic();

    if (currentTopic) {
      const panel = document.querySelector(".panel");
      const desc = document.getElementById("topicDesc");
      if (panel && desc && !panel.querySelector(".bandeja-actions")) {
        desc.insertAdjacentElement("afterend", createActions(currentTopic, true));
      }
      addTopicProfessorButton(currentTopic);
    }

    document.querySelectorAll(".topic-card, .video-card").forEach((card) => {
      if (card.closest(".tray-shell")) return;
      if (card.querySelector(".bandeja-mini-actions")) return;

      const item = itemFromCard(card, currentTopic);
      if (!item) return;

      card.classList.add("bandeja-card-wrap");
      card.appendChild(createActions(item, false));
    });
  }

  function createActions(item, showText) {
    const wrapper = document.createElement("div");
    wrapper.className = showText ? "bandeja-actions" : "bandeja-mini-actions";
    wrapper.appendChild(createActionButton("Favorito", STORAGE_KEYS.favorites, item, "star", showText));
    wrapper.appendChild(createActionButton("Guardar", STORAGE_KEYS.saved, item, "bookmark", showText));
    return wrapper;
  }

  function addTopicProfessorButton(currentTopic) {
    const actions = document.querySelector(".panel .bandeja-actions");
    if (!actions || actions.querySelector("[data-topic-professor]")) return;

    const slug = getTopicSlugFromId(currentTopic.id);
    const topicInfo = findTopicBySlug(slug);
    const professor = topicInfo?.materia?.aiProfessor;
    if (!professor?.url) return;

    const link = document.createElement("a");
    link.className = "topic-professor-btn";
    link.dataset.topicProfessor = "true";
    link.href = professor.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = `Preguntar al profesor de ${topicInfo.materia.title}`;
    link.setAttribute("aria-label", link.title);
    link.innerHTML = `${icon("message")}<span>Preguntar</span>`;
    actions.appendChild(link);
  }

  function createActionButton(label, key, item, iconName, showText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = showText ? "bandeja-action-btn bandeja-action-btn--text" : "bandeja-action-btn bandeja-action-btn--icon";
    button.dataset.bandejaAction = key;
    button.dataset.bandejaId = item.id;
    button.__bandejaItem = item;
    button.title = key === STORAGE_KEYS.favorites ? "Marcar como favorito" : "Guardar para después";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `${icon(iconName)}${showText ? `<span>${label}</span>` : `<span class="sr-only">${label}</span>`}`;
    return button;
  }

  function renderTray() {
    const favorites = readList(STORAGE_KEYS.favorites);
    const saved = readList(STORAGE_KEYS.saved);
    const recent = readList(STORAGE_KEYS.recent);
    const selectedSubjects = readList(STORAGE_KEYS.subjects);
    const subjects = getSubjects().filter((subject) => selectedSubjects.includes(subject.slug));

    renderList("favoritesList", favorites, "Todavía no agregaste favoritos.", STORAGE_KEYS.favorites);
    renderList("savedList", saved, "Todavía no guardaste recursos para después.", STORAGE_KEYS.saved);
    renderList("recentList", recent, "Todavía no hay temas recientes.", STORAGE_KEYS.recent);
    renderList("mySubjectsQuick", subjects.map((subject) => ({
      id: `materia:${subject.slug}`,
      type: "Materia",
      title: subject.title,
      subject: subject.title,
      url: createMateriaUrl(subject.slug),
      target: "_self"
    })), "Todavía no seleccionaste materias.", STORAGE_KEYS.subjects);
    renderAgenda();
  }

  function agendaSubjectOptions() {
    const selectedSlugs = new Set(readList(STORAGE_KEYS.subjects));
    const subjects = getSubjects();
    const selectedSubjects = subjects.filter((subject) => selectedSlugs.has(subject.slug));
    const otherSubjects = subjects.filter((subject) => !selectedSlugs.has(subject.slug));
    return [...selectedSubjects, ...otherSubjects]
      .map((subject) => `<option value="${escapeAttr(subject.title)}">${escapeHtml(subject.title)}</option>`)
      .join("") + `<option value="" selected>Sin materia</option>`;
  }

  function agendaTypeOptions() {
    return AGENDA_TYPES
      .map((type) => `<option value="${escapeAttr(type)}">${escapeHtml(type)}</option>`)
      .join("");
  }

  function refreshAgendaSubjectOptions() {
    const select = document.getElementById("agendaSubject");
    if (!select) return;
    const current = select.value;
    const nextOptions = agendaSubjectOptions();
    if (select.dataset.optionsHtml === nextOptions) return;
    select.innerHTML = nextOptions;
    select.dataset.optionsHtml = nextOptions;
    select.value = [...select.options].some((option) => option.value === current) ? current : "";
  }

  function updateAgendaSubmitState() {
    const title = document.getElementById("agendaTitle")?.value.trim() || "";
    const button = document.querySelector(".agenda-save-btn");
    if (button) button.disabled = !title;
  }

  function addAgendaItem() {
    const titleInput = document.getElementById("agendaTitle");
    const typeInput = document.getElementById("agendaType");
    const dateInput = document.getElementById("agendaDate");
    const subjectInput = document.getElementById("agendaSubject");
    const noteInput = document.getElementById("agendaNote");
    const startTimeInput = document.getElementById("agendaStartTime");
    const endTimeInput = document.getElementById("agendaEndTime");
    const title = titleInput?.value.trim();
    if (!title) return;

    const items = readList(STORAGE_KEYS.agenda);
    items.unshift({
      id: `agenda:${Date.now()}`,
      title,
      type: typeInput?.value || "Tarea",
      date: dateInput?.value || selectedAgendaDate,
      subject: subjectInput?.value || "",
      note: noteInput?.value.trim() || "",
      horaInicio: startTimeInput?.value || "",
      horaFin: endTimeInput?.value || "",
      done: false,
      createdAt: Date.now()
    });

    writeList(STORAGE_KEYS.agenda, items.slice(0, 30));
    titleInput.value = "";
    if (dateInput) dateInput.value = selectedAgendaDate;
    if (noteInput) noteInput.value = "";
    if (startTimeInput) startTimeInput.value = "";
    if (endTimeInput) endTimeInput.value = "";
    updateAgendaSubmitState();
    renderAgenda();
  }

  function renderAgenda() {
    const container = document.getElementById("agendaList");
    refreshAgendaSubjectOptions();
    updateAgendaSubmitState();
    const items = readList(STORAGE_KEYS.agenda)
      .map(normalizeAgendaItem)
      .filter(Boolean)
      .sort(compareAgendaItems);

    renderAgendaMini(items);
    renderAgendaCalendar(items);
    if (!container) return;

    const visibleItems = items.filter((item) => {
      if (agendaFilter === "day") return item.date === selectedAgendaDate;
      if (agendaFilter === "done") return item.done;
      if (agendaFilter === "all") return true;
      return !item.done;
    });

    document.querySelectorAll("[data-agenda-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.agendaFilter === agendaFilter);
    });

    if (!visibleItems.length) {
      container.innerHTML = `<p class="tray-empty">${agendaFilter === "day" ? "No hay anotaciones para este día." : "Todavía no agregaste pendientes."}</p>`;
      return;
    }

    container.innerHTML = visibleItems.map((item) => `
      <article class="agenda-item ${agendaTypeClass(item.type)} ${item.done ? "is-done" : ""}">
        <label class="agenda-item__check">
          <input type="checkbox" data-agenda-done="${escapeAttr(item.id)}" ${item.done ? "checked" : ""} />
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
          </span>
        </label>
        <div class="agenda-item__meta">
          <span class="agenda-type-badge ${agendaTypeClass(item.type)}">${escapeHtml(item.type)}</span>
          ${item.date ? `<span>${escapeHtml(formatAgendaDate(item.date))}</span>` : ""}
          ${formatAgendaTimeRange(item) ? `<span>${escapeHtml(formatAgendaTimeRange(item))}</span>` : ""}
          ${item.subject ? `<span>${escapeHtml(item.subject)}</span>` : ""}
        </div>
        <button class="bandeja-remove-btn agenda-item__remove" type="button" data-agenda-remove="${escapeAttr(item.id)}" aria-label="Quitar ${escapeAttr(item.title)}">${icon("close")}</button>
      </article>
    `).join("");
  }

  function renderAgendaMini(items) {
    const container = document.getElementById("agendaMiniList");
    if (!container) return;

    const nextItems = items.filter((item) => !item.done).slice(0, 3);
    if (!nextItems.length) {
      container.innerHTML = `<p class="tray-empty">Sin pendientes próximos.</p>`;
      return;
    }

    container.innerHTML = nextItems.map((item) => `
      <button class="agenda-mini-item" type="button" data-agenda-open>
        <span>${escapeHtml(item.title)}</span>
        <small><b class="${agendaTypeClass(item.type)}">${escapeHtml(item.type)}</b>${escapeHtml([item.date ? formatAgendaDate(item.date) : "", item.subject].filter(Boolean).map((value) => ` · ${value}`).join(""))}</small>
      </button>
    `).join("");
  }

  function renderAgendaCalendar(items) {
    const grid = document.getElementById("agendaCalendarGrid");
    const monthLabel = document.getElementById("agendaMonthLabel");
    const selectedLabel = document.getElementById("agendaSelectedLabel");
    const dateInput = document.getElementById("agendaDate");
    if (!grid || !monthLabel || !selectedLabel) return;

    monthLabel.textContent = formatAgendaMonth(agendaYear, agendaMonth);
    selectedLabel.textContent = formatFullDate(selectedAgendaDate);
    if (dateInput && !dateInput.value) dateInput.value = selectedAgendaDate;

    const byDate = groupAgendaByDate(items);
    const firstDay = new Date(agendaYear, agendaMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(agendaYear, agendaMonth, 1 - startOffset);
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
      const day = currentDate.getDate();
      const date = toDateValue(currentDate);
      const dayItems = byDate.get(date) || [];
      const isSelected = date === selectedAgendaDate;
      const isToday = date === toDateValue(new Date());
      const isOutside = currentDate.getMonth() !== agendaMonth;

      cells.push(`
        <button class="agenda-day ${isOutside ? "is-outside" : ""} ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}" type="button" data-agenda-date="${escapeAttr(date)}">
          <span class="agenda-day__number">${day}</span>
          <span class="agenda-day__items">
            ${dayItems.slice(0, 3).map((item) => `
              <span class="agenda-event-pill ${agendaTypeClass(item.type)}">
                <i aria-hidden="true"></i>
                <span>${escapeHtml(formatAgendaCalendarSummary(item))}</span>
              </span>
            `).join("")}
            ${dayItems.length > 3 ? `<small>+${dayItems.length - 3} más</small>` : ""}
          </span>
        </button>
      `);
    }

    grid.innerHTML = cells.join("");
  }

  function groupAgendaByDate(items) {
    const map = new Map();
    items.forEach((item) => {
      if (!item.date) return;
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
    });
    return map;
  }

  function moveAgendaMonth(direction) {
    const next = new Date(agendaYear, agendaMonth + direction, 1);
    agendaYear = next.getFullYear();
    agendaMonth = next.getMonth();
    selectedAgendaDate = toDateValue(next);
    const dateInput = document.getElementById("agendaDate");
    if (dateInput) dateInput.value = selectedAgendaDate;
    agendaFilter = "day";
    renderAgenda();
  }

  function goToToday() {
    const today = new Date();
    selectedAgendaDate = toDateValue(today);
    agendaYear = today.getFullYear();
    agendaMonth = today.getMonth();
    if (document.getElementById("agendaDate")) document.getElementById("agendaDate").value = selectedAgendaDate;
    agendaFilter = "day";
    renderAgenda();
  }

  function focusAgendaForm() {
    if (document.getElementById("agendaDate")) document.getElementById("agendaDate").value = selectedAgendaDate;
    document.getElementById("agendaTitle")?.focus();
  }

  function selectAgendaDate(value, syncInput = true) {
    if (!value) return;
    const date = parseDateValue(value);
    if (!date) return;
    selectedAgendaDate = value;
    agendaYear = date.getFullYear();
    agendaMonth = date.getMonth();
    if (syncInput && document.getElementById("agendaDate")) document.getElementById("agendaDate").value = value;
    agendaFilter = "day";
    renderAgenda();
  }

  function toggleAgendaDone(id) {
    const items = readList(STORAGE_KEYS.agenda).map((item) => {
      if (item.id !== id) return item;
      return { ...item, done: !item.done };
    });
    writeList(STORAGE_KEYS.agenda, items);
    renderAgenda();
  }

  function removeAgendaItem(id) {
    writeList(STORAGE_KEYS.agenda, readList(STORAGE_KEYS.agenda).filter((item) => item.id !== id));
    renderAgenda();
  }

  function normalizeAgendaItem(item) {
    if (!item || !item.id || !item.title) return null;
    return {
      id: String(item.id),
      title: String(item.title),
      type: normalizeAgendaType(item.type),
      date: item.date || "",
      subject: item.subject || "",
      note: item.note || "",
      horaInicio: item.horaInicio || item.startTime || "",
      horaFin: item.horaFin || item.endTime || "",
      done: Boolean(item.done),
      createdAt: Number(item.createdAt) || 0
    };
  }

  function compareAgendaItems(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.horaInicio && b.horaInicio && a.horaInicio !== b.horaInicio) return a.horaInicio.localeCompare(b.horaInicio);
    if (a.horaInicio && !b.horaInicio) return -1;
    if (!a.horaInicio && b.horaInicio) return 1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return b.createdAt - a.createdAt;
  }

  function normalizeAgendaType(type) {
    const value = String(type || "Tarea").trim();
    const normalized = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const aliases = {
      examen: "Parcial",
      trabajo: "Entrega",
      "sesion de estudio": "Estudio"
    };
    const nextType = aliases[normalized] || value;
    return AGENDA_TYPES.includes(nextType) ? nextType : "Tarea";
  }

  function formatAgendaDate(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return value;
    return new Date(year, month - 1, day).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short"
    });
  }

  function formatAgendaTimeRange(item) {
    if (item.horaInicio && item.horaFin) return `${item.horaInicio}-${item.horaFin}`;
    if (item.horaInicio) return item.horaInicio;
    if (item.horaFin) return `Hasta ${item.horaFin}`;
    return "";
  }

  function formatAgendaCalendarSummary(item) {
    const prefix = item.subject || item.type;
    const time = formatAgendaTimeRange(item);
    return `${time ? `${time} ` : ""}${prefix}: ${item.title}`;
  }

  function formatFullDate(value) {
    const date = parseDateValue(value);
    if (!date) return "Elegí un día";
    return sentenceCase(date.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }));
  }

  function formatAgendaMonth(year, month) {
    return sentenceCase(new Date(year, month, 1).toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric"
    }));
  }

  function sentenceCase(value) {
    const text = String(value || "").toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function agendaTypeClass(type) {
    const normalized = String(type || "Tarea")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return `agenda-type-${normalized || "tarea"}`;
  }

  function parseDateValue(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function toDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderList(elementId, items, emptyText, key) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="tray-empty">${emptyText}</p>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <a class="topic-card bandeja-list-card" href="${escapeAttr(createInternalUrl(item.url))}" target="${item.target || "_self"}" rel="noopener">
        <div>
          <p class="topic-card__title">${escapeHtml(item.title)}</p>
          ${item.topic ? `<p class="global-search__meta">Tema: ${escapeHtml(item.topic)}</p>` : ""}
          ${item.subject ? `<p class="global-search__meta">Materia: ${escapeHtml(item.subject)}</p>` : ""}
        </div>
        <span class="global-search__tag">${escapeHtml(item.type)}</span>
        <button class="bandeja-remove-btn" type="button" data-bandeja-remove="${escapeAttr(key)}" data-bandeja-remove-id="${escapeAttr(item.id)}" aria-label="Quitar ${escapeAttr(item.title)}">${icon("close")}</button>
      </a>
    `).join("");
  }

  function syncActionButtons() {
    const favorites = new Set(readList(STORAGE_KEYS.favorites).map((item) => item.id));
    const saved = new Set(readList(STORAGE_KEYS.saved).map((item) => item.id));

    document.querySelectorAll("[data-bandeja-action][data-bandeja-id]").forEach((button) => {
      const set = button.dataset.bandejaAction === STORAGE_KEYS.favorites ? favorites : saved;
      button.classList.toggle("is-active", set.has(button.dataset.bandejaId));
    });
  }

  function syncSubjectButtons() {
    const selected = new Set(readList(STORAGE_KEYS.subjects));
    document.querySelectorAll("[data-subject-toggle]").forEach((button) => {
      button.textContent = selected.has(button.dataset.subjectToggle) ? "Elegida" : "Agregar";
    });
  }

  function trackRecentTopic() {
    const current = findCurrentTopic();
    if (!current) return;

    const recent = readList(STORAGE_KEYS.recent).filter((item) => item.id !== current.id);
    recent.unshift(current);
    writeList(STORAGE_KEYS.recent, recent.slice(0, 8));
  }

  function observeLateCards() {
    const target = document.querySelector("main") || document.body;
    const observer = new MutationObserver(() => {
      if (refreshQueued) return;
      refreshQueued = true;
      requestAnimationFrame(() => {
        refreshQueued = false;
        refreshPageActions();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function itemFromCard(card, currentTopic) {
    const href = card.getAttribute("href");
    const title = card.querySelector(".topic-card__title, .video-card__title")?.textContent?.trim();
    if (!href || !title) return null;

    let type = "Tema";
    if (card.classList.contains("video-card")) type = "Video";
    else if (href.includes(".pdf") || card.closest("#pdfList")) type = "PDF";
    else if (card.closest("#toolList")) type = "Herramienta";

    const item = createStableItem(type, title, href, currentTopic);
    item.target = href.startsWith("http") || href.includes(".pdf") ? "_blank" : "_self";
    return item;
  }

  function createStableItem(type, title, href, currentTopic) {
    const url = normalizeStoredUrl(href);
    const slug = getTopicSlugFromUrl(url);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);
      return {
        id: `tema:${slug}`,
        type: "Tema",
        title: topicInfo?.tema?.title || title,
        topic: topicInfo?.tema?.title || currentTopic?.topic || "",
        subject: topicInfo?.materia?.title || currentTopic?.subject || "",
        url: createTopicUrl(slug),
        target: "_self"
      };
    }

    return {
      id: `${normalizeType(type)}:${url}`,
      type,
      title,
      topic: currentTopic?.topic || "",
      subject: currentTopic?.subject || "",
      url
    };
  }

  function findCurrentTopic() {
    if (!location.pathname.includes("/pages/tema/")) return null;
    const slug = location.pathname.split("/").pop().replace(".html", "");
    const topicInfo = findTopicBySlug(slug);
    if (!topicInfo) return null;

    return {
      id: `tema:${slug}`,
      type: "Tema",
      title: topicInfo.tema.title,
      topic: topicInfo.tema.title,
      subject: topicInfo.materia.title,
      url: createTopicUrl(slug),
      target: "_self"
    };
  }

  function findTopicBySlug(slug) {
    for (const carrera of DATA.carreras) {
      for (const materia of carrera.materias || []) {
        for (const tema of materia.temas || []) {
          if (tema.slug === slug) return { materia, tema };
        }
      }
    }
    return null;
  }

  function getSubjects() {
    return DATA.carreras.flatMap((carrera) => carrera.materias || []);
  }

  function toggleSubject(slug) {
    const selected = readList(STORAGE_KEYS.subjects);
    writeList(STORAGE_KEYS.subjects, selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug]);
  }

  function toggleItem(key, item) {
    const normalized = normalizeItem(item) || item;
    const list = readList(key);
    const exists = list.some((saved) => saved.id === normalized.id);
    writeList(key, dedupeItems(exists ? list.filter((saved) => saved.id !== normalized.id) : [normalized, ...list]));
  }

  function removeItem(key, id) {
    if (key === STORAGE_KEYS.subjects) {
      writeList(key, readList(key).filter((slug) => `materia:${slug}` !== id));
      syncSubjectButtons();
    } else {
      writeList(key, readList(key).filter((item) => item.id !== id));
      syncActionButtons();
    }
    renderTray();
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(value)) return [];
      if (key === STORAGE_KEYS.subjects) return value;
      if (key === STORAGE_KEYS.agenda) return value.map(normalizeAgendaItem).filter(Boolean);
      return dedupeItems(value.map(normalizeItem).filter(Boolean));
    } catch (error) {
      return [];
    }
  }

  function writeList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeItem(item) {
    if (!item || !item.id) return null;
    const type = item.type || getTypeFromId(item.id);
    const url = normalizeStoredUrl(item.url || "");
    const slug = getTopicSlugFromUrl(url) || getTopicSlugFromId(item.id);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);
      return {
        ...item,
        id: `tema:${slug}`,
        type: "Tema",
        title: topicInfo?.tema?.title || item.title,
        topic: topicInfo?.tema?.title || item.topic || "",
        subject: topicInfo?.materia?.title || item.subject || "",
        url: createTopicUrl(slug),
        target: "_self"
      };
    }

    return { ...item, id: `${normalizeType(type)}:${url}`, type, url };
  }

  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function createInternalUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;
    return getRootPath() + normalizeStoredUrl(url);
  }

  function normalizeStoredUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;

    const clean = String(url).replace(/\\/g, "/");
    const match = clean.match(/(?:^|\/)(pages|pdfs|tools|herramientas)\//);
    if (match) return clean.slice(match.index + (clean[match.index] === "/" ? 1 : 0));
    return clean.replace(/^(\.\/|\.\.\/)+/, "");
  }

  function isExternalUrl(url) {
    return /^https?:\/\//.test(url) || String(url).startsWith("mailto:");
  }

  function createTopicUrl(slug) {
    return `pages/tema/${slug}.html`;
  }

  function createMateriaUrl(slug) {
    return `pages/materia/${slug}.html`;
  }

  function getSlug(url) {
    return String(url || "").split("/").pop().replace(".html", "");
  }

  function getTopicSlugFromUrl(url) {
    const match = String(url || "").match(/pages\/tema\/([^/.]+)\.html/);
    return match ? match[1] : "";
  }

  function getTopicSlugFromId(id) {
    const match = String(id || "").match(/tema:([^/]+)$/i);
    return match ? match[1].replace(".html", "") : "";
  }

  function getTypeFromId(id) {
    const type = String(id || "").split(":")[0].toLowerCase();
    if (type === "tema") return "Tema";
    if (type === "video") return "Video";
    if (type === "pdf") return "PDF";
    if (type === "herramienta") return "Herramienta";
    return "Recurso";
  }

  function normalizeType(type) {
    return String(type || "recurso").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function icon(name) {
    const icons = {
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.9l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8L12 3.9z"/></svg>',
      bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8c0-.5.4-.8.8-.8h8.4c.4 0 .8.3.8.8v15l-5-3-5 3v-15z"/></svg>',
      message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h3v1.8l2.3-1.8H19V6H5Zm3 3h8v2H8V9Z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4z"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h2.2A2.8 2.8 0 0 1 22 6.8v11.4a2.8 2.8 0 0 1-2.8 2.8H4.8A2.8 2.8 0 0 1 2 18.2V6.8A2.8 2.8 0 0 1 4.8 4H7V2Zm12 8H5v8.2c0 .4.4.8.8.8h12.4c.4 0 .8-.4.8-.8V10ZM5.8 6c-.4 0-.8.4-.8.8V8h14V6.8c0-.4-.4-.8-.8-.8H17v2h-2V6H9v2H7V6H5.8Zm1.7 6h3v3h-3v-3Zm5 0h3v3h-3v-3Z"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>',
      chevronLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.8 5.4 1.4 1.4-5.2 5.2 5.2 5.2-1.4 1.4L8.2 12l6.6-6.6Z"/></svg>',
      chevronRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 18.6-1.4-1.4 5.2-5.2-5.2-5.2 1.4-1.4 6.6 6.6-6.6 6.6Z"/></svg>',
      sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.2a1 1 0 0 1-1-1V2.8a1 1 0 1 1 2 0v1.4a1 1 0 0 1-1 1Zm0 16a1 1 0 0 1-1-1v-1.4a1 1 0 1 1 2 0v1.4a1 1 0 0 1-1 1Zm6.8-8.2a1 1 0 1 1 0-2h1.4a1 1 0 1 1 0 2h-1.4ZM3.8 13a1 1 0 1 1 0-2h1.4a1 1 0 1 1 0 2H3.8Zm13-5.8a1 1 0 0 1 0-1.4l1-1a1 1 0 1 1 1.4 1.4l-1 1a1 1 0 0 1-1.4 0ZM4.8 19.2a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 1.4l-1 1a1 1 0 0 1-1.4 0Zm13 0-1-1a1 1 0 0 1 1.4-1.4l1 1a1 1 0 1 1-1.4 1.4ZM5.8 7.2l-1-1a1 1 0 1 1 1.4-1.4l1 1a1 1 0 0 1-1.4 1.4ZM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"/></svg>',
      moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 14.7a8.3 8.3 0 0 1-11-11 1 1 0 0 0-1.1-1.4A10.2 10.2 0 1 0 21.7 15.8a1 1 0 0 0-1.4-1.1ZM12 20.1a8.2 8.2 0 0 1-5.6-14.2 10.3 10.3 0 0 0 11.7 11.7 8.1 8.1 0 0 1-6.1 2.5Z"/></svg>'
    };
    return icons[name] || "";
  }

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }
})();
