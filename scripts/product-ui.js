(function () {
  if (!document.body.classList.contains('workspace-home') || document.querySelector('[data-home-navigation]')) return;
  const page = document.querySelector('.workspace-page');
  const workspace = document.querySelector('.workspace-section');
  const dashboard = document.querySelector('.home-dashboard');
  const calendar = document.querySelector('.dashboard-calendar');
  const inbox = document.querySelector('.dashboard-agenda');
  if (!page || !workspace || !dashboard || !calendar || !inbox) return;
  const mobile = matchMedia('(max-width:620px)');
  const nav = document.createElement('nav');
  nav.className = 'product-home-navigation';
  nav.dataset.homeNavigation = '';
  nav.setAttribute('aria-label', 'Vistas de inicio');
  nav.setAttribute('role', 'tablist');
  const views = [['space','Mi espacio',workspace],['calendar','Calendario',calendar],['inbox','Inbox',inbox]];
  const panelLabels = new Map(views.map(([, , panel]) => [panel, panel.getAttribute('aria-labelledby')]));
  let current = views.some(([key]) => key === history.state?.homeView) ? history.state.homeView : 'space';
  for (const [key,label,panel] of views) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.id = `home-tab-${key}`;
    button.dataset.homeView = key;
    button.setAttribute('role', 'tab');
    if (!panel.id) panel.id = `home-panel-${key}`;
    button.setAttribute('aria-controls', panel.id);
    nav.appendChild(button);
  }
  page.appendChild(nav);
  const render = () => {
    nav.hidden = !mobile.matches;
    workspace.hidden = mobile.matches && current !== 'space';
    dashboard.hidden = mobile.matches && current === 'space';
    calendar.hidden = mobile.matches && current !== 'calendar';
    inbox.hidden = mobile.matches && current !== 'inbox';
    for (const [key,,panel] of views) {
      const button = nav.querySelector(`[data-home-view="${key}"]`);
      button.setAttribute('aria-selected', String(key === current));
      button.tabIndex = key === current ? 0 : -1;
      panel.inert = mobile.matches && key !== current;
      panel.setAttribute('role', mobile.matches ? 'tabpanel' : 'region');
      const label = mobile.matches ? button.id : panelLabels.get(panel);
      if (label) panel.setAttribute('aria-labelledby', label);
      else panel.removeAttribute('aria-labelledby');
    }
  };
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-home-view]');
    if (!button) return;
    if (current === button.dataset.homeView) return;
    current = button.dataset.homeView;
    history.pushState({ ...(history.state || {}), homeView:current }, '', location.href);
    render();
  });
  nav.addEventListener('keydown', event => {
    const direction = {ArrowLeft:-1,ArrowRight:1}[event.key];
    if (direction === undefined && !['Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = views.findIndex(([key]) => key === current);
    current = views[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + direction + 3) % 3][0];
    history.replaceState({ ...(history.state || {}), homeView:current }, '', location.href);
    render();
    nav.querySelector(`[data-home-view="${current}"]`).focus();
  });
  mobile.addEventListener('change', render);
  window.addEventListener('popstate', event => {
    current = views.some(([key]) => key === event.state?.homeView) ? event.state.homeView : 'space';
    render();
  });
  render();
})();
