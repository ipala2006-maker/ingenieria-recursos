(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EstudiemosTimetableRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'bandeja_horarios', MAX_ITEMS = 100, MAX_INTERVAL = 999;
  const COLORS = ['blue', 'teal', 'violet', 'rose', 'amber'];
  const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    const id = clean(value.id, 100), title = clean(value.title, 90);
    const days = [...new Set(Array.isArray(value.days) ? value.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!id || !title || !days.length || !time(value.start) || !time(value.end) || value.end <= value.start) return null;
    const startDate = value.startDate || '', endDate = value.endDate || '';
    if ((startDate && !date(startDate)) || (endDate && !date(endDate)) || (startDate && endDate && endDate < startDate)) return null;
    let recurrence;
    if (value.recurrence != null) {
      const r = value.recurrence;
      if (!r || !['days','weeks','months','years'].includes(r.unit) || !Number.isInteger(r.interval) || r.interval < 1 || r.interval > MAX_INTERVAL || !startDate) return null;
      recurrence = {unit:r.unit, interval:r.interval};
    }
    return { id, title, days:recurrence && recurrence.unit !== 'weeks' ? [1,2,3,4,5,6,0] : days, start: value.start, end: value.end, place: clean(value.place, 90), color: COLORS.includes(value.color) ? value.color : 'blue', ...(startDate ? {startDate} : {}), ...(endDate ? {endDate} : {}), ...(recurrence ? {recurrence} : {}) };
  }
  function list(value) {
    if (!Array.isArray(value)) return [];
    const result = new Map();
    for (const item of value.slice(0, MAX_ITEMS)) {
      const entry = normalize(item);
      if (entry) result.set(entry.id, entry);
    }
    return [...result.values()];
  }
  function forDay(items, day) {
    return list(items).filter(item => item.days.includes(day)).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));
  }
  function overlaps(items, candidate) {
    const entry = normalize(candidate);
    return entry ? list(items).filter(item => {
      if (item.id === entry.id || !item.days.some(day => entry.days.includes(day)) || entry.start >= item.end || entry.end <= item.start || entry.endDate && item.startDate && entry.endDate < item.startDate || item.endDate && entry.startDate && item.endDate < entry.startDate) return false;
      if (!entry.recurrence && !item.recurrence) return true;
      const from = [entry.startDate,item.startDate].filter(Boolean).sort().at(-1);
      const end = date(from); end.setDate(end.getDate()+61);
      const dates = new Set(occurrences([entry],from,dateKey(end)).map(event=>event.date));
      return occurrences([item],from,dateKey(end)).some(event=>dates.has(event.date));
    }) : [];
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(value + 'T12:00:00');
    return Number.isFinite(parsed.getTime()) && dateKey(parsed) === value ? parsed : null;
  }
  const dateKey = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  const ordinal = day => Date.UTC(day.getFullYear(),day.getMonth(),day.getDate()) / 86400000;
  function repeatsOn(item, day) {
    const key = dateKey(day);
    if (item.startDate && key < item.startDate || item.endDate && key > item.endDate || !item.days.includes(day.getDay())) return false;
    if (!item.recurrence) return true;
    const anchor = date(item.startDate), {unit,interval} = item.recurrence;
    if (unit === 'days') return (ordinal(day)-ordinal(anchor)) % interval === 0;
    if (unit === 'weeks') {
      const week = value => ordinal(value)-(value.getDay()+6)%7;
      return ((week(day)-week(anchor))/7) % interval === 0;
    }
    if (unit === 'months') return day.getDate() === anchor.getDate() && ((day.getFullYear()-anchor.getFullYear())*12+day.getMonth()-anchor.getMonth()) % interval === 0;
    return day.getMonth() === anchor.getMonth() && day.getDate() === anchor.getDate() && (day.getFullYear()-anchor.getFullYear()) % interval === 0;
  }
  function describe(item) {
    if (!item?.recurrence) return item?.days?.length === 7 ? 'Cada día' : 'Cada semana';
    const {unit,interval} = item.recurrence;
    const names = {days:['día','días'],weeks:['semana','semanas'],months:['mes','meses'],years:['año','años']};
    return interval === 1 ? 'Cada '+names[unit][0] : 'Cada '+interval+' '+names[unit][1];
  }
  function occurrences(items, from, until = from) {
    const start = date(from), end = date(until);
    if (!start || !end || start > end) return [];
    const schedules = list(items), result = [];
    const byDay = Array.from({length:7}, (_, day) => forDay(schedules, day));
    // Calendar projections are bounded, read-only views, never persisted tasks.
    for (let index = 0, day = new Date(start); day <= end && index < 62; index++, day.setDate(day.getDate()+1)) {
      const key = dateKey(day);
      for (const item of byDay[day.getDay()].filter(item => repeatsOn(item,day))) result.push({
        id: `weekly:${item.id}:${key}`, scheduleId: item.id, title: item.title,
        date: key, horaInicio: item.start, horaFin: item.end, type: item.recurrence ? describe(item) : 'Horario fijo',
        color: item.color, note: item.place, done: false,
        ...(item.startDate ? {startDate:item.startDate} : {}), ...(item.endDate ? {endDate:item.endDate} : {})
      });
    }
    return result;
  }
  function eventClass(item) {
    return COLORS.includes(item?.color) ? `${item.scheduleId ? 'is-recurring' : 'is-colored'} timetable-color--${item.color}` : '';
  }
  function read(storage) { try { return list(JSON.parse(storage.getItem(KEY) || '[]')); } catch (_) { return []; } }
  return Object.freeze({ KEY, MAX_ITEMS, MAX_INTERVAL, COLORS, time, date, dateKey, normalize, list, forDay, overlaps, occurrences, repeatsOn, describe, eventClass, read });
});
