const test = require('node:test');
const assert = require('node:assert/strict');

function granted() {
  return {
    cmpId: 300, cmpStatus: 'loaded', eventStatus: 'tcloaded', gdprApplies: true, isServiceSpecific: true,
    tcString: 'C' + 'A'.repeat(80), listenerId: 1,
    vendor: {consents: {755: true}, legitimateInterests: {755: true}},
    purpose: {consents: {1: true, 3: true, 4: true}, legitimateInterests: {2: true, 7: true, 9: true, 10: true}}
  };
}

test('only completed consent from a supported TCF CMP can enable ads', async () => {
  const { adConsentStatus: status } = await import('../scripts/ad-consent.js');
  assert.equal(status(granted(), true), 'granted');
  assert.equal(status({...granted(), cmpId: 10}, true), 'granted');
  for (const invalid of [
    null, {cmpId: 5}, {cmpStatus: 'stub'}, {eventStatus: 'cmpuishown'},
    {gdprApplies: false}, {gdprApplies: undefined}, {isServiceSpecific: false}, {tcString: 'x'}
  ]) assert.equal(status(invalid && {...granted(), ...invalid}, true), 'unknown');
  assert.equal(status(granted(), false), 'unknown');
  for (const invalid of [
    {vendor: {consents: {755: false}}},
    {publisher: {restrictions: {1: {755: 0}}}},
    {publisher: {restrictions: {1: {755: 2}}}},
    {publisher: {restrictions: {7: {755: 1}}}},
    {purpose: {consents: {1: true}, legitimateInterests: {3: true, 4: true}}}
  ]) assert.equal(status({...granted(), ...invalid}, true), 'denied');
});

test('TCF updates are idempotent, revoke correctly and clean up the listener', async () => {
  const { observeAdConsent } = await import('../scripts/ad-consent.js');
  let callback, changes = 0, removed;
  const observer = observeAdConsent((command, version, fn, parameter) => {
    assert.equal(version, 2);
    if (command === 'addEventListener') callback = fn;
    if (command === 'removeEventListener') removed = parameter;
  }, () => changes++);
  assert.equal(observer.getStatus(), 'unknown');
  callback(granted(), true);
  callback(granted(), true);
  callback({...granted(), eventStatus: 'cmpuishown'}, true);
  assert.equal(observer.getStatus(), 'granted');
  assert.equal(changes, 1);
  callback({...granted(), vendor: {}, eventStatus: 'useractioncomplete'}, true);
  assert.equal(observer.getStatus(), 'denied');
  assert.equal(changes, 2);
  observer.stop();
  assert.equal(removed, 1);
  callback(granted(), true);
  assert.equal(observer.getStatus(), 'unknown');
  assert.equal(changes, 2);
});
