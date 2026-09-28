(function () {
  if (window.EstudiemosReleaseUI) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('../styles/release.css?v=20260928', document.currentScript.src).href;
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
  const aiSelector = '[data-general-ai-open],[data-home-open="assistant"],[data-agenda-assistant]';
  const workspaceWidgetSelector = '[data-account-widget="workspace"],[data-account-desktop-widget="workspace"]';
  function decorate() {
    document.querySelectorAll(aiSelector).forEach(button => {
      if (window.EstudiemosRelease?.enabled('ai')) return;
      const label = 'Trabajar con la IA · Próximamente';
      if (button.title !== label) { button.title = label; button.setAttribute('aria-label', label); }
    });
    document.querySelectorAll(workspaceWidgetSelector).forEach(button => {
      if (window.EstudiemosRelease?.enabled('workspace')) return;
      button.disabled = true;
      if (button.textContent !== 'Mi espacio · Próximamente') button.textContent = 'Mi espacio · Próximamente';
    });
  }
  decorate();
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (!window.EstudiemosRelease?.enabled('ai') && event.target.closest(aiSelector)) {
      event.preventDefault(); event.stopImmediatePropagation(); show('ai');
    }
  }, true);
})();
