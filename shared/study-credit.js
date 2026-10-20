(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EstudiemosStudyCredit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const count = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  const timestamp = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 8640000000000000 ? Number(value) : 0;
  const dateKey = value => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  function split(days, start, seconds) {
    // Use local midnights, including DST days, rather than the day of the next app visit.
    while (seconds > 0) {
      const next = new Date(start); next.setHours(24, 0, 0, 0);
      const amount = Math.min(seconds, Math.max(1, Math.ceil((next.getTime() - start) / 1000)));
      const date = dateKey(start);
      days[date] = (days[date] || 0) + amount;
      seconds -= amount; start += amount * 1000;
    }
  }
  function pending(timer, now) {
    const days = {};
    for (const [date, value] of Object.entries(timer.pendingStudyDays || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && dateKey(new Date(date + 'T12:00:00').getTime()) === date && count(value)) days[date] = count(value);
    }
    const total = Object.values(days).reduce((sum, value) => sum + value, 0);
    const legacy = Math.min(86400, Math.max(0, count(timer.pendingStudySeconds) - total));
    // Old versions stored only a total. Anchor it to when it was earned, not to today.
    if (legacy) {
      const end = timestamp(timer.studyCreditAt) || timestamp(timer.updatedAt);
      if (end) split(days, end - legacy * 1000, legacy);
    }
    timer.pendingStudyDays = days;
    timer.pendingStudySeconds = Object.values(days).reduce((sum, value) => sum + value, 0);
    return days;
  }
  function capture(timer, now = Date.now()) {
    const days = pending(timer, now);
    if (!timer.running || timer.phase !== 'study') return 0;
    const end = timestamp(timer.endAt);
    if (!end) return 0;
    const duration = Math.min(59, Math.max(0, Number(timer.config?.study) || 0)) * 60000;
    const start = Math.max(timestamp(timer.studyCreditAt) || timestamp(timer.updatedAt) || now, end - duration);
    const seconds = Math.max(0, Math.floor((Math.min(now, end) - start) / 1000));
    if (!seconds) return 0;
    split(days, start, seconds);
    timer.pendingStudySeconds += seconds;
    timer.studyCreditAt = start + seconds * 1000;
    return seconds;
  }
  function take(timer, now = Date.now()) {
    const days = pending(timer, now);
    timer.pendingStudyDays = {};
    timer.pendingStudySeconds = 0;
    return days;
  }
  return Object.freeze({ dateKey, capture, take });
});
