(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EstudiemosTimetableRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'bandeja_horarios', MAX_ITEMS = 100;
  const COLORS = ['blue', 'teal', 'violet', 'rose', 'amber'];
  const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    const id = clean(value.id, 100), title = clean(value.title, 90);
    const days = [...new Set(Array.isArray(value.days) ? value.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!id || !title || !days.length || !time(value.start) || !time(value.end) || value.end <= value.start) return null;
    return { id, title, days, start: value.start, end: value.end, place: clean(value.place, 90), color: COLORS.includes(value.color) ? value.color : 'blue' };
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
    return entry ? list(items).filter(item => item.id !== entry.id && item.days.some(day => entry.days.includes(day)) && entry.start < item.end && entry.end > item.start) : [];
  }
  return Object.freeze({ KEY, MAX_ITEMS, COLORS, time, normalize, list, forDay, overlaps });
});
