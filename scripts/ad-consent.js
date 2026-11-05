const googleVendor = 755;
const certifiedCmpIds = new Set([10, 300]); // InMobi Choice and Google Privacy & messaging.
const requiredPurposes = [1, 2, 3, 4, 7, 9, 10];
const flexiblePurposes = new Set([2, 7, 9, 10]);

export function adConsentStatus(data, success, previous = 'unknown') {
  if (success !== true || data?.cmpStatus !== 'loaded' || data.gdprApplies !== true ||
      !certifiedCmpIds.has(data.cmpId)) return 'unknown';
  // Opening settings is not a new choice; wait for the CMP's completed action.
  if (data.eventStatus === 'cmpuishown') return previous;
  if (data.isServiceSpecific !== true || !['tcloaded', 'useractioncomplete'].includes(data.eventStatus) ||
      typeof data.tcString !== 'string' || !/^[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]+)*$/.test(data.tcString)) return 'unknown';
  if (data.vendor?.consents?.[googleVendor] !== true) return 'denied';
  return requiredPurposes.every(purpose => {
    const restriction = data.publisher?.restrictions?.[purpose]?.[googleVendor];
    const consent = data.purpose?.consents?.[purpose] === true;
    const legitimateInterest = flexiblePurposes.has(purpose) &&
      data.vendor?.legitimateInterests?.[googleVendor] === true &&
      data.purpose?.legitimateInterests?.[purpose] === true;
    if (restriction === 1) return consent;
    if (restriction === 2) return legitimateInterest;
    return restriction === undefined && (consent || legitimateInterest);
  }) ? 'granted' : 'denied';
}

export function observeAdConsent(tcf, onChange) {
  let status = 'unknown', listenerId, stopped = false;
  const update = (data, success) => {
    if (Number.isInteger(data?.listenerId)) listenerId = data.listenerId;
    if (stopped) { remove(); return; }
    const next = adConsentStatus(data, success, status);
    if (next !== status) { status = next; onChange(next); }
  };
  function remove() {
    if (listenerId === undefined) return;
    const id = listenerId;
    listenerId = undefined;
    try { tcf('removeEventListener', 2, () => {}, id); } catch (_) {}
  }
  if (typeof tcf === 'function') {
    try { tcf('addEventListener', 2, update); }
    catch (_) { status = 'unknown'; }
  }
  return {
    getStatus: () => status,
    stop() { stopped = true; status = 'unknown'; remove(); }
  };
}

export function observeBrowserAdConsent(onChange, target = window) {
  // InMobi installs a stub first and replaces it when the CMP is ready.
  // Resolve the API for each command so cleanup reaches the live SDK.
  return observeAdConsent((...args) => target.__tcfapi?.(...args), onChange);
}
