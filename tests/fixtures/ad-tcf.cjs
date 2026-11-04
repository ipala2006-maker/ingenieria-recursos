module.exports = function installMockTcf() {
  let subscriber;
  window.__emitTcf = status => {
    const purposes = Object.fromEntries([1,2,3,4,7,9,10].map(id => [id, status === 'granted']));
    subscriber?.({
      listenerId: 1, cmpId: 300, cmpStatus: 'loaded', gdprApplies: true, isServiceSpecific: true,
      eventStatus: 'useractioncomplete', tcString: 'C' + 'A'.repeat(80),
      purpose: {consents: purposes}, vendor: {consents: {755: status === 'granted'}}
    }, status !== 'unknown');
  };
  window.__tcfapi = (command, version, callback) => {
    if (version !== 2) return;
    if (command === 'addEventListener') {
      subscriber = callback;
      window.__emitTcf(window.__state?.consent ?? window.__consent);
    } else if (command === 'removeEventListener') {
      subscriber = undefined;
    }
  };
};
