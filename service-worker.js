const WINDOWS_WIDGET_TAGS = ["estudiemos-inbox", "estudiemos-calendar", "estudiemos-streak"];
const WINDOWS_WIDGET_STATE_URL = new URL("./widgets/runtime-state.json", self.registration.scope).href;
const WINDOWS_WIDGET_CACHE = "estudiemos-windows-widget-data-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await updateAllWindowsWidgets();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "ESTUDIEMOS_WIDGET_DATA") {
    event.waitUntil(saveWindowsWidgetState(event.data.state));
  }
});

self.addEventListener("widgetinstall", (event) => {
  event.waitUntil(renderWindowsWidget(event.widget));
});

self.addEventListener("widgetresume", (event) => {
  event.waitUntil(renderWindowsWidget(event.widget));
});

self.addEventListener("widgetclick", (event) => {
  const destinations = {
    "open-inbox": "./?agenda=1",
    "open-calendar": "./?agenda=1",
    "open-pomodoro": "./?pomodoro=1"
  };
  const destination = destinations[event.action];
  if (destination) event.waitUntil(openAppWindow(new URL(destination, self.registration.scope).href));
});

self.addEventListener("periodicsync", (event) => {
  if (WINDOWS_WIDGET_TAGS.includes(event.tag)) event.waitUntil(updateWindowsWidgetByTag(event.tag));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || new URL("./", self.registration.scope).href;
  event.waitUntil(openAppWindow(destination));
});

async function saveWindowsWidgetState(value) {
  const state = normalizeWindowsWidgetState(value);
  const cache = await caches.open(WINDOWS_WIDGET_CACHE);
  await cache.put(WINDOWS_WIDGET_STATE_URL, new Response(JSON.stringify(state), {
    headers: { "Content-Type": "application/json" }
  }));
  await updateAllWindowsWidgets(state);
}

async function readWindowsWidgetState() {
  try {
    const cache = await caches.open(WINDOWS_WIDGET_CACHE);
    const response = await cache.match(WINDOWS_WIDGET_STATE_URL);
    if (!response) return normalizeWindowsWidgetState(null);
    return normalizeWindowsWidgetState(await response.json());
  } catch (_) {
    return normalizeWindowsWidgetState(null);
  }
}

function normalizeWindowsWidgetState(value) {
  return {
    agenda: Array.isArray(value?.agenda) ? value.agenda.slice(0, 500) : [],
    streak: value?.streak && typeof value.streak === "object" ? value.streak : {}
  };
}

async function updateAllWindowsWidgets(state) {
  if (!("widgets" in self)) return;
  const savedState = state || await readWindowsWidgetState();
  await Promise.all(WINDOWS_WIDGET_TAGS.map((tag) => updateWindowsWidgetByTag(tag, savedState)));
}

async function updateWindowsWidgetByTag(tag, state) {
  if (!("widgets" in self)) return;
  try {
    const widget = await self.widgets.getByTag(tag);
    if (widget) await renderWindowsWidget(widget, state || await readWindowsWidgetState());
  } catch (_) {}
}

async function renderWindowsWidget(widget, state) {
  if (!("widgets" in self) || !widget?.definition) return;
  try {
    const templateUrl = widget.definition.msAcTemplate || widget.definition.ms_ac_template;
    const template = await (await fetch(templateUrl, { cache: "no-cache" })).text();
    const data = JSON.stringify(buildWindowsWidgetData(widget.definition.tag, state || await readWindowsWidgetState()));
    await self.widgets.updateByTag(widget.definition.tag, { template, data });
  } catch (_) {}
}

function buildWindowsWidgetData(tag, state) {
  if (tag === "estudiemos-calendar") return buildCalendarWidgetData(state.agenda);
  if (tag === "estudiemos-streak") return buildStreakWidgetData(state.streak);
  return buildInboxWidgetData(state.agenda);
}

function buildInboxWidgetData(agenda) {
  const tasks = agenda
    .filter((item) => item && item.title && !item.done && String(item.type || "").toLowerCase() !== "clase")
    .sort(compareAgendaItems);
  const data = {
    taskCount: String(tasks.length),
    emptyText: "No tenés tareas pendientes.",
    emptyVisible: tasks.length === 0
  };
  for (let index = 0; index < 3; index += 1) {
    const item = tasks[index];
    data[`task${index + 1}`] = item ? String(item.title) : "";
    data[`task${index + 1}Meta`] = item ? agendaItemMeta(item) : "";
    data[`task${index + 1}Visible`] = Boolean(item);
  }
  return data;
}

function buildCalendarWidgetData(agenda) {
  const today = dateValue(new Date());
  const events = agenda
    .filter((item) => item && item.title && item.date && item.date >= today && !item.done)
    .sort(compareAgendaItems);
  const data = {
    monthLabel: capitalize(new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date())),
    emptyText: "No hay próximas anotaciones.",
    emptyVisible: events.length === 0
  };
  for (let index = 0; index < 3; index += 1) {
    const item = events[index];
    data[`event${index + 1}Date`] = item ? shortDate(item.date) : "";
    data[`event${index + 1}Title`] = item ? String(item.title) : "";
    data[`event${index + 1}Meta`] = item ? agendaItemMeta(item, false) : "";
    data[`event${index + 1}Visible`] = Boolean(item);
  }
  return data;
}

function buildStreakWidgetData(streak) {
  const days = streak?.days && typeof streak.days === "object" ? streak.days : {};
  const current = Math.max(0, Number(streak?.current) || 0);
  const todayMinutes = Math.max(0, Number(days[dateValue(new Date())]) || 0);
  let activeDays = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    if ((Number(days[dateValue(date)]) || 0) >= 25) activeDays += 1;
  }
  return {
    streakDays: `${current} ${current === 1 ? "día" : "días"}`,
    todayProgress: todayMinutes >= 25 ? "Completaste tu presencia de hoy." : `Hoy llevás ${todayMinutes}/25 minutos.`,
    weekSummary: `Últimos 7 días: ${activeDays} ${activeDays === 1 ? "activo" : "activos"}.`
  };
}

function compareAgendaItems(a, b) {
  if (!a.date && b.date) return -1;
  if (a.date && !b.date) return 1;
  if (a.date !== b.date) return String(a.date || "").localeCompare(String(b.date || ""));
  return String(a.horaInicio || a.startTime || "").localeCompare(String(b.horaInicio || b.startTime || ""));
}

function agendaItemMeta(item, includeDate = true) {
  const values = [];
  if (item.subject) values.push(String(item.subject));
  else if (item.type) values.push(String(item.type));
  if (includeDate && item.date) values.push(shortDate(item.date));
  const startTime = item.horaInicio || item.startTime || "";
  const endTime = item.horaFin || item.endTime || "";
  if (startTime) values.push(endTime ? `${startTime}-${endTime}` : startTime);
  return values.join(" · ") || "Sin fecha";
}

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(value) {
  const parts = String(value || "").split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return String(value || "");
  return `${String(parts[2]).padStart(2, "0")}/${String(parts[1]).padStart(2, "0")}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

async function openAppWindow(destination) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if ("navigate" in client) await client.navigate(destination);
    if ("focus" in client) return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(destination);
  return undefined;
}
