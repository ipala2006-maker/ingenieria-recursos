(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EstudiemosStudyGoal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_MINUTES = 25, MAX_MINUTES = 720;
  const validMinutes = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_MINUTES;
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00').getTime()) && dateKey(new Date(value + 'T12:00:00')) === value;
  function read(state) {
    const goal = state?.goal;
    return validMinutes(goal?.minutes) && Number.isSafeInteger(goal.updatedAt) && goal.updatedAt > 0
      ? { minutes: goal.minutes, updatedAt: goal.updatedAt, configured: true }
      : { minutes: DEFAULT_MINUTES, updatedAt: 0, configured: false };
  }
  function history(state) {
    const result = {};
    for (const [date, value] of Object.entries(state?.dailyGoals || {})) {
      if (validDate(date) && validMinutes(value?.minutes) && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0) result[date] = { minutes: value.minutes, updatedAt: value.updatedAt };
    }
    return result;
  }
  function forDay(state, date, today = dateKey(new Date())) {
    if (date === today) return read(state).minutes;
    return validMinutes(state?.dailyGoals?.[date]?.minutes) ? state.dailyGoals[date].minutes : DEFAULT_MINUTES;
  }
  function recordDay(state, date) {
    if (!validDate(date)) return;
    const goal = read(state);
    state.dailyGoals ||= {};
    state.dailyGoals[date] = { minutes: goal.minutes, updatedAt: goal.updatedAt };
  }
  function set(state, minutes, today = dateKey(new Date()), now = Date.now()) {
    if (!validMinutes(minutes) || !validDate(today) || !Number.isSafeInteger(now) || now <= 0 || read(state).updatedAt === Number.MAX_SAFE_INTEGER) throw new Error('Invalid study goal');
    state.goal = { minutes, updatedAt: Math.max(Math.trunc(now), read(state).updatedAt + 1) };
    recordDay(state, today);
    return state.goal;
  }
  function active(state, date, today = dateKey(new Date())) {
    return Math.max(0, Number(state?.days?.[date]) || 0) >= forDay(state, date, today);
  }
  function summary(state, now = new Date()) {
    const today = dateKey(now), todayMinutes = Math.max(0, Number(state?.days?.[today]) || 0);
    const todayActive = active(state, today, today), cursor = new Date(today + 'T12:00:00');
    if (!todayActive) cursor.setDate(cursor.getDate() - 1);
    let currentStreak = 0, activeLast7 = 0;
    while (currentStreak < 730 && active(state, dateKey(cursor), today)) { currentStreak++; cursor.setDate(cursor.getDate() - 1); }
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(today + 'T12:00:00'); date.setDate(date.getDate() - offset);
      if (active(state, dateKey(date), today)) activeLast7++;
    }
    return { today, todayMinutes, todayActive, currentStreak, activeLast7, goalMinutes: read(state).minutes };
  }
  function merge(left, right) {
    const a = read(left), b = read(right), winner = a.updatedAt > b.updatedAt ? a : b;
    const dailyGoals = history(right);
    for (const [date, value] of Object.entries(history(left))) {
      if (!dailyGoals[date] || value.updatedAt > dailyGoals[date].updatedAt) dailyGoals[date] = value;
    }
    return { goal: { minutes: winner.minutes, updatedAt: winner.updatedAt }, dailyGoals };
  }
  return Object.freeze({ DEFAULT_MINUTES, MAX_MINUTES, validMinutes, dateKey, validDate, read, history, forDay, recordDay, set, active, summary, merge });
});
