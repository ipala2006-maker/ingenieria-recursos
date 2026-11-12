module.exports = function installMockTcf() {
  const listeners = new Map();
  let nextId = 1;
  function notify(listenerId, callback, status) {
    const purposes = Object.fromEntries([1,2,3,4,7,9,10].map(id => [id, status === 'granted']));
    callback({
      listenerId, cmpId: 300, cmpStatus: 'loaded', gdprApplies: true, isServiceSpecific: true,
      eventStatus: 'useractioncomplete', tcString: 'C' + 'A'.repeat(80),
      purpose: {consents: purposes}, vendor: {consents: {755: status === 'granted'}}
    }, status !== 'unknown');
  }
  window.__emitTcf = status => {
    for (const [id, callback] of [...listeners]) notify(id, callback, status);
  };
  window.__tcfapi = (command, version, callback, listenerId) => {
    if (version !== 2) return;
    if (command === 'addEventListener') {
      const id = nextId++;
      listeners.set(id, callback);
      notify(id, callback, window.__state?.consent ?? window.__consent);
    } else if (command === 'removeEventListener') {
      callback(listeners.delete(listenerId));
    }
  };
};
