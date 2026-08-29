(function () {
  if (window.EstudiemosDesktopWidgets) return;

  const AGENDA_KEY = "bandeja_agenda";
  const STREAK_KEY = "estudiemos_pomodoro_streak";
  const POMODORO_KEY = "estudiemos_pomodoro";
  const CALENDAR_VIEW_KEY = "estudiemos_calendar_view";
  const WORKSPACE_CHANGE_KEY = "estudiemos_workspace_changed";
  const CLOUD_REFRESH_KEY = "estudiemos_desktop_widget_cloud_refresh";
  const CLOUD_REFRESH_INTERVAL = 10000;
  const standaloneHost = document.querySelector("[data-desktop-widget-host]");
  const state = {
    view: getInitialView(),
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    date: dateValue(new Date()),
    calendarView: localStorage.getItem(CALENDAR_VIEW_KEY) === "month" ? "month" : "week",
    widgetWindow: null,
    hostedWidget: false,
    refreshTimer: null,
    cloudRefreshTimer: null,
    workspaceItems: [],
    workspaceLoading: false
  };
  let nativeSyncTimer = null;
  let workspaceReloadTimer = null;
  let lastWorkspaceMarker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || "0";

  window.EstudiemosDesktopWidgets = {
    available: isDesktopDevice(),
    open,
    refreshFromCloud
  };

  window.addEventListener("storage", handleSynchronizedChange);
  window.addEventListener("estudiemos:data-change", handleSynchronizedChange);
  window.addEventListener("estudiemos:cloud-restored", handleSynchronizedChange);
  window.addEventListener("estudiemos:account-change", loadWorkspaceItems);
  window.addEventListener("estudiemos:theme-change", refresh);
  window.addEventListener("load", scheduleNativeWindowsSync, { once: true });
  scheduleNativeWindowsSync();
  if (standaloneHost) mountStandalone();
  window.EstudiemosAccount?.whenReady?.().then(loadWorkspaceItems).catch(() => {});

  async function open(view = "inbox") {
    if (!isDesktopDevice()) return false;
    state.view = ["workspace", "inbox", "calendar", "streak", "pomodoro"].includes(view) ? view : "inbox";
    let pictureInPicture = false;

    if (state.widgetWindow && !state.widgetWindow.closed) {
      state.widgetWindow.focus();
      showHostedWidget(state.view);
      return true;
    }

    try {
      if ("documentPictureInPicture" in window) {
        pictureInPicture = true;
        state.widgetWindow = await window.documentPictureInPicture.requestWindow({ width: 390, height: 520 });
        mountHostedWidget();
      } else {
        state.widgetWindow = window.open(widgetUrl(state.view), "estudiemos-desktop-widget", "popup=yes,width=390,height=520,resizable=yes");
        state.hostedWidget = true;
      }
    } catch (_) {
      state.widgetWindow = null;
      state.hostedWidget = false;
      return false;
    }

    if (!state.widgetWindow) return false;
    if (pictureInPicture) {
      state.widgetWindow.addEventListener("pagehide", cleanup, { once: true });
      state.widgetWindow.addEventListener("beforeunload", cleanup, { once: true });
    }
    return true;
  }

  function widgetUrl(view) {
    const root = new URL(window.EstudiemosRoot || "./", location.origin).href;
    const url = new URL("widget.html", root);
    url.searchParams.set("view", view);
    url.searchParams.set("source", "desktop-app");
    return url.href;
  }

  function mountHostedWidget() {
    const popup = state.widgetWindow;
    const doc = popup.document;
    const head = doc.createElement("head");
    const body = doc.createElement("body");
    const charset = doc.createElement("meta");
    const viewport = doc.createElement("meta");
    const title = doc.createElement("title");
    const style = doc.createElement("style");
    charset.charset = "UTF-8";
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    title.textContent = "Widget de Estudiemos";
    style.textContent = `${widgetStyles()} html body{grid-template-rows:minmax(0,1fr)} body>main{height:100%}`;
    head.append(charset, viewport, title, style);
    body.innerHTML = '<main id="widgetContent"></main>';
    doc.documentElement.replaceChildren(head, body);
    doc.addEventListener("click", handleWidgetClick);
    doc.addEventListener("change", handleWidgetChange);
    state.hostedWidget = false;
    state.refreshTimer = window.setInterval(refresh, 500);
    render();
  }

  function showHostedWidget(view) {
    if (!state.widgetWindow || state.widgetWindow.closed) return;
    if (!state.hostedWidget) return render();
    const frame = state.widgetWindow.document.querySelector("iframe");
    const nextUrl = widgetUrl(view);
    if (frame) frame.src = nextUrl;
    else if (state.widgetWindow.location.href !== nextUrl) state.widgetWindow.location.replace(nextUrl);
  }

  function mountStandalone() {
    const style = document.createElement("style");
    style.dataset.desktopWidgetStyle = "true";
    style.textContent = widgetStyles();
    document.head.appendChild(style);
    document.addEventListener("click", handleWidgetClick);
    document.addEventListener("change", handleWidgetChange);
    document.addEventListener("pointerdown", beginRainmeterResize);
    state.refreshTimer = window.setInterval(render, 500);
    state.cloudRefreshTimer = window.setInterval(refreshFromCloud, 5000);
    window.EstudiemosAccount?.whenReady?.().then(refreshFromCloud).catch(() => {});
    render();
  }

  async function refreshFromCloud() {
    refresh();
    const account = window.EstudiemosAccount;
    if (!account?.whenReady || (!account?.refresh && !account?.sync)) return;
    try {
      await account.whenReady();
      if (!account.getUser?.()) return;
      const now = Date.now();
      const lastRefresh = Number(localStorage.getItem(CLOUD_REFRESH_KEY) || 0);
      if (now - lastRefresh < CLOUD_REFRESH_INTERVAL) return;
      localStorage.setItem(CLOUD_REFRESH_KEY, String(now));
      await (account.refresh?.() || account.sync());
      if (state.view === "workspace") await loadWorkspaceItems();
      refreshAndSyncNative();
    } catch (_) {}
  }

  function render() {
    if (state.hostedWidget && !standaloneHost) return;
    const popup = standaloneHost ? window : state.widgetWindow;
    if (!popup || (!standaloneHost && popup.closed)) return cleanup();
    const doc = popup.document;
    doc.documentElement.dataset.theme = document.documentElement.classList.contains("theme-light") ? "light" : "dark";
    doc.querySelectorAll("[data-widget-view]").forEach((button) => {
      const active = button.dataset.widgetView === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    const content = doc.getElementById("widgetContent");
    if (!content) return;
    if (state.view === "workspace") content.innerHTML = workspaceMarkup();
    else if (state.view === "calendar") content.innerHTML = calendarMarkup();
    else if (state.view === "pomodoro") content.innerHTML = pomodoroMarkup();
    else if (state.view === "streak") content.innerHTML = streakMarkup();
    else content.innerHTML = inboxMarkup();
    if (standaloneHost && !window.EstudiemosAccount?.getUser?.()) {
      content.insertAdjacentHTML("beforeend", '<button class="widget-connect" type="button" data-widget-account>Conectar cuenta</button>');
    }
    syncRainmeterReminderState();
  }

  function syncRainmeterReminderState() {
    if (!document.documentElement.classList.contains("rainmeter-widget") || !window.RainmeterAPI?.Bang) return;
    const today = dateValue(new Date());
    const streak = readStreak();
    const minutes = Math.max(0, Math.floor(Number(streak?.days?.[today]) || 0));
    try {
      window.RainmeterAPI.Bang(
        `[!WriteKeyValue Reminder TodayDate "${today}" "#@#ReminderState.inc"]` +
        `[!WriteKeyValue Reminder TodayMinutes "${minutes}" "#@#ReminderState.inc"]`
      );
    } catch (_) {}
  }

  function refresh() {
    if (standaloneHost) return render();
    if (!state.widgetWindow || state.widgetWindow.closed) return;
    render();
  }

  function refreshAndSyncNative() {
    refresh();
    scheduleNativeWindowsSync();
  }

  function handleSynchronizedChange(event) {
    refreshAndSyncNative();
    const key = event?.detail?.key || event?.key || "";
    const marker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || "0";
    if (marker === lastWorkspaceMarker && key !== WORKSPACE_CHANGE_KEY) return;
    lastWorkspaceMarker = marker;
    window.clearTimeout(workspaceReloadTimer);
    workspaceReloadTimer = window.setTimeout(loadWorkspaceItems, 100);
  }

  function scheduleNativeWindowsSync() {
    if (!("serviceWorker" in navigator)) return;
    if (nativeSyncTimer) window.clearTimeout(nativeSyncTimer);
    nativeSyncTimer = window.setTimeout(syncNativeWindowsWidgets, 180);
  }

  async function syncNativeWindowsWidgets() {
    nativeSyncTimer = null;
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active || registration.waiting || registration.installing;
      worker?.postMessage({
        type: "ESTUDIEMOS_WIDGET_DATA",
        state: {
          agenda: readAgenda(),
          streak: readStreak(),
          pomodoro: readPomodoro()
        }
      });
    } catch (_) {}
  }

  function cleanup() {
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    if (state.cloudRefreshTimer) window.clearInterval(state.cloudRefreshTimer);
    state.refreshTimer = null;
    state.cloudRefreshTimer = null;
    state.widgetWindow = null;
    state.hostedWidget = false;
  }

  function handleWidgetClick(event) {
    const tab = event.target.closest("[data-widget-view]");
    if (tab) {
      state.view = tab.dataset.widgetView;
      render();
      return;
    }

    const month = event.target.closest("[data-widget-month]");
    if (month) {
      const current = parseDateValue(state.date) || new Date(state.year, state.month, 1);
      const direction = Number(month.dataset.widgetMonth);
      const next = state.calendarView === "week"
        ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7)
        : new Date(state.year, state.month + direction, 1);
      state.year = next.getFullYear();
      state.month = next.getMonth();
      state.date = dateValue(next);
      render();
      return;
    }

    const calendarView = event.target.closest("[data-widget-calendar-view]");
    if (calendarView) {
      state.calendarView = calendarView.dataset.widgetCalendarView === "month" ? "month" : "week";
      localStorage.setItem(CALENDAR_VIEW_KEY, state.calendarView);
      window.dispatchEvent(new CustomEvent("estudiemos:calendar-view-change", { detail: { view: state.calendarView } }));
      render();
      return;
    }

    const pomodoroAction = event.target.closest("[data-widget-pomodoro]");
    if (pomodoroAction) {
      updatePomodoro(pomodoroAction.dataset.widgetPomodoro);
      return;
    }

    const workspaceItem = event.target.closest("[data-widget-workspace-item]");
    if (workspaceItem) {
      const id = workspaceItem.dataset.widgetWorkspaceItem;
      const item = state.workspaceItems.find((entry) => entry.id === id);
      if (!item) return;
      if (standaloneHost) return openMainApp(`?workspaceItem=${encodeURIComponent(item.id)}&workspaceKind=${encodeURIComponent(item.kind)}`);
      window.focus();
      window.dispatchEvent(new CustomEvent("estudiemos:open-workspace-item", { detail: { id: item.id } }));
      return;
    }

    if (event.target.closest("[data-widget-open-workspace]")) {
      if (standaloneHost) return openMainApp("");
      window.focus();
      return;
    }

    const day = event.target.closest("[data-widget-date]");
    if (day) {
      if (standaloneHost) return openMainApp(`?agenda=1&date=${encodeURIComponent(day.dataset.widgetDate)}`);
      window.focus();
      window.dispatchEvent(new CustomEvent("estudiemos:open-agenda", { detail: { date: day.dataset.widgetDate } }));
      return;
    }

    if (event.target.closest("[data-widget-open-inbox]")) {
      if (standaloneHost) return openMainApp("?agenda=1");
      window.focus();
      window.dispatchEvent(new CustomEvent("estudiemos:open-agenda"));
      return;
    }

    if (event.target.closest("[data-widget-open-pomodoro]")) {
      if (standaloneHost) return openMainApp("?pomodoro=1");
      window.focus();
      document.querySelector("[data-pomodoro-open]")?.click();
      return;
    }

    if (event.target.closest("[data-widget-account]")) {
      window.EstudiemosAccount?.open?.();
      return;
    }

  }

  function handleWidgetChange(event) {
    const checkbox = event.target.closest("[data-widget-done]");
    if (!checkbox) return;
    const items = readAgenda().map((item) => item.id === checkbox.dataset.widgetDone ? { ...item, done: true } : item);
    localStorage.setItem(AGENDA_KEY, JSON.stringify(items));
    try {
      window.EstudiemosAndroid?.postMessage?.(JSON.stringify({ type: "agenda-sync", items }));
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key: AGENDA_KEY } }));
    render();
  }

  function inboxMarkup() {
    const items = readAgenda().filter((item) => item.type.toLowerCase() !== "clase" && !item.done).sort(compareAgenda);
    return `
      <section class="widget-section widget-inbox">
        <div class="section-head"><div><span>INBOX</span><h1>${items.length} ${items.length === 1 ? "pendiente" : "pendientes"}</h1></div><button data-widget-open-inbox>Abrir</button></div>
        <div class="task-list">
          ${items.length ? items.map((item) => `
            <label class="task-row">
              <input type="checkbox" data-widget-done="${escapeHtml(item.id)}" aria-label="Marcar ${escapeHtml(item.title)} como hecha" />
              <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subject || item.type)} · ${item.date ? formatShortDate(item.date) : "Sin fecha"}</small></span>
            </label>`).join("") : '<p class="empty">No tenés tareas pendientes.</p>'}
        </div>
      </section>`;
  }

  function workspaceMarkup() {
    const items = state.workspaceItems.filter((item) => !item.parent_id).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" });
    });
    return `
      <section class="widget-section widget-workspace">
        <div class="section-head"><div><span>ARCHIVOS PERSONALES</span><h1>Mi espacio</h1></div><button data-widget-open-workspace>Abrir</button></div>
        <div class="workspace-widget-list">
          ${state.workspaceLoading ? '<p class="empty">Actualizando tu espacio...</p>' : items.length ? items.map((item) => `
            <button class="workspace-widget-row" type="button" data-widget-workspace-item="${escapeHtml(item.id)}">
              <span class="workspace-widget-icon">${item.kind === "folder" ? folderIcon() : fileIcon()}</span>
              <span><strong>${escapeHtml(item.name)}</strong><small>${item.kind === "folder" ? "Carpeta" : formatFileSize(item.size_bytes)}</small></span>
              <b aria-hidden="true">›</b>
            </button>`).join("") : '<p class="empty">Todavía no hay carpetas ni archivos.</p>'}
        </div>
      </section>`;
  }

  async function loadWorkspaceItems() {
    const account = window.EstudiemosAccount;
    const client = account?.getClient?.();
    const user = account?.getUser?.();
    if (!client || !user) {
      state.workspaceItems = [];
      state.workspaceLoading = false;
      refresh();
      return;
    }
    state.workspaceLoading = true;
    refresh();
    try {
      const result = await client.from("workspace_items")
        .select("id,parent_id,kind,name,mime_type,size_bytes,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (!result.error) state.workspaceItems = result.data || [];
    } catch (_) {
      state.workspaceItems = [];
    } finally {
      lastWorkspaceMarker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || lastWorkspaceMarker;
      state.workspaceLoading = false;
      refresh();
    }
  }

  function calendarMarkup() {
    const items = readAgenda().filter((item) => item.date);
    const byDate = items.reduce((result, item) => {
      if (!result[item.date]) result[item.date] = [];
      result[item.date].push(item);
      return result;
    }, {});
    const first = new Date(state.year, state.month, 1);
    const focus = parseDateValue(state.date) || new Date();
    const start = state.calendarView === "week"
      ? startOfWeek(focus)
      : new Date(state.year, state.month, 1 - ((first.getDay() + 6) % 7));
    const today = dateValue(new Date());
    const days = [];
    const cellCount = state.calendarView === "week" ? 7 : 42;
    for (let index = 0; index < cellCount; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const value = dateValue(date);
      const dayItems = byDate[value] || [];
      const entries = state.calendarView === "week"
        ? `<div class="calendar-day-events">${dayItems.slice(0, 3).map(widgetCalendarEntry).join("")}</div>`
        : "";
      const dayLabel = state.calendarView === "week"
        ? `<span><b>${capitalize(new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).replace(".", ""))}</b>${date.getDate()}</span>`
        : `<span>${date.getDate()}</span>`;
      days.push(`<button class="calendar-day ${state.calendarView === "month" && date.getMonth() !== state.month ? "is-outside" : ""} ${value === today ? "is-today" : ""}" data-widget-date="${value}" aria-label="${formatLongDate(value)}${dayItems.length ? `, ${dayItems.length} anotaciones` : ""}">${dayLabel}${entries}${dayItems.length > (state.calendarView === "week" ? 3 : 0) ? `<small>${state.calendarView === "week" ? `+${dayItems.length - 3}` : dayItems.length}</small>` : ""}</button>`);
    }
    const periodLabel = state.calendarView === "week"
      ? formatWeekRange(focus)
      : capitalize(new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(first));
    return `
      <section class="widget-section widget-calendar" data-view="${state.calendarView}">
        <div class="section-head calendar-title"><div><span>CALENDARIO</span><h1>${periodLabel}</h1></div><div><button data-widget-month="-1" aria-label="Período anterior">‹</button><button data-widget-month="1" aria-label="Período siguiente">›</button></div></div>
        <div class="calendar-view-switch" aria-label="Vista del calendario"><button class="${state.calendarView === "week" ? "is-active" : ""}" data-widget-calendar-view="week">Semana</button><button class="${state.calendarView === "month" ? "is-active" : ""}" data-widget-calendar-view="month">Mes</button></div>
        <div class="weekdays"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
        <div class="calendar-grid">${days.join("")}</div>
      </section>`;
  }

  function pomodoroMarkup() {
    const pomodoro = readPomodoro();
    const total = Math.max(1, Number(pomodoro.config[pomodoro.phase]) * 60 || 1);
    const progress = Math.min(1, Math.max(0, 1 - pomodoro.remaining / total));
    const phase = pomodoro.phase === "break" ? "DESCANSO" : "ESTUDIO";
    const label = pomodoro.phase === "break" ? "Descanso" : `Bloque ${pomodoro.currentBlock} de ${pomodoro.config.blocks}`;
    return `
      <section class="widget-section widget-pomodoro">
        <header class="pomodoro-widget-head"><div><span>TEMPORIZADOR POMODORO</span><h1>${label}</h1></div><b>${phase}</b></header>
        <div class="pomodoro-widget-ring" style="--timer-progress:${(progress * 360).toFixed(1)}deg">
          <div><strong>${formatTimer(pomodoro.remaining)}</strong><small>${pomodoro.running ? "En curso" : "Pausado"}</small></div>
        </div>
        <div class="pomodoro-widget-actions">
          <button type="button" data-widget-pomodoro="reset" aria-label="Reiniciar temporizador" title="Reiniciar">${resetIcon()}</button>
          <button class="is-primary" type="button" data-widget-pomodoro="toggle">${pomodoro.running ? pauseIcon() : playIcon()}<span>${pomodoro.running ? "Pausar" : "Empezar"}</span></button>
          <button type="button" data-widget-open-pomodoro aria-label="Abrir temporizador completo" title="Abrir configuración">${openIcon()}</button>
        </div>
      </section>`;
  }

  function streakMarkup() {
    const streak = readStreak();
    const today = dateValue(new Date());
    const todayMinutes = Number(streak.days[today]) || 0;
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const value = dateValue(date);
      days.push({
        label: new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).slice(0, 1).toUpperCase(),
        minutes: Math.max(0, Number(streak.days[value]) || 0)
      });
    }
    const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
    const maxMinutes = Math.max(60, ...days.map((day) => day.minutes));
    const ceiling = Math.max(60, Math.ceil(maxMinutes / 60) * 60);
    const points = days.map((day, index) => ({
      x: 12 + index * (256 / 6),
      y: 66 - (day.minutes / ceiling) * 52
    }));
    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `M ${points[0].x.toFixed(1)} 66 L ${line.replaceAll(",", " ")} L ${points[points.length - 1].x.toFixed(1)} 66 Z`;
    return `
      <section class="widget-section widget-streak">
        <header class="streak-widget-head">
          <div class="streak-mark">${flameIcon()}</div>
          <div><span>PRESENCIA DE ESTUDIO</span><h1>Racha: ${streak.current} ${streak.current === 1 ? "día" : "días"}</h1></div>
          <div class="streak-widget-metrics" aria-label="Tiempo de estudio">
            <span><small>Hoy</small><strong>${formatStudyTime(todayMinutes)}</strong></span>
            <span><small>Semana</small><strong>${formatStudyTime(totalMinutes)}</strong></span>
          </div>
        </header>
        <p>${todayMinutes >= 25 ? "Completaste tu presencia de hoy." : `Hoy llevás ${todayMinutes}/25 minutos.`}</p>
        <div class="streak-widget-chart" aria-label="${formatStudyTime(totalMinutes)} estudiadas esta semana">
          <svg viewBox="0 0 280 76" role="img">
            <line x1="12" y1="14" x2="268" y2="14"></line><line x1="12" y1="40" x2="268" y2="40"></line><line x1="12" y1="66" x2="268" y2="66"></line>
            <path d="${area}"></path><polyline points="${line}"></polyline>
            ${points.map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${days[index].minutes ? 2.8 : 1.8}"><title>${days[index].minutes} minutos</title></circle>`).join("")}
          </svg>
          <div>${days.map((day) => `<small>${day.label}</small>`).join("")}</div>
        </div>
        <button class="streak-action" data-widget-open-pomodoro>${todayMinutes >= 25 ? "Abrir Pomodoro" : "Estudiar 25 minutos"}</button>
      </section>`;
  }

  function readAgenda() {
    try {
      const value = JSON.parse(localStorage.getItem(AGENDA_KEY) || "[]");
      return Array.isArray(value) ? value.filter((item) => item?.id && item?.title).map((item) => ({
        ...item,
        type: String(item.type || "Tarea"),
        subject: String(item.subject || ""),
        date: String(item.date || ""),
        done: Boolean(item.done),
        createdAt: Number(item.createdAt) || 0
      })) : [];
    } catch (_) {
      return [];
    }
  }

  function readStreak() {
    try {
      const value = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}");
      const days = value.days && typeof value.days === "object" ? value.days : {};
      return { current: calculateCurrentStreak(days), days };
    } catch (_) {
      return { current: 0, days: {} };
    }
  }

  function readPomodoro() {
    let value = {};
    try {
      value = JSON.parse(localStorage.getItem(POMODORO_KEY) || "{}");
    } catch (_) {}
    reconcileDesktopPomodoro(value);
    const config = {
      blocks: Math.max(1, Number(value.config?.blocks) || 1),
      study: Math.max(0, Number(value.config?.study) || 25),
      break: Math.max(0, Number(value.config?.break) || 5)
    };
    const phase = value.phase === "break" ? "break" : "study";
    const running = Boolean(value.running && Number(value.endAt) > Date.now());
    const fallback = config[phase] * 60;
    const remaining = running
      ? Math.max(0, Math.ceil((Number(value.endAt) - Date.now()) / 1000))
      : Math.max(0, Math.ceil(Number(value.remaining ?? fallback)));
    return {
      ...value,
      config,
      phase,
      currentBlock: Math.min(config.blocks, Math.max(1, Number(value.currentBlock) || 1)),
      remaining,
      running,
      endAt: running ? Number(value.endAt) : 0,
      updatedAt: Number(value.updatedAt) || 0
    };
  }

  function updatePomodoro(action) {
    const pomodoro = readPomodoro();
    capturePomodoroStudyProgress(pomodoro);
    flushPomodoroStudyProgress(pomodoro);
    if (action === "reset") {
      pomodoro.running = false;
      pomodoro.endAt = 0;
      pomodoro.studyCreditAt = 0;
      pomodoro.remaining = pomodoro.config[pomodoro.phase] * 60;
    } else if (pomodoro.running) {
      pomodoro.running = false;
      pomodoro.endAt = 0;
      pomodoro.studyCreditAt = 0;
    } else {
      if (pomodoro.remaining <= 0) pomodoro.remaining = pomodoro.config[pomodoro.phase] * 60;
      pomodoro.running = true;
      pomodoro.endAt = Date.now() + pomodoro.remaining * 1000;
      pomodoro.studyCreditAt = pomodoro.phase === "study" ? Date.now() : 0;
    }
    pomodoro.updatedAt = Date.now();
    localStorage.setItem(POMODORO_KEY, JSON.stringify(pomodoro));
    try {
      window.EstudiemosAndroid?.postMessage?.(JSON.stringify({ type: "pomodoro-sync", state: pomodoro }));
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("estudiemos:pomodoro-widget-action", { detail: pomodoro }));
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key: POMODORO_KEY } }));
    render();
  }

  function capturePomodoroStudyProgress(pomodoro) {
    if (!pomodoro.running || pomodoro.phase !== "study") return;
    const now = Date.now();
    const startedAt = Number(pomodoro.studyCreditAt) || Number(pomodoro.updatedAt) || now;
    const cappedNow = pomodoro.endAt ? Math.min(now, Number(pomodoro.endAt)) : now;
    const elapsed = Math.max(0, Math.floor((cappedNow - startedAt) / 1000));
    if (!elapsed) return;
    pomodoro.pendingStudySeconds = Math.max(0, Math.floor(Number(pomodoro.pendingStudySeconds) || 0)) + elapsed;
    pomodoro.studyCreditAt = startedAt + elapsed * 1000;
  }

  function flushPomodoroStudyProgress(pomodoro) {
    const seconds = Math.max(0, Math.floor(Number(pomodoro.pendingStudySeconds) || 0));
    if (!seconds) return;
    pomodoro.pendingStudySeconds = 0;
    let streak = {};
    try { streak = JSON.parse(localStorage.getItem(STREAK_KEY) || "{}"); } catch (_) {}
    streak.days = streak.days && typeof streak.days === "object" ? streak.days : {};
    streak.carrySeconds = streak.carrySeconds && typeof streak.carrySeconds === "object" ? streak.carrySeconds : {};
    const today = dateValue(new Date());
    const totalSeconds = Math.max(0, Number(streak.carrySeconds[today]) || 0) + seconds;
    const minutes = Math.floor(totalSeconds / 60);
    streak.carrySeconds[today] = totalSeconds % 60;
    if (minutes) streak.days[today] = Math.max(0, Number(streak.days[today]) || 0) + minutes;
    streak.version = 2;
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key: STREAK_KEY } }));
  }

  function reconcileDesktopPomodoro(value) {
    if (!value?.running || !Number(value.endAt) || Number(value.endAt) > Date.now()) return;
    const phase = value.phase === "break" ? "break" : "study";
    const config = {
      blocks: Math.max(1, Number(value.config?.blocks) || 1),
      study: Math.max(0, Number(value.config?.study) || 25),
      break: Math.max(0, Number(value.config?.break) || 5)
    };
    capturePomodoroStudyProgress(value);
    flushPomodoroStudyProgress(value);
    if (phase === "study") {
      const today = dateValue(new Date());
      if (value.completedDate !== today) {
        value.completedDate = today;
        value.completedToday = 0;
      }
      value.completedToday = Math.max(0, Number(value.completedToday) || 0) + 1;
      value.phase = "break";
    } else {
      value.phase = "study";
      value.currentBlock = Math.max(1, Number(value.currentBlock) || 1) >= config.blocks
        ? 1
        : Math.max(1, Number(value.currentBlock) || 1) + 1;
    }
    value.config = config;
    value.remaining = config[value.phase] * 60;
    value.running = false;
    value.endAt = 0;
    value.studyCreditAt = 0;
    value.updatedAt = Date.now();
    localStorage.setItem(POMODORO_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("estudiemos:pomodoro-widget-action", { detail: value }));
  }

  function calculateCurrentStreak(days) {
    const today = new Date();
    const todayActive = (Number(days[dateValue(today)]) || 0) >= 25;
    const cursor = new Date(today);
    if (!todayActive) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (current < 730 && (Number(days[dateValue(cursor)]) || 0) >= 25) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return current;
  }

  function formatStudyTime(minutes) {
    const value = Math.max(0, Number(minutes) || 0);
    const roundedMinutes = Math.round(value);
    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;
    if (!hours) return `${remainingMinutes} min`;
    if (!remainingMinutes) return `${hours} h`;
    return `${hours} h ${remainingMinutes} min`;
  }

  function formatFileSize(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    const megabytes = value / (1024 * 1024);
    return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1).replace(".", ",")} MB`;
  }

  function beginRainmeterResize(event) {
    const handle = event.target.closest("[data-widget-resize]");
    if (!handle || !document.documentElement.classList.contains("rainmeter-widget") || !window.RainmeterAPI) return;
    try {
      event.preventDefault();
      event.stopPropagation();
      const scale = Number(window.RainmeterAPI.GetVariable("Scale")) || 1;
      const baseWidth = Number(window.RainmeterAPI.GetVariable("BaseWidth")) || 340;
      const baseHeight = Number(window.RainmeterAPI.GetVariable("BaseHeight")) || 330;
      const startWidth = Number(window.RainmeterAPI.GetVariable("WidgetWidth")) || baseWidth * scale;
      const startHeight = Number(window.RainmeterAPI.GetVariable("WidgetHeight")) || baseHeight * scale;
      const startX = event.clientX;
      const startY = event.clientY;
      let lastWidth = startWidth;
      let lastHeight = startHeight;
      handle.setPointerCapture?.(event.pointerId);

      const move = (pointerEvent) => {
        const width = Math.round(Math.min(720, Math.max(280, startWidth + pointerEvent.clientX - startX)));
        const height = Math.round(Math.min(680, Math.max(230, startHeight + pointerEvent.clientY - startY)));
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        window.RainmeterAPI.Bang(`[!SetVariable WidgetWidth "${width}"][!SetVariable WidgetHeight "${height}"][!WriteKeyValue Variables WidgetWidth "${width}"][!WriteKeyValue Variables WidgetHeight "${height}"][!UpdateMeasure WebView][!UpdateMeter WidgetBounds][!Redraw]`);
      };
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    } catch (_) {}
  }

  function compareAgenda(a, b) {
    if (!a.date && b.date) return -1;
    if (a.date && !b.date) return 1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.createdAt - a.createdAt;
  }

  function isDesktopDevice() {
    return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.EstudiemosAndroid;
  }

  function getInitialView() {
    const value = new URL(window.location.href).searchParams.get("view");
    return ["workspace", "inbox", "calendar", "streak", "pomodoro"].includes(value) ? value : "inbox";
  }

  function openMainApp(search) {
    const destination = new URL(search, window.location.origin).href;
    const appLink = createAppLink(destination);
    if (document.documentElement.classList.contains("rainmeter-widget")) {
      try {
        window.RainmeterAPI?.Bang?.(`["${appLink}"]`);
      } catch (_) {}
      return;
    }
    window.open(appLink, "estudiemos-main", "noopener");
  }

  function createAppLink(destination) {
    const url = new URL(destination);
    const params = new URLSearchParams();
    if (url.searchParams.get("agenda") === "1") {
      params.set("target", "agenda");
      const date = url.searchParams.get("date") || "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) params.set("date", date);
    } else if (url.searchParams.get("pomodoro") === "1") {
      params.set("target", "pomodoro");
    } else if (url.searchParams.get("workspaceItem")) {
      params.set("target", "workspace");
      params.set("item", url.searchParams.get("workspaceItem"));
      params.set("kind", url.searchParams.get("workspaceKind") === "file" ? "file" : "folder");
    } else {
      params.set("target", "home");
    }
    return `web+estudiemos://open?${params.toString()}`;
  }

  function dateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseDateValue(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
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
    return capitalize(`${first} - ${last}`);
  }

  function widgetCalendarEntry(item) {
    const start = item.horaInicio || item.startTime || "";
    const end = item.horaFin || item.endTime || "";
    const time = start ? (end ? `${start}-${end}` : start) : "Todo el día";
    const title = item.subject ? `${item.subject}: ${item.title}` : item.title;
    return `<em><b>${escapeHtml(time)}</b><i>${escapeHtml(title)}</i></em>`;
  }

  function formatTimer(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }

  function formatShortDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return value;
    return `${day}/${month}`;
  }

  function formatLongDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function playIcon() {
    return '<svg viewBox="0 0 24 24"><path d="m9 6 9 6-9 6V6Z"/></svg>';
  }

  function pauseIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>';
  }

  function resetIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 7"/></svg>';
  }

  function openIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M9 5H5v14h14v-4M13 5h6v6M19 5l-9 9"/></svg>';
  }

  function flameIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M13.2 2.2c.4 3-1 4.7-2.4 6.3-1.2-2.2-2.9-3.8-5-5.4.3 3.8-2.4 5.7-2.4 10.3A8.6 8.6 0 0 0 12 22a8.6 8.6 0 0 0 8.6-8.6c0-4.1-2.3-7.8-7.4-11.2ZM12 19.7a4.2 4.2 0 0 1-4.2-4.2c0-1.8.9-3.1 2.1-4.4.2 1.5.9 2.4 1.7 3.2 1.1-1.4 1.8-2.8 1.8-4.7 1.8 1.5 2.8 3.4 2.8 5.9a4.2 4.2 0 0 1-4.2 4.2Z"/></svg>';
  }

  function folderIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M3 7h7l2 2h9v10H3V7Zm0 0V5h7l2 2"/></svg>';
  }

  function fileIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h5M9 12h6M9 16h6"/></svg>';
  }

  function widgetStyles() {
    return `
      :root{color-scheme:dark;--bg:#0c1423;--panel:#111c2e;--line:#263650;--text:#f1f5f9;--muted:#91a0b7;--accent:#8bb5ff;--soft:#192840}
      :root[data-theme="light"]{color-scheme:light;--bg:#edf2f7;--panel:#f9fbfd;--line:#d6dee9;--text:#263244;--muted:#69778b;--accent:#2563a9;--soft:#e5ebf2}
      *{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}html body{display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}
      button,input{font:inherit}.widget-head{min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 94%,transparent)}
      .widget-brand{min-width:0;display:flex;align-items:center;gap:8px}.widget-brand>span{width:29px;height:29px;display:grid;place-items:center;border-radius:8px;background:var(--soft);color:var(--accent);font-size:19px;font-weight:800}.widget-brand strong{font-size:13px;white-space:nowrap}
      nav{display:flex;gap:4px}nav button,.section-head button{width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}nav button:hover,nav button.is-active,.section-head button:hover{background:var(--soft);color:var(--text)}svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}nav button[data-widget-view="streak"] svg,.streak-mark svg,.streak-week svg{fill:currentColor;stroke:none}
      main{min-height:0;overflow:hidden}.widget-section{height:100%;min-height:0;padding:15px 14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.section-head span,.widget-streak>span{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.08em}.section-head h1,.widget-streak h1{margin:3px 0 0;font-size:18px;line-height:1.15}.section-head>button{width:auto;padding:0 9px;color:var(--accent);font-size:11px;font-weight:700}
      .task-list{height:calc(100% - 51px);display:grid;align-content:start;gap:6px;overflow:auto;padding-right:3px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.task-row{min-width:0;display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:8px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:9px;background:var(--panel);cursor:pointer}.task-row:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.task-row input{width:15px;height:15px;margin:0;accent-color:var(--accent)}.task-row>span{min-width:0;display:grid;gap:2px}.task-row strong,.task-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-row strong{font-size:12px}.task-row small{color:var(--muted);font-size:10px}.empty{margin:28px 0;color:var(--muted);font-size:12px;text-align:center}
      .workspace-widget-list{height:calc(100% - 51px);display:grid;align-content:start;gap:6px;overflow:auto;padding-right:3px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.workspace-widget-row{min-width:0;width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--line) 68%,transparent);border-radius:10px;background:var(--panel);color:var(--text);text-align:left;cursor:pointer}.workspace-widget-row:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--soft) 65%,var(--panel))}.workspace-widget-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:var(--soft);color:var(--accent)}.workspace-widget-icon svg{width:18px;height:18px}.workspace-widget-row>span:nth-child(2){min-width:0;display:grid;gap:2px}.workspace-widget-row strong,.workspace-widget-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.workspace-widget-row strong{font-size:12px}.workspace-widget-row small{color:var(--muted);font-size:10px}.workspace-widget-row>b{color:var(--muted);font-size:20px;font-weight:400}
      .calendar-title>div:last-child{display:flex;gap:3px}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.weekdays span{padding-bottom:6px;color:var(--muted);font-size:9px;font-weight:800;text-align:center}.calendar-grid{height:calc(100% - 75px);grid-template-rows:repeat(6,minmax(0,1fr));gap:3px}.calendar-day{position:relative;min-width:0;min-height:0;display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:transparent;color:var(--text);cursor:pointer}.calendar-day:hover{background:var(--soft)}.calendar-day.is-outside{opacity:.32}.calendar-day.is-today{background:var(--accent);color:#07111f;font-weight:800}.calendar-day span{font-size:10px}.calendar-day small{position:absolute;right:3px;bottom:2px;min-width:13px;height:13px;display:grid;place-items:center;border-radius:99px;background:var(--soft);color:var(--accent);font-size:7px}.calendar-day.is-today small{background:#07111f;color:#fff}
      .calendar-view-switch{display:flex;justify-content:flex-end;gap:2px;margin:-7px 0 7px}.calendar-view-switch button{min-height:25px;padding:3px 8px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:9px;font-weight:800;cursor:pointer}.calendar-view-switch button.is-active{background:var(--soft);color:var(--text)}.widget-calendar[data-view="week"] .weekdays{display:none}.widget-calendar[data-view="week"] .calendar-grid{height:calc(100% - 78px);display:flex;flex-direction:column;gap:4px;overflow:auto;padding-right:3px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.widget-calendar[data-view="week"] .calendar-day{width:100%;min-height:36px;display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:7px;padding:5px 7px;border:1px solid color-mix(in srgb,var(--line) 65%,transparent);background:color-mix(in srgb,var(--panel) 72%,transparent);text-align:left}.widget-calendar[data-view="week"] .calendar-day>span{display:flex;align-items:baseline;gap:4px;font-size:10px}.widget-calendar[data-view="week"] .calendar-day>span b{color:var(--muted);font-size:8px;text-transform:uppercase}.widget-calendar[data-view="week"] .calendar-day.is-today{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,var(--panel));color:var(--text)}.calendar-day-events{min-width:0;display:grid;gap:3px}.widget-calendar[data-view="week"] .calendar-day em{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px;color:var(--muted);font-size:9px;font-style:normal;line-height:1.25}.widget-calendar[data-view="week"] .calendar-day em b{color:var(--accent);font-size:8px;font-weight:800;white-space:nowrap}.widget-calendar[data-view="week"] .calendar-day em i{overflow:hidden;color:var(--text);font-style:normal;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.widget-calendar[data-view="week"] .calendar-day small{position:static;min-width:auto;height:auto;background:transparent;color:var(--accent);font-size:8px}.widget-calendar[data-view="week"] .calendar-day.is-today small{background:transparent;color:var(--accent)}
      .widget-pomodoro{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}.pomodoro-widget-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px}.pomodoro-widget-head span{color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.08em}.pomodoro-widget-head h1{margin:2px 0 0;font-size:17px}.pomodoro-widget-head>b{padding:5px 8px;border-radius:7px;background:var(--soft);color:var(--accent);font-size:9px}.pomodoro-widget-ring{--timer-progress:0deg;width:min(54vw,188px);aspect-ratio:1;display:grid;place-items:center;border-radius:50%;background:conic-gradient(var(--accent) var(--timer-progress),var(--line) 0);padding:7px}.pomodoro-widget-ring::before{content:"";grid-area:1/1;width:100%;height:100%;border-radius:50%;background:var(--bg)}.pomodoro-widget-ring>div{z-index:1;grid-area:1/1;display:grid;gap:4px;text-align:center}.pomodoro-widget-ring strong{font-size:clamp(32px,11vw,48px);line-height:1;font-variant-numeric:tabular-nums}.pomodoro-widget-ring small{color:var(--muted);font-size:10px;font-weight:700}.pomodoro-widget-actions{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) 42px;gap:8px}.pomodoro-widget-actions button{min-height:40px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);cursor:pointer}.pomodoro-widget-actions button.is-primary{border-color:transparent;background:var(--accent);color:#07111f;font-size:12px;font-weight:800}.pomodoro-widget-actions svg{width:16px;height:16px}.pomodoro-widget-actions button.is-primary svg{stroke-width:2.2}
      .widget-streak{display:flex;flex-direction:column;justify-content:center}.streak-widget-head{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left}.streak-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:color-mix(in srgb,#f59e0b 14%,var(--panel));color:#f59e0b}.streak-mark svg{width:22px;height:22px}.streak-widget-head>div:nth-child(2){min-width:0;display:grid;gap:1px}.streak-widget-head span{color:var(--muted);font-size:8px;font-weight:800;letter-spacing:.07em}.widget-streak h1{margin:0;font-size:18px}.streak-widget-metrics{min-width:78px;display:grid;gap:3px}.streak-widget-metrics>span{display:grid;grid-template-columns:auto auto;align-items:baseline;justify-content:end;gap:5px}.streak-widget-metrics small{color:var(--muted);font-size:7px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.streak-widget-metrics strong{color:#f6b94e;font-size:11px;white-space:nowrap}.widget-streak>p{margin:7px 0 5px;color:var(--muted);font-size:10px;text-align:left}.streak-widget-chart{min-height:0;margin-top:2px}.streak-widget-chart svg{width:100%;height:70px;display:block;overflow:visible}.streak-widget-chart line{stroke:color-mix(in srgb,var(--line) 55%,transparent);stroke-width:1}.streak-widget-chart path{fill:color-mix(in srgb,var(--accent) 9%,transparent);stroke:none}.streak-widget-chart polyline{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.streak-widget-chart circle{fill:var(--accent);stroke:var(--panel);stroke-width:1.5}.streak-widget-chart>div{display:grid;grid-template-columns:repeat(7,1fr);margin-top:-1px;color:var(--muted);font-size:8px;text-align:center}.streak-action{min-height:32px;margin-top:8px;padding:0 16px;border:0;border-radius:9px;background:var(--accent);color:#07111f;font-size:11px;font-weight:800;cursor:pointer}
      footer{padding:7px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:9px;text-align:center}
      @media(max-width:320px){.widget-brand strong{display:none}.widget-section{padding:12px 10px}.task-row{padding:8px}.section-head h1{font-size:16px}.widget-calendar[data-view="week"] .calendar-day{grid-template-columns:34px minmax(0,1fr) auto;padding-inline:5px}.widget-calendar[data-view="week"] .calendar-day em{gap:4px}}
      @media(max-height:350px){footer{display:none}.widget-section{padding-block:9px}.streak-widget-chart svg{height:62px}.streak-action{margin-top:6px}}
      .widget-connect{position:absolute;right:15px;bottom:13px;min-height:30px;padding:0 11px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--text);font-size:10px;font-weight:700;cursor:pointer}
      .rainmeter-widget body{display:block;padding:5px;background:transparent;app-region:drag;-webkit-app-region:drag}
      .rainmeter-widget .widget-head,.rainmeter-widget body>footer{display:none}
      .rainmeter-widget main{position:relative;height:100%;overflow:hidden;border:1px solid color-mix(in srgb,var(--line) 78%,transparent);border-radius:16px;background:color-mix(in srgb,var(--bg) 97%,transparent);box-shadow:0 14px 36px rgba(2,8,20,.24)}
      .rainmeter-widget button,.rainmeter-widget input,.rainmeter-widget label,.rainmeter-widget .account-panel{app-region:no-drag;-webkit-app-region:no-drag}
      .rainmeter-widget .account-shell{position:fixed;inset:5px;z-index:50;padding:0;border-radius:16px;overflow:auto;app-region:no-drag;-webkit-app-region:no-drag}
      .rainmeter-widget .account-panel{width:100%;max-width:none;min-height:100%;border-radius:16px;padding:16px}
      .rainmeter-widget .account-app-actions,.rainmeter-widget .account-android-widgets,.rainmeter-widget .account-desktop-widgets,.rainmeter-widget .account-privacy{display:none!important}
      .rainmeter-widget .account-intro{display:none}
      .rainmeter-widget .account-head{margin-bottom:9px}
      .rainmeter-widget .account-head h2{font-size:20px}
      .rainmeter-widget .account-form{gap:7px}
      .rainmeter-widget .account-form label{gap:3px;font-size:10px}
      .rainmeter-widget .account-form input{min-height:38px;padding:8px 10px}
      .rainmeter-widget .account-primary,.rainmeter-widget .account-secondary,.rainmeter-widget .account-link{min-height:34px;padding:7px 10px}
      .desktop-widget-locked .widget-head,.desktop-widget-locked body>footer{display:none}.desktop-widget-locked body{grid-template-rows:minmax(0,1fr)}
      .widget-resize-handle{display:none}
      .rainmeter-widget .widget-resize-handle{position:fixed;right:5px;bottom:5px;z-index:45;width:18px;height:18px;display:block;cursor:nwse-resize;opacity:0;touch-action:none;app-region:no-drag;-webkit-app-region:no-drag;transition:opacity .15s ease}
      .rainmeter-widget body:hover .widget-resize-handle{opacity:.7}
      .rainmeter-widget .widget-resize-handle::before,.rainmeter-widget .widget-resize-handle::after{content:"";position:absolute;right:2px;bottom:2px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);border-radius:1px}.rainmeter-widget .widget-resize-handle::before{width:11px;height:11px}.rainmeter-widget .widget-resize-handle::after{width:5px;height:5px}
    `;
  }
})();
