(function () {
  if (window.EstudiemosReleaseUI) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('../styles/release.css?v=20261007-hidden-tools', document.currentScript.src).href;
  document.head.appendChild(style);
  let dialog;
  function show(feature) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'release-dialog';
      dialog.setAttribute('aria-labelledby', 'release-title');
      dialog.innerHTML = '<form method="dialog"><span class="release-badge">Próximamente</span><h2 id="release-title"></h2><p>Estamos preparando esta herramienta para una próxima etapa de Estudiemos.</p><button type="submit" autofocus>Entendido</button></form>';
      document.body.appendChild(dialog);
    }
    dialog.querySelector('h2').textContent = feature === 'workspace' ? 'Mi espacio' : 'Trabajar con la IA';
    if (!dialog.open) dialog.showModal();
  }
  window.EstudiemosReleaseUI = Object.freeze({ show });
  const aiSelector = '[data-general-ai-open],[data-home-open="assistant"],[data-agenda-assistant],[data-home-space="assistant"]';
  const workspaceSelector = '[data-account-widget="workspace"],[data-account-desktop-widget="workspace"],[data-home-space="workspace"],[data-home-shortcut="space"],[data-home-destination="space"],[data-home-view="space"]';
  function decorate() {
    if (!window.EstudiemosRelease) return;
    document.querySelectorAll(aiSelector).forEach(button => {
      button.toggleAttribute('data-release-unavailable', !window.EstudiemosRelease.enabled('ai'));
    });
    document.querySelectorAll(workspaceSelector).forEach(button => {
      button.toggleAttribute('data-release-unavailable', !window.EstudiemosRelease.enabled('workspace'));
    });
  }
  decorate();
  document.querySelector('script[data-release-config]')?.addEventListener('load', decorate);
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (!window.EstudiemosRelease?.enabled('ai') && event.target.closest(aiSelector)) {
      event.preventDefault(); event.stopImmediatePropagation(); show('ai');
    }
  }, true);
})();
