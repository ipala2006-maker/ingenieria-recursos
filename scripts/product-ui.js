(function () {
  if (!document.body.classList.contains('workspace-home') || document.querySelector('[data-home-navigation]')) return;
  const page = document.querySelector('.workspace-page');
  const workspace = document.querySelector('.workspace-section');
  const dashboard = document.querySelector('.home-dashboard');
  const calendar = document.querySelector('.dashboard-calendar');
  const inbox = document.querySelector('.dashboard-agenda');
  const overview = document.querySelector('[data-study-home]');
  if (!page || !workspace || !dashboard || !calendar || !inbox) return;
  const mobile = matchMedia('(max-width:700px), (min-width:701px) and (max-width:900px) and (max-height:899px)');
  const topbar = document.querySelector('.topbar');
  let topbarFrame=0;
  if(topbar) new ResizeObserver(() => {
    cancelAnimationFrame(topbarFrame);
    topbarFrame=requestAnimationFrame(()=>document.documentElement.style.setProperty('--home-topbar-height',`${topbar.getBoundingClientRect().height}px`));
  }).observe(topbar);
  const nav = document.createElement('nav');
  nav.className = 'product-home-navigation';
  nav.dataset.homeNavigation = '';
  nav.setAttribute('aria-label', 'Vistas de inicio');
  nav.setAttribute('role', 'tablist');
  const views = [...(overview ? [['overview','Inicio',overview]] : []), ['space','Mi espacio',workspace],['calendar','Calendario',calendar],['inbox','Inbox',inbox]];
  const panelLabels = new Map(views.map(([, , panel]) => [panel, panel.getAttribute('aria-labelledby')]));
  let current = views.some(([key]) => key === history.state?.homeView) ? history.state.homeView : views[0][0];
  let navigationAnimation = null;
  const isVisible = key => {
    if (key === 'overview') {
      if (window.EstudiemosOnboarding?.isActive() || document.body.classList.contains('home-layout-editing')) return true;
      const value=window.EstudiemosHomeLayout?.read()||{};
      return ['focus','progress','classes'].some(tool=>value.visible?.[tool]===true || (tool!=='classes'&&value.visible?.[tool]!==false)) || value.visible?.inbox===false;
    }
    const mapped = key === 'space' ? 'workspace' : key;
    if (mapped === 'workspace' && !window.EstudiemosRelease?.enabled('driveWorkspace')) return false;
    try {
      const value = window.EstudiemosHomeLayout?.read() || {};
      return value.visible?.[mapped] !== false;
    } catch (_) { return true; }
  };
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
    if (!isVisible(current)) current = isVisible('inbox') ? 'inbox' : 'overview';
    if(mobile.matches && history.state?.estudiemosUi==='home-session' && document.querySelector('.study-session-dialog[open]')) current='overview';
    nav.hidden = !mobile.matches;
    if (overview) overview.hidden = mobile.matches && current !== 'overview';
    document.querySelector('.home-layout').hidden = mobile.matches && current === 'overview';
    workspace.hidden = mobile.matches && current !== 'space';
    dashboard.hidden = mobile.matches && !['calendar','inbox'].includes(current);
    calendar.hidden = mobile.matches && current !== 'calendar';
    inbox.hidden = mobile.matches && current !== 'inbox';
    for (const [key,,panel] of views) {
      const button = nav.querySelector(`[data-home-view="${key}"]`);
      button.hidden = !isVisible(key);
      button.setAttribute('aria-selected', String(key === current));
      button.tabIndex = key === current ? 0 : -1;
      panel.inert = mobile.matches && key !== current;
      panel.setAttribute('role', mobile.matches ? 'tabpanel' : 'region');
      const label = mobile.matches ? button.id : panelLabels.get(panel);
      if (label) panel.setAttribute('aria-labelledby', label);
      else panel.removeAttribute('aria-labelledby');
    }
    window.dispatchEvent(new CustomEvent('estudiemos:home-view', { detail: { view: current, mobile: mobile.matches } }));
  };
  function activate(key, replace = false) {
    const view = views.find(([name]) => name === key);
    if (!view || !isVisible(key)) return false;
    if (current === key) return true;
    navigationAnimation?.cancel();
    navigationAnimation = null;
    current = key;
    const nextState={...(history.state || {}),homeView:current};
    if(nextState.estudiemosUi==='home-session')delete nextState.estudiemosUi;
    history[replace ? 'replaceState' : 'pushState'](nextState, '', location.href);
    render();
    if (mobile.matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigationAnimation = view[2].animate([{opacity:.65,translate:'0 4px'},{opacity:1,translate:'0 0'}], {duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    return true;
  }
  window.addEventListener('estudiemos:home-navigate', event => {
    const view = views.find(([key]) => key === event.detail?.view);
    if (!view || !isVisible(view[0])) return;
    if (mobile.matches) activate(view[0], event.detail?.replace === true);
    else view[2].scrollIntoView({ behavior: event.detail?.replace || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest' });
    view[2].setAttribute('tabindex','-1');
    view[2].focus({ preventScroll:true });
  });
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-home-view]');
    if (button) activate(button.dataset.homeView);
  });
  nav.addEventListener('keydown', event => {
    const direction = {ArrowLeft:-1,ArrowRight:1}[event.key];
    if (direction === undefined && !['Home','End'].includes(event.key)) return;
    event.preventDefault();
    const visibleViews = views.filter(([key]) => isVisible(key));
    const index = visibleViews.findIndex(([key]) => key === current);
    activate(visibleViews[event.key === 'Home' ? 0 : event.key === 'End' ? visibleViews.length - 1 : (index + direction + visibleViews.length) % visibleViews.length][0], true);
    nav.querySelector(`[data-home-view="${current}"]`).focus();
  });
  mobile.addEventListener('change', render);
  window.addEventListener('estudiemos:home-customized', render);
  window.addEventListener('estudiemos:home-editing', render);
  window.addEventListener('estudiemos:onboarding-finished', render);
  window.addEventListener('storage', event => {
    if (event.key === window.EstudiemosHomeLayout?.key) render();
  });
  window.addEventListener('estudiemos:cloud-restored', render);
  window.addEventListener('popstate', event => {
    navigationAnimation?.cancel();
    navigationAnimation = null;
    current = views.some(([key]) => key === event.state?.homeView) ? event.state.homeView : views[0][0];
    render();
  });
  render();
})();
