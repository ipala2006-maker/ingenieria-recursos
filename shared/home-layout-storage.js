(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.EstudiemosHomeLayout = factory(root.localStorage);
})(typeof window === 'object' ? window : globalThis, function (storage) {
  const key = 'estudiemos_home_layout_local';
  const legacyKey = 'estudiemos_home_layout';
  function parse(raw) {
    try {
      const value = JSON.parse(raw || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  // Snapshot this installation's old layout before account sync can restore a remote one.
  try {
    if (storage.getItem(key) === null) {
      const legacy = storage.getItem(legacyKey);
      const streak = parse(storage.getItem('estudiemos_pomodoro_streak'));
      const used = Object.keys(streak.days || {}).length > 0 || Number(streak.goal?.updatedAt) > 0
        || ['bandeja_agenda', 'bandeja_horarios'].some(name => { try { return JSON.parse(storage.getItem(name) || '[]').length > 0; } catch (_) { return true; } });
      const initial = legacy !== null || used ? parse(legacy) : {
        version: 5, preset: 'light',
        visible: {focus:false, progress:false, assistant:false, shortcuts:false, workspace:false, classes:false, calendar:true, inbox:true}
      };
      storage.setItem(key, JSON.stringify(initial));
    }
  } catch (_) {}
  return {
    key,
    read() {
      try { return parse(storage.getItem(key)); } catch (_) { return {}; }
    },
    write(value) { storage.setItem(key, JSON.stringify(value)); }
  };
});
