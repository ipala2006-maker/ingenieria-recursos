(function () {
  const dialog = document.querySelector('[data-home-customizer]');
  const trigger = document.querySelector('[data-home-customize]');
  if (!dialog || !trigger) return;

  const KEY = 'estudiemos_home_layout';
  const spaces = [
    ['focus', 'Pomodoro', 'Temporizador y sesión'],
    ['progress', 'Tu progreso', 'Racha y estadísticas'],
    ['assistant', 'Organizador IA', 'Chat y acciones inteligentes'],
    ['shortcuts', 'Accesos rápidos', 'Mi espacio, calendario e Inbox'],
    ['workspace', 'Mi espacio', 'Archivos y carpetas'],
    ['calendar', 'Calendario', 'Semana y próximos eventos'],
    ['inbox', 'Inbox', 'Tareas y alarmas']
  ];
  const defaults = {
    density: 'comfortable',
    visible: Object.fromEntries(spaces.map(([key]) => [key, true]))
  };
  const list = dialog.querySelector('[data-home-customizer-spaces]');

  list.innerHTML = spaces.map(([key, label, description]) => `
    <label class="home-customizer__space">
      <span><strong>${label}</strong><small>${description}</small></span>
      <input type="checkbox" value="${key}" aria-label="Mostrar ${label}">
    </label>
  `).join('');

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      const visible = { ...defaults.visible };
      for (const [key] of spaces) if (typeof saved.visible?.[key] === 'boolean') visible[key] = saved.visible[key];
      return { density: saved.density === 'compact' ? 'compact' : 'comfortable', visible };
    } catch (_) {
      return structuredClone(defaults);
    }
  }

  function write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('estudiemos:data-change', { detail: { key: KEY } }));
    window.dispatchEvent(new CustomEvent('estudiemos:home-customized', { detail: value }));
  }

  function apply(value = read()) {
    document.body.dataset.homeDensity = value.density;
    for (const [key] of spaces) {
      document.querySelectorAll(`[data-home-space="${key}"]`).forEach(element => {
        element.classList.toggle('home-space-disabled', !value.visible[key]);
        element.setAttribute('aria-hidden', String(!value.visible[key]));
      });
    }
    const topVisible = ['focus', 'progress', 'assistant'].filter(key => value.visible[key]).length;
    document.body.dataset.homeToolCount = String(topVisible);
  }

  function renderForm(value = read()) {
    list.querySelectorAll('input').forEach(input => { input.checked = value.visible[input.value]; });
    dialog.querySelector(`[name="homeDensity"][value="${value.density}"]`).checked = true;
    protectLastTool();
  }

  function protectLastTool() {
    const enabled = [...list.querySelectorAll('input')].filter(input => input.checked && ['focus', 'progress', 'assistant'].includes(input.value));
    list.querySelectorAll('input').forEach(input => {
      input.disabled = enabled.length === 1 && enabled[0] === input;
    });
  }

  function saveFromForm() {
    const value = read();
    list.querySelectorAll('input').forEach(input => { value.visible[input.value] = input.checked; });
    value.density = dialog.querySelector('[name="homeDensity"]:checked')?.value || 'comfortable';
    write(value);
    apply(value);
    protectLastTool();
  }

  trigger.addEventListener('click', () => {
    renderForm();
    dialog.showModal();
  });
  list.addEventListener('change', saveFromForm);
  dialog.querySelectorAll('[name="homeDensity"]').forEach(input => input.addEventListener('change', saveFromForm));
  dialog.querySelector('[data-home-customizer-reset]').addEventListener('click', () => {
    write(defaults);
    renderForm(defaults);
    apply(defaults);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  window.addEventListener('storage', event => { if (event.key === KEY) apply(); });
  window.addEventListener('estudiemos:cloud-restored', () => apply());
  apply();
})();
