function showPreferences() {
  window.__tcfapi('displayConsentUi', 2, () => {});
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const link = event.target.closest?.('[data-cmp-preferences]');
  if (!link || location.origin !== 'https://estudiemos.ar') return;
  try {
    let ready = false;
    window.__tcfapi?.('ping', 2, data => { ready = data?.cmpLoaded === true && data.cmpStatus === 'loaded'; });
    if (!ready) return;
    link.closest('.account-shell')?.querySelector('[data-account-close]')?.click();
    showPreferences();
    event.preventDefault();
  } catch (_) {
    // Keep the normal settings-page link usable if the CMP is unavailable.
  }
});

if (document.querySelector('[data-cmp-settings-page]') && new URLSearchParams(location.search).has('preferencias')) {
  let opened = false;
  window.__tcfapi?.('addEventListener', 2, (data, success) => {
    if (opened || !success || data?.cmpStatus !== 'loaded' || !['tcloaded', 'cmpuishown'].includes(data.eventStatus)) return;
    opened = true;
    if (Number.isInteger(data.listenerId)) window.__tcfapi('removeEventListener', 2, () => {}, data.listenerId);
    if (data.eventStatus === 'tcloaded') showPreferences();
  });
}
