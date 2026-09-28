(function (root, factory) {
  const release = factory();
  if (typeof module === 'object' && module.exports) module.exports = release;
  else root.EstudiemosRelease = release;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // A release decision, not a client preference or a subscription entitlement.
  const features = Object.freeze({ workspace: false, ai: false });
  return Object.freeze({ features, enabled: name => features[name] === true });
});
