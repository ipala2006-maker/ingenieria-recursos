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
    if (storage.getItem(key) === null) storage.setItem(key, JSON.stringify(parse(storage.getItem(legacyKey))));
  } catch (_) {}
  return {
    key,
    read() {
      try { return parse(storage.getItem(key)); } catch (_) { return {}; }
    },
    write(value) { storage.setItem(key, JSON.stringify(value)); }
  };
});
