(function () {
  if (window.EstudiemosTimetable || !window.EstudiemosTimetableRules) return;
  const rules = window.EstudiemosTimetableRules;
  const root = new URL('../', document.currentScript.src);
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('styles/timetable.css?v=20261018', root); document.head.appendChild(style);
  // Lucide: calendar-days, x, plus, pencil, trash-2, check.
  const paths = { calendar: '<path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>', close: '<path d="m18 6-12 12M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>', check: '<path d="m5 12 4 4L19 6"/>' };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const days = [[1, 'Lun', 'Lunes'], [2, 'Mar', 'Martes'], [3, 'Mié', 'Miércoles'], [4, 'Jue', 'Jueves'], [5, 'Vie', 'Viernes'], [6, 'Sáb', 'Sábado'], [0, 'Dom', 'Domingo']];
  const colorNames = ['Azul', 'Turquesa', 'Violeta', 'Rosa', 'Amarillo'];
  let selectedDay = new Date().getDay(), editingId = '', returnFocus = null, owner = identity();
  const dialog = document.createElement('dialog');
  dialog.className = 'timetable'; dialog.dataset.timetable = ''; dialog.setAttribute('aria-labelledby', 'timetableTitle');
  dialog.innerHTML = `<header class="timetable__head"><div><p>HORARIOS FIJOS</p><h2 id="timetableTitle">Mi semana</h2></div><button type="button" data-timetable-close aria-label="Cerrar Mi semana" title="Cerrar Mi semana">${icon('close')}</button></header>
    <div class="timetable__body"><section class="timetable__editor" aria-labelledby="timetableEditorTitle">
    <form data-timetable-form><h3 id="timetableEditorTitle">Agregar horario</h3><input type="hidden" name="color" value="blue">
    <label>Materia o actividad<input name="title" maxlength="90" required autocomplete="off" placeholder="Ej.: Análisis matemático"></label>
    <fieldset><legend>Días de la semana</legend><div class="timetable__days">${days.map(([day, short, label]) => `<label title="${label}"><input type="checkbox" name="day" value="${day}" aria-label="${label}"><span>${short}</span></label>`).join('')}</div></fieldset>
    <div class="timetable__times"><label>Desde<input name="start" type="time" required></label><label>Hasta<input name="end" type="time" required></label></div>
    <label>Lugar <small>(opcional)</small><input name="place" maxlength="90" autocomplete="off" placeholder="Aula, edificio o enlace"></label>
    <fieldset><legend>Color</legend><div class="timetable__colors">${rules.COLORS.map((color, index) => `<button type="button" data-timetable-color="${color}" class="timetable-color--${color}" aria-label="${colorNames[index]}" title="${colorNames[index]}" aria-pressed="${index === 0}"><span></span></button>`).join('')}</div></fieldset>
    <p class="timetable__status" data-timetable-status role="status" aria-live="polite"></p>
    <div class="timetable__save"><button type="submit" class="timetable__primary">${icon('plus')}<span data-timetable-save-label>Agregar horario</span></button><button type="button" data-timetable-cancel hidden>Cancelar</button></div>
    </form></section><section class="timetable__week" aria-label="Semana habitual"><div class="timetable__week-head"><span data-timetable-count></span><button type="button" data-timetable-new title="Agregar horario">${icon('plus')}<span>Agregar</span></button></div><div class="timetable__day-tabs" role="tablist" aria-label="Día de la semana">${days.map(([day, short, name]) => `<button type="button" role="tab" data-timetable-day="${day}" aria-controls="timetableDay${day}" aria-label="${name}">${short}</button>`).join('')}</div><div class="timetable__columns" data-timetable-week></div></section></div>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[data-timetable-status]');
  const nav = document.querySelector('.topbar__nav');
  if (nav && !nav.querySelector('[data-timetable-open]')) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'topbar__link topbar-icon-btn'; button.dataset.timetableOpen = ''; button.title = 'Mi semana'; button.setAttribute('aria-label', 'Mi semana'); button.innerHTML = icon('calendar'); nav.appendChild(button);
  }
  window.EstudiemosTimetable = Object.freeze({ open });
  function identity() { return window.EstudiemosAccount?.getUser()?.id || 'guest'; }
  function read() { try { return rules.list(JSON.parse(localStorage.getItem(rules.KEY) || '[]')); } catch (_) { return []; } }
  function write(items) {
    localStorage.setItem(rules.KEY, JSON.stringify(rules.list(items)));
    window.dispatchEvent(new CustomEvent('estudiemos:data-change', { detail: { key: rules.KEY } }));
  }
  function open() {
    if (dialog.open) return;
    returnFocus = document.activeElement; owner = identity(); reset(); render(); dialog.showModal(); dialog.querySelector('[data-timetable-close]').focus();
  }
  function reset() {
    editingId = ''; form.reset(); form.elements.start.value = '08:00'; form.elements.end.value = '10:00';
    form.querySelector(`input[name="day"][value="${selectedDay}"]`).checked = true;
    dialog.querySelector('#timetableEditorTitle').textContent = 'Agregar horario';
    dialog.querySelector('[data-timetable-save-label]').textContent = 'Agregar horario';
    dialog.querySelector('[data-timetable-cancel]').hidden = true; status.textContent = ''; chooseColor('blue');
  }
  function chooseColor(color) { form.elements.color.value = color; form.querySelectorAll('[data-timetable-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.timetableColor === color))); }
  function render() {
    const items = read();
    dialog.querySelector('[data-timetable-count]').textContent = `${items.length} ${items.length === 1 ? 'horario fijo' : 'horarios fijos'}`;
    dialog.querySelectorAll('[data-timetable-day]').forEach(button => { const selected = Number(button.dataset.timetableDay) === selectedDay; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    dialog.querySelector('[data-timetable-week]').innerHTML = days.map(([day, short, name]) => {
      const entries = rules.forDay(items, day);
      return `<section id="timetableDay${day}" class="timetable__day ${selectedDay === day ? 'is-selected' : ''}" aria-label="${name}"><h3>${name}<span>${entries.length || ''}</span></h3><div>${entries.length ? entries.map(item => `<article class="timetable__entry timetable-color--${item.color}"><time>${item.start} – ${item.end}</time><h4>${escape(item.title)}</h4>${item.place ? `<p>${escape(item.place)}</p>` : ''}<footer><button type="button" data-timetable-edit="${escape(item.id)}" aria-label="Editar ${escape(item.title)}" title="Editar horario">${icon('edit')}</button><button type="button" data-timetable-delete="${escape(item.id)}" aria-label="Eliminar ${escape(item.title)}" title="Eliminar horario">${icon('trash')}</button></footer></article>`).join('') : '<p class="timetable__empty">Libre</p>'}</div></section>`;
    }).join('');
  }
  function edit(id) {
    const item = read().find(item => item.id === id); if (!item) return;
    reset(); editingId = id;
    for (const key of ['title', 'start', 'end', 'place']) form.elements[key].value = item[key];
    form.querySelectorAll('input[name="day"]').forEach(input => { input.checked = item.days.includes(Number(input.value)); });
    chooseColor(item.color); dialog.querySelector('#timetableEditorTitle').textContent = 'Editar horario';
    dialog.querySelector('[data-timetable-save-label]').textContent = 'Guardar cambios'; dialog.querySelector('[data-timetable-cancel]').hidden = false; form.elements.title.focus();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (identity() !== owner) { dialog.close(); return; }
    const candidate = rules.normalize({ id: editingId || crypto.randomUUID(), title: form.elements.title.value, days: [...form.querySelectorAll('input[name="day"]:checked')].map(input => Number(input.value)), start: form.elements.start.value, end: form.elements.end.value, place: form.elements.place.value, color: form.elements.color.value });
    if (!candidate) { status.textContent = !form.querySelector('input[name="day"]:checked') ? 'Elegí al menos un día.' : 'El horario de fin debe ser posterior al de inicio.'; return; }
    const items = read();
    if (editingId && !items.some(item => item.id === editingId)) { reset(); status.textContent = 'Este horario ya se eliminó en otro dispositivo.'; return; }
    if (!editingId && items.length >= rules.MAX_ITEMS) { status.textContent = 'Podés guardar hasta 100 horarios.'; return; }
    const overlaps = rules.overlaps(items, candidate);
    try { write([...items.filter(item => item.id !== candidate.id), candidate]); }
    catch (_) { status.textContent = 'No se pudo guardar. Tus datos anteriores siguen intactos.'; return; }
    selectedDay = candidate.days[0]; reset(); render();
    status.textContent = overlaps.length ? `Guardado. Coincide con ${overlaps[0].title}.` : 'Horario guardado.';
    form.elements.title.focus();
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-timetable-open]')) open();
    if (!dialog.contains(event.target)) return;
    if (event.target.closest('[data-timetable-close]')) dialog.close();
    if (event.target.closest('[data-timetable-new],[data-timetable-cancel]')) { reset(); form.elements.title.focus(); }
    const color = event.target.closest('[data-timetable-color]'); if (color) chooseColor(color.dataset.timetableColor);
    const day = event.target.closest('[data-timetable-day]'); if (day) { selectedDay = Number(day.dataset.timetableDay); render(); dialog.querySelector(`[data-timetable-day="${selectedDay}"]`).focus(); }
    const entry = event.target.closest('[data-timetable-edit]'); if (entry) edit(entry.dataset.timetableEdit);
    const remove = event.target.closest('[data-timetable-delete]');
    if (remove) {
      if (identity() !== owner) { dialog.close(); return; }
      const id = remove.dataset.timetableDelete, title = read().find(item => item.id === id)?.title;
      try { write(read().filter(item => item.id !== id)); if (editingId === id) reset(); render(); status.textContent = `Horario eliminado: ${title || ''}.`; dialog.querySelector('[data-timetable-new]').focus(); }
      catch (_) { status.textContent = 'No se pudo eliminar. Intentá de nuevo.'; }
    }
  });
  dialog.addEventListener('keydown', event => {
    if (!event.target.matches('[data-timetable-day]') || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const index = days.findIndex(([day]) => day === selectedDay);
    selectedDay = days[event.key === 'Home' ? 0 : event.key === 'End' ? 6 : (index + (event.key === 'ArrowRight' ? 1 : 6)) % 7][0]; render(); dialog.querySelector(`[data-timetable-day="${selectedDay}"]`).focus();
  });
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  function refresh() { if (identity() !== owner) { if (dialog.open) dialog.close(); reset(); owner = identity(); } if (dialog.open) render(); }
  window.addEventListener('estudiemos:cloud-restored', refresh); window.addEventListener('estudiemos:account-synced', refresh);
  window.addEventListener('storage', event => { if ([rules.KEY, 'estudiemos_cloud_user'].includes(event.key)) refresh(); });
  window.addEventListener('estudiemos:data-change', event => { if (event.detail?.key === rules.KEY) refresh(); });
  reset();
})();
