(function () {
  if (!document.body.classList.contains('workspace-home') || document.querySelector('[data-home-navigation]')) return;
  const page = document.querySelector('.workspace-page');
  const panels = page?.querySelector('.home-panels');
  const layout = panels?.querySelector('.home-layout');
  const workspace = document.querySelector('.workspace-section');
  const dashboard = document.querySelector('.home-dashboard');
  const calendar = document.querySelector('.dashboard-calendar');
  const inbox = document.querySelector('.dashboard-agenda');
  const overview = document.querySelector('[data-study-home]');
  if (!panels || !layout || !overview || !workspace || !dashboard || !calendar || !inbox) return;
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
  const views = [['overview','Inicio',overview],['space','Mi espacio',workspace],['calendar','Calendario',calendar],['inbox','Inbox',inbox]];
  const panelLabels = new Map(views.map(([, , panel]) => [panel, panel.getAttribute('aria-labelledby')]));
  let current = views.some(([key]) => key === history.state?.homeView) ? history.state.homeView : views[0][0];
  let navigationAnimation = null;
  const isVisible = key => {
    if (key === 'overview') return true;
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
    if (key!=='overview'&&!panel.id) panel.id = `home-panel-${key}`;
    button.setAttribute('aria-controls', key==='overview'?panels.id:panel.id);
    nav.appendChild(button);
  }
  page.appendChild(nav);
  const render = () => {
    if (!isVisible(current)) {
      current='overview';
      if(history.state?.homeView)history.replaceState({...history.state,homeView:current},'');
    }
    if(mobile.matches && history.state?.estudiemosUi==='home-session' && document.querySelector('.study-session-dialog[open]')) current='overview';
    const compact=mobile.matches, stacked=compact&&current==='overview';
    const show = key => !compact || stacked && isVisible(key) || current===key;
    nav.hidden = !compact;
    panels.toggleAttribute('data-stacked',stacked);
    if(stacked){panels.setAttribute('role','tabpanel');panels.setAttribute('aria-labelledby','home-tab-overview');}
    else{panels.removeAttribute('role');panels.removeAttribute('aria-labelledby');}
    overview.hidden = !show('overview');
    workspace.hidden = !show('space');
    calendar.hidden = !show('calendar');
    inbox.hidden = !show('inbox');
    dashboard.hidden = calendar.hidden&&inbox.hidden;
    layout.hidden = dashboard.hidden&&workspace.hidden;
    for (const [key,,panel] of views) {
      const button = nav.querySelector(`[data-home-view="${key}"]`);
      button.hidden = !isVisible(key);
      button.setAttribute('aria-selected', String(key === current));
      button.tabIndex = key === current ? 0 : -1;
      panel.inert = !show(key);
      const tabPanel=compact&&!stacked&&key!=='overview';
      panel.setAttribute('role', tabPanel ? 'tabpanel' : 'region');
      const label = tabPanel ? button.id : panelLabels.get(panel);
      if (label) panel.setAttribute('aria-labelledby', label);
      else panel.removeAttribute('aria-labelledby');
    }
    window.dispatchEvent(new CustomEvent('estudiemos:home-view', { detail: { view: current, mobile: mobile.matches } }));
  };
  function activate(key, replace = false, animate = true) {
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
    if (animate && mobile.matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const surface=key==='overview'?panels:view[2];
      navigationAnimation = surface.animate([{opacity:.65,translate:'0 4px'},{opacity:1,translate:'0 0'}], {duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    return true;
  }
  window.addEventListener('estudiemos:home-navigate', event => {
    const view = views.find(([key]) => key === event.detail?.view);
    if (!view || !isVisible(view[0])) return;
    if (mobile.matches) activate(view[0], event.detail?.replace === true, event.detail?.animate !== false);
    else view[2].scrollIntoView({ behavior: event.detail?.replace || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'nearest' });
    view[2].setAttribute('tabindex','-1');
    view[2].focus({ preventScroll:true });
  });
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-home-view]');
    if (button) activate(button.dataset.homeView);
  });
  document.querySelector('.topbar .brand')?.addEventListener('click',event=>{
    if(!mobile.matches||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();activate('overview');panels.scrollTop=0;
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
