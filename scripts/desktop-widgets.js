(function () {
  if (window.EstudiemosDesktopWidgets) return;

  const AGENDA_KEY = "bandeja_agenda";
  const STREAK_KEY = "estudiemos_pomodoro_streak";
  const state = {
    view: "inbox",
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    widgetWindow: null,
    refreshTimer: null
  };
  let nativeSyncTimer = null;

  window.EstudiemosDesktopWidgets = {
    available: isDesktopDevice(),
    open
  };

  window.addEventListener("storage", refresh);
  window.addEventListener("estudiemos:data-change", refreshAndSyncNative);
  window.addEventListener("estudiemos:cloud-restored", refreshAndSyncNative);
  window.addEventListener("estudiemos:theme-change", refresh);
  window.addEventListener("load", scheduleNativeWindowsSync, { once: true });
  scheduleNativeWindowsSync();

  async function open(view = "inbox") {
    if (!isDesktopDevice()) return false;
    state.view = ["inbox", "calendar", "streak"].includes(view) ? view : "inbox";

    if (state.widgetWindow && !state.widgetWindow.closed) {
      state.widgetWindow.focus();
      render();
      return true;
    }

    try {
      if ("documentPictureInPicture" in window) {
        state.widgetWindow = await window.documentPictureInPicture.requestWindow({ width: 390, height: 520 });
      } else {
        state.widgetWindow = window.open("", "estudiemos-desktop-widget", "popup=yes,width=390,height=520,resizable=yes");
      }
    } catch (_) {
      state.widgetWindow = null;
      return false;
    }

    if (!state.widgetWindow) return false;
    mount();
    return true;
  }

  function mount() {
    const popup = state.widgetWindow;
    const doc = popup.document;
    doc.open();
    doc.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Widgets · Estudiemos</title>
          <style>${widgetStyles()}</style>
        </head>
        <body>
          <header class="widget-head">
            <div class="widget-brand"><span>∑</span><strong>Estudiemos</strong></div>
            <nav aria-label="Elegir widget">
              ${tabButton("inbox", inboxIcon(), "Inbox")}
              ${tabButton("calendar", calendarIcon(), "Calendario")}
              ${tabButton("streak", flameIcon(), "Racha")}
            </nav>
          </header>
          <main id="widgetContent"></main>
          <footer>Sincronizado con tu cuenta</footer>
        </body>
      </html>`);
    doc.close();

    doc.addEventListener("click", handleWidgetClick);
    doc.addEventListener("change", handleWidgetChange);
    popup.addEventListener("pagehide", cleanup, { once: true });
    popup.addEventListener("beforeunload", cleanup, { once: true });
    state.refreshTimer = window.setInterval(refresh, 5000);
    render();
  }

  function render() {
    const popup = state.widgetWindow;
    if (!popup || popup.closed) return cleanup();
    const doc = popup.document;
    doc.documentElement.dataset.theme = document.documentElement.classList.contains("theme-light") ? "light" : "dark";
    doc.querySelectorAll("[data-widget-view]").forEach((button) => {
      const active = button.dataset.widgetView === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    const content = doc.getElementById("widgetContent");
    if (!content) return;
    if (state.view === "calendar") content.innerHTML = calendarMarkup();
    else if (state.view === "streak") content.innerHTML = streakMarkup();
    else content.innerHTML = inboxMarkup();
  }

  function refresh() {
    if (!state.widgetWindow || state.widgetWindow.closed) return;
    render();
  }

  function refreshAndSyncNative() {
    refresh();
    scheduleNativeWindowsSync();
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
          streak: readStreak()
        }
      });
    } catch (_) {}
  }

  function cleanup() {
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    state.widgetWindow = null;
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
      const next = new Date(state.year, state.month + Number(month.dataset.widgetMonth), 1);
      state.year = next.getFullYear();
      state.month = next.getMonth();
      render();
      return;
    }

    const day = event.target.closest("[data-widget-date]");
    if (day) {
      window.focus();
      window.dispatchEvent(new CustomEvent("estudiemos:open-agenda", { detail: { date: day.dataset.widgetDate } }));
      return;
    }

    if (event.target.closest("[data-widget-open-inbox]")) {
      window.focus();
      window.dispatchEvent(new CustomEvent("estudiemos:open-agenda"));
      return;
    }

    if (event.target.closest("[data-widget-open-pomodoro]")) {
      window.focus();
      document.querySelector("[data-pomodoro-open]")?.click();
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

  function calendarMarkup() {
    const items = readAgenda().filter((item) => item.date);
    const counts = items.reduce((result, item) => {
      result[item.date] = (result[item.date] || 0) + 1;
      return result;
    }, {});
    const first = new Date(state.year, state.month, 1);
    const start = new Date(state.year, state.month, 1 - ((first.getDay() + 6) % 7));
    const today = dateValue(new Date());
    const days = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const value = dateValue(date);
      const count = counts[value] || 0;
      days.push(`<button class="calendar-day ${date.getMonth() !== state.month ? "is-outside" : ""} ${value === today ? "is-today" : ""}" data-widget-date="${value}" aria-label="${formatLongDate(value)}${count ? `, ${count} anotaciones` : ""}"><span>${date.getDate()}</span>${count ? `<small>${count}</small>` : ""}</button>`);
    }
    const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(first);
    return `
      <section class="widget-section widget-calendar">
        <div class="section-head calendar-title"><div><span>CALENDARIO</span><h1>${capitalize(monthLabel)}</h1></div><div><button data-widget-month="-1" aria-label="Mes anterior">‹</button><button data-widget-month="1" aria-label="Mes siguiente">›</button></div></div>
        <div class="weekdays"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
        <div class="calendar-grid">${days.join("")}</div>
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
      days.push({ label: new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date).slice(0, 1).toUpperCase(), active: (Number(streak.days[value]) || 0) >= 25 });
    }
    return `
      <section class="widget-section widget-streak">
        <div class="streak-mark">${flameIcon()}</div>
        <span>PRESENCIA DE ESTUDIO</span>
        <h1>Racha: ${Number(streak.current) || 0} ${Number(streak.current) === 1 ? "día" : "días"}</h1>
        <p>${todayMinutes >= 25 ? "Completaste tu presencia de hoy." : `Hoy llevás ${todayMinutes}/25 minutos.`}</p>
        <div class="streak-week">${days.map((day) => `<div class="${day.active ? "is-active" : ""}"><i>${day.active ? flameIcon() : ""}</i><small>${day.label}</small></div>`).join("")}</div>
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
      return { current: Number(value.current) || 0, days: value.days && typeof value.days === "object" ? value.days : {} };
    } catch (_) {
      return { current: 0, days: {} };
    }
  }

  function compareAgenda(a, b) {
    if (!a.date && b.date) return -1;
    if (a.date && !b.date) return 1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.createdAt - a.createdAt;
  }

  function tabButton(view, icon, label) {
    return `<button data-widget-view="${view}" aria-label="${label}" title="${label}">${icon}</button>`;
  }

  function isDesktopDevice() {
    return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.EstudiemosAndroid;
  }

  function dateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

  function inboxIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>';
  }

  function calendarIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M5 6h14v14H5zM8 3v5M16 3v5M5 10h14"/></svg>';
  }

  function flameIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M13.2 2.2c.4 3-1 4.7-2.4 6.3-1.2-2.2-2.9-3.8-5-5.4.3 3.8-2.4 5.7-2.4 10.3A8.6 8.6 0 0 0 12 22a8.6 8.6 0 0 0 8.6-8.6c0-4.1-2.3-7.8-7.4-11.2ZM12 19.7a4.2 4.2 0 0 1-4.2-4.2c0-1.8.9-3.1 2.1-4.4.2 1.5.9 2.4 1.7 3.2 1.1-1.4 1.8-2.8 1.8-4.7 1.8 1.5 2.8 3.4 2.8 5.9a4.2 4.2 0 0 1-4.2 4.2Z"/></svg>';
  }

  function widgetStyles() {
    return `
      :root{color-scheme:dark;--bg:#0c1423;--panel:#111c2e;--line:#263650;--text:#f1f5f9;--muted:#91a0b7;--accent:#8bb5ff;--soft:#192840}
      :root[data-theme="light"]{color-scheme:light;--bg:#edf2f7;--panel:#f9fbfd;--line:#d6dee9;--text:#263244;--muted:#69778b;--accent:#2563a9;--soft:#e5ebf2}
      *{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,sans-serif}
      button,input{font:inherit}.widget-head{min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 94%,transparent)}
      .widget-brand{min-width:0;display:flex;align-items:center;gap:8px}.widget-brand>span{width:29px;height:29px;display:grid;place-items:center;border-radius:8px;background:var(--soft);color:var(--accent);font-size:19px;font-weight:800}.widget-brand strong{font-size:13px;white-space:nowrap}
      nav{display:flex;gap:4px}nav button,.section-head button{width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}nav button:hover,nav button.is-active,.section-head button:hover{background:var(--soft);color:var(--text)}svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}nav button[data-widget-view="streak"] svg,.streak-mark svg,.streak-week svg{fill:currentColor;stroke:none}
      main{min-height:0;overflow:hidden}.widget-section{height:100%;min-height:0;padding:15px 14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.section-head span,.widget-streak>span{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.08em}.section-head h1,.widget-streak h1{margin:3px 0 0;font-size:18px;line-height:1.15}.section-head>button{width:auto;padding:0 9px;color:var(--accent);font-size:11px;font-weight:700}
      .task-list{height:calc(100% - 51px);display:grid;align-content:start;gap:6px;overflow:auto;padding-right:3px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}.task-row{min-width:0;display:grid;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:8px;padding:9px 10px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:9px;background:var(--panel);cursor:pointer}.task-row:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}.task-row input{width:15px;height:15px;margin:0;accent-color:var(--accent)}.task-row>span{min-width:0;display:grid;gap:2px}.task-row strong,.task-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-row strong{font-size:12px}.task-row small{color:var(--muted);font-size:10px}.empty{margin:28px 0;color:var(--muted);font-size:12px;text-align:center}
      .calendar-title>div:last-child{display:flex;gap:3px}.weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.weekdays span{padding-bottom:6px;color:var(--muted);font-size:9px;font-weight:800;text-align:center}.calendar-grid{height:calc(100% - 75px);grid-template-rows:repeat(6,minmax(0,1fr));gap:3px}.calendar-day{position:relative;min-width:0;min-height:0;display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:transparent;color:var(--text);cursor:pointer}.calendar-day:hover{background:var(--soft)}.calendar-day.is-outside{opacity:.32}.calendar-day.is-today{background:var(--accent);color:#07111f;font-weight:800}.calendar-day span{font-size:10px}.calendar-day small{position:absolute;right:3px;bottom:2px;min-width:13px;height:13px;display:grid;place-items:center;border-radius:99px;background:var(--soft);color:var(--accent);font-size:7px}.calendar-day.is-today small{background:#07111f;color:#fff}
      .widget-streak{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.streak-mark{width:64px;height:64px;display:grid;place-items:center;margin-bottom:11px;border-radius:18px;background:color-mix(in srgb,#f59e0b 14%,var(--panel));color:#f59e0b}.streak-mark svg{width:34px;height:34px}.widget-streak h1{font-size:24px}.widget-streak p{margin:7px 0 18px;color:var(--muted);font-size:12px}.streak-week{width:min(100%,310px);display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.streak-week>div{display:grid;gap:4px;justify-items:center}.streak-week i{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:var(--soft);color:var(--muted)}.streak-week .is-active i{background:color-mix(in srgb,#f59e0b 18%,var(--panel));color:#f59e0b}.streak-week svg{width:16px;height:16px}.streak-week small{color:var(--muted);font-size:9px}.streak-action{min-height:38px;margin-top:20px;padding:0 18px;border:0;border-radius:9px;background:var(--accent);color:#07111f;font-size:12px;font-weight:800;cursor:pointer}
      footer{padding:7px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:9px;text-align:center}
      @media(max-width:320px){.widget-brand strong{display:none}.widget-section{padding:12px 10px}.task-row{padding:8px}.section-head h1{font-size:16px}}
      @media(max-height:350px){footer{display:none}.widget-section{padding-block:9px}.streak-mark{width:46px;height:46px;margin-bottom:7px}.streak-mark svg{width:26px;height:26px}.widget-streak p{margin:5px 0 10px}.streak-action{margin-top:10px}}
    `;
  }
})();
