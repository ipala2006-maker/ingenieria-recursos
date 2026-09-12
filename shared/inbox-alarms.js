(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.EstudiemosAlarmRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const repeats = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
  const labels = { none: 'Una vez', daily: 'Todos los días', weekdays: 'Lunes a viernes', weekly: 'Cada semana', monthly: 'Cada mes' };
  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function normalize(value) {
    if (!value || typeof value !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !repeats.includes(value.repeat)) return null;
    const d = new Date(`${value.date}T12:00:00`);
    if (!Number.isFinite(d.getTime()) || dateKey(d) !== value.date || d.getFullYear() < 2020 || d.getFullYear() > 2100) return null;
    return { date: value.date, time: value.time, repeat: value.repeat, windows: value.windows === true };
  }
  // Recurrences use the local wall clock on each device, never 24-hour millisecond steps.
  function occurrence(value, day) {
    const alarm = normalize(value);
    if (!alarm || dateKey(day) < alarm.date) return null;
    const start = new Date(`${alarm.date}T12:00:00`);
    if (alarm.repeat === 'none' && dateKey(day) !== alarm.date) return null;
    if (alarm.repeat === 'weekdays' && [0, 6].includes(day.getDay())) return null;
    if (alarm.repeat === 'weekly' && day.getDay() !== start.getDay()) return null;
    if (alarm.repeat === 'monthly' && day.getDate() !== start.getDate()) return null;
    const [h, m] = alarm.time.split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
  }
  function next(value, after = new Date()) {
    const alarm = normalize(value);
    if (!alarm) return null;
    const first = new Date(`${alarm.date}T12:00:00`);
    let day = new Date(after.getFullYear(), after.getMonth(), after.getDate(), 12);
    if (dateKey(day) < alarm.date) day = first;
    for (let i = 0; i < 370; i++) {
      const at = occurrence(alarm, day);
      if (at && at > after) return at;
      if (alarm.repeat === 'none' && dateKey(day) >= alarm.date) return null;
      day.setDate(day.getDate() + 1);
    }
    return null;
  }
  function due(items, now = new Date(), grace = 10 * 60000) {
    const previous = new Date(now.getTime() - grace);
    return items.filter(item => item && !item.done).flatMap(item => {
      const alarm = normalize(item.alarm);
      const at = next(alarm, previous);
      if (!at || at > now) return [];
      return [{ id: String(item.id), title: String(item.title || 'Tarea').slice(0, 90), at: at.getTime(), key: `${item.id}|${dateKey(at)}|${alarm.time}` }];
    });
  }
  function describe(value) {
    const a = normalize(value);
    if (!a) return 'Sin alarma';
    const [y, m, d] = a.date.split('-');
    return `${d}/${m}/${y} · ${a.time} · ${labels[a.repeat]}`;
  }
  return { normalize, next, due, occurrence, dateKey, describe, repeats, labels };
});
