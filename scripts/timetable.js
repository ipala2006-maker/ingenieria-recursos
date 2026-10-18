(function () {
  if (window.EstudiemosTimetable || !window.EstudiemosTimetableRules) return;
  const rules = window.EstudiemosTimetableRules;
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('../styles/timetable.css?v=20261019', document.currentScript.src); document.head.appendChild(style);
  // Lucide: x, check, trash-2.
  const paths = { close: '<path d="m18 6-12 12M6 6l12 12"/>', check: '<path d="m5 12 4 4L19 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>' };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  const days = [[1, 'Lun', 'Lunes'], [2, 'Mar', 'Martes'], [3, 'Mié', 'Miércoles'], [4, 'Jue', 'Jueves'], [5, 'Vie', 'Viernes'], [6, 'Sáb', 'Sábado'], [0, 'Dom', 'Domingo']];
  const colorNames = ['Azul', 'Turquesa', 'Violeta', 'Rosa', 'Amarillo'];
  let selectedDay = new Date().getDay(), editingId = '', returnFocus = null, owner = identity();
  const dialog = document.createElement('dialog');
  dialog.className = 'timetable'; dialog.dataset.timetable = ''; dialog.setAttribute('aria-labelledby', 'timetableTitle');
  dialog.innerHTML = `<header class="timetable__head"><div><p>CALENDARIO · HORARIO FIJO</p><h2 id="timetableTitle">Nuevo horario</h2></div><button type="button" data-timetable-close aria-label="Cerrar horario" title="Cerrar">${icon('close')}</button></header>
    <form data-timetable-form><input type="hidden" name="color" value="blue">
    <label>Materia o actividad<input name="title" maxlength="90" required autocomplete="off" placeholder="Ej.: Análisis matemático"></label>
    <fieldset><legend>Repetir cada semana</legend><div class="timetable__days">${days.map(([day, short, label]) => `<label title="${label}"><input type="checkbox" name="day" value="${day}" aria-label="${label}"><span>${short}</span></label>`).join('')}</div></fieldset>
    <div class="timetable__times"><label>Desde<input name="start" type="time" required></label><label>Hasta<input name="end" type="time" required></label></div>
    <fieldset><legend>Color en el calendario</legend><div class="timetable__colors">${rules.COLORS.map((color, index) => `<button type="button" data-timetable-color="${color}" class="timetable-color--${color}" aria-label="${colorNames[index]}" title="${colorNames[index]}" aria-pressed="${index === 0}"><span></span></button>`).join('')}</div></fieldset>
    <label>Lugar (opcional)<input name="place" maxlength="90" autocomplete="off" placeholder="Aula, edificio o enlace"></label>
    <div class="timetable__preview timetable-color--blue" data-timetable-preview><strong></strong><span></span></div>
    <p class="timetable__status" data-timetable-conflict></p>
    <p class="timetable__status" data-timetable-status role="status" aria-live="polite"></p>
    <footer class="timetable__save"><button type="button" data-timetable-delete hidden title="Eliminar horario" aria-label="Eliminar horario">${icon('trash')}</button><button type="button" data-timetable-close>Cancelar</button><button type="submit" class="timetable__primary">${icon('check')}<span>Guardar</span></button></footer>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('[data-timetable-status]');
  window.EstudiemosTimetable = Object.freeze({ open });
  function identity() { return window.EstudiemosAccount?.getUser()?.id || 'guest'; }
  function read() { return rules.read(localStorage); }
  function write(items) {
    localStorage.setItem(rules.KEY, JSON.stringify(rules.list(items)));
    window.dispatchEvent(new CustomEvent('estudiemos:data-change', { detail: { key: rules.KEY } }));
  }
  function open(options = {}) {
    if (dialog.open) return;
    if (Number.isInteger(options.day) && options.day >= 0 && options.day <= 6) selectedDay = options.day;
    returnFocus = document.activeElement; owner = identity(); reset();
    if (options.id && !edit(options.id)) return;
    dialog.showModal(); form.elements.title.focus();
  }
  function reset() {
    editingId = ''; form.reset(); form.elements.start.value = '08:00'; form.elements.end.value = '10:00';
    form.querySelector(`input[name="day"][value="${selectedDay}"]`).checked = true;
    dialog.querySelector('#timetableTitle').textContent = 'Nuevo horario';
    dialog.querySelector('[data-timetable-delete]').hidden = true; status.textContent = ''; chooseColor('blue');
  }
  function chooseColor(color) {
    form.elements.color.value = color;
    form.querySelectorAll('[data-timetable-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.timetableColor === color)));
    preview();
  }
  function preview() {
    const panel = form.querySelector('[data-timetable-preview]');
    panel.className = `timetable__preview timetable-color--${form.elements.color.value}`;
    panel.querySelector('strong').textContent = form.elements.title.value.trim() || 'Nueva actividad';
    const labels = days.filter(([day]) => form.querySelector(`input[name="day"][value="${day}"]`).checked).map(([,label]) => label);
    panel.querySelector('span').textContent = `${labels.join(' · ') || 'Elegí los días'} · ${form.elements.start.value || '--:--'}–${form.elements.end.value || '--:--'}`;
    const candidate = {id:editingId || 'preview', title:form.elements.title.value, days:[...form.querySelectorAll('input[name="day"]:checked')].map(input=>Number(input.value)), start:form.elements.start.value, end:form.elements.end.value};
    const overlap = rules.overlaps(read(), candidate)[0];
    form.querySelector('[data-timetable-conflict]').textContent = overlap ? `Coincide con ${overlap.title}.` : '';
  }
  function edit(id) {
    const item = read().find(item => item.id === id); if (!item) return false;
    editingId = id;
    for (const key of ['title', 'start', 'end', 'place']) form.elements[key].value = item[key];
    form.querySelectorAll('input[name="day"]').forEach(input => { input.checked = item.days.includes(Number(input.value)); });
    chooseColor(item.color); dialog.querySelector('#timetableTitle').textContent = 'Editar horario';
    dialog.querySelector('[data-timetable-delete]').hidden = false; return true;
  }
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (identity() !== owner) { dialog.close(); return; }
    const candidate = rules.normalize({ id: editingId || crypto.randomUUID(), title: form.elements.title.value, days: [...form.querySelectorAll('input[name="day"]:checked')].map(input => Number(input.value)), start: form.elements.start.value, end: form.elements.end.value, place: form.elements.place.value, color: form.elements.color.value });
    if (!candidate) { status.textContent = !form.querySelector('input[name="day"]:checked') ? 'Elegí al menos un día.' : 'El horario de fin debe ser posterior al de inicio.'; return; }
    const items = read();
    if (editingId && !items.some(item => item.id === editingId)) { status.textContent = 'Este horario ya se eliminó en otro dispositivo.'; return; }
    if (!editingId && items.length >= rules.MAX_ITEMS) { status.textContent = 'Podés guardar hasta 100 horarios.'; return; }
    try { write([...items.filter(item => item.id !== candidate.id), candidate]); }
    catch (_) { status.textContent = 'No se pudo guardar. Tus datos anteriores siguen intactos.'; return; }
    dialog.close();
  });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-timetable-close]')) dialog.close();
    const color = event.target.closest('[data-timetable-color]'); if (color) chooseColor(color.dataset.timetableColor);
    if (event.target.closest('[data-timetable-delete]')) {
      if (identity() !== owner) { dialog.close(); return; }
      try { write(read().filter(item => item.id !== editingId)); dialog.close(); }
      catch (_) { status.textContent = 'No se pudo eliminar. Intentá de nuevo.'; }
    }
  });
  dialog.addEventListener('close', () => {
    const target = returnFocus?.isConnected ? returnFocus : document.querySelector('[data-calendar-reader][open] [data-calendar-reader-close]') || document.querySelector('[data-calendar-expand]');
    target?.focus({ preventScroll: true });
  });
  function refresh() { if (identity() !== owner) { if (dialog.open) dialog.close(); reset(); owner = identity(); } }
  window.addEventListener('estudiemos:cloud-restored', refresh); window.addEventListener('estudiemos:account-synced', refresh); window.addEventListener('estudiemos:account-change', refresh);
  window.addEventListener('storage', event => { if ([rules.KEY, 'estudiemos_cloud_user'].includes(event.key)) refresh(); });
  reset(); window.dispatchEvent(new CustomEvent('estudiemos:timetable-ready'));
})();
