(function () {
  if (window.EstudiemosNoteColors || !window.EstudiemosTimetableRules) return;
  const rules = window.EstudiemosTimetableRules, key = 'bandeja_agenda';
  const choices = [['', 'Sin color'], ['blue', 'Azul'], ['teal', 'Turquesa'], ['violet', 'Violeta'], ['rose', 'Rosa'], ['amber', 'Amarillo']];
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('../styles/note-colors.css?v=20261019-note-colors', document.currentScript.src); document.head.appendChild(style);
  let dialog, currentId = '', owner = '', trigger;
  const identity = () => window.EstudiemosAccount?.getUser()?.id || 'guest';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const valid = value => value === '' || rules.COLORS.includes(value);
  const colorClass = color => rules.COLORS.includes(color) ? 'timetable-color--' + color : 'is-neutral';
  function items() {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) throw new Error('No se pudo leer la nota.');
    return value;
  }
  function button(item) {
    return `<button type="button" class="note-color-trigger ${colorClass(item.color)}" data-note-color-id="${escape(item.id)}" aria-label="Cambiar color: ${escape(item.title)}" title="Cambiar color"><span aria-hidden="true"></span></button>`;
  }
  function mount() {
    for (const form of document.querySelectorAll('[data-quick-note-form],#agendaForm')) {
      if (form.querySelector('[name=noteColor]')) continue;
      const label = form.querySelector('#agendaTitle,[name=title]')?.closest('label');
      if (!label) continue;
      const field = document.createElement('fieldset'); field.className = 'note-colors';
      field.innerHTML = `<legend>Color</legend><div class="note-colors__options">${choices.map(([color, name]) => `<label class="note-color-option ${colorClass(color)}" title="${name}"><input type="radio" name="noteColor" value="${color}" aria-label="${name}" ${color === '' ? 'checked' : ''}><span aria-hidden="true"></span></label>`).join('')}</div>`;
      label.after(field);
    }
  }
  function close() { dialog?.close(); }
  function open(id, source) {
    let item;
    try { item = items().find(item => item.id === id); } catch (_) { return; }
    if (!item) return;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.className = 'note-color-dialog';
      dialog.setAttribute('aria-labelledby', 'noteColorTitle');
      dialog.innerHTML = `<header><h2 id="noteColorTitle">Color de la nota</h2><button type="button" data-note-color-close aria-label="Cerrar">&#215;</button></header><p data-note-color-title></p><div class="note-color-dialog__options">${choices.map(([color, name]) => `<button type="button" class="${colorClass(color)}" data-note-color-value="${color}" aria-pressed="false"><span aria-hidden="true"></span>${name}</button>`).join('')}</div><p data-note-color-status role="status"></p>`;
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-note-color-close]')) return close();
        const choice = event.target.closest('[data-note-color-value]');
        if (choice) save(choice.dataset.noteColorValue);
      });
      dialog.addEventListener('close', () => {
        const id = currentId; currentId = '';
        const focus = trigger?.isConnected ? trigger : [...document.querySelectorAll('[data-note-color-id]')].find(el => el.dataset.noteColorId === id && el.getClientRects().length);
        focus?.focus(); trigger = null;
      });
    }
    owner = identity(); currentId = id; trigger = source;
    dialog.querySelector('[data-note-color-title]').textContent = item.title;
    dialog.querySelector('[data-note-color-status]').textContent = '';
    const color = rules.COLORS.includes(item.color) ? item.color : '';
    dialog.querySelectorAll('[data-note-color-value]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.noteColorValue === color)));
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[aria-pressed=true]')?.focus();
  }
  function save(color) {
    if (!currentId || !valid(color)) return;
    if (identity() !== owner) return close();
    try {
      // Re-read before saving so a concurrent completion or alarm edit is preserved.
      const list = items(), item = list.find(item => item.id === currentId);
      if (!item) return close();
      if (color) item.color = color; else delete item.color;
      localStorage.setItem(key, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('estudiemos:data-change', { detail: { key } }));
      close();
    } catch (_) { dialog.querySelector('[data-note-color-status]').textContent = 'No se pudo guardar el color. Intent\u00e1 nuevamente.'; }
  }
  window.EstudiemosNoteColors = Object.freeze({ open, button });
  document.addEventListener('click', event => {
    const source = event.target.closest('[data-note-color-id]');
    if (source) open(source.dataset.noteColorId, source);
  });
  for (const event of ['estudiemos:bandeja-ready', 'estudiemos:note-forms-ready', 'estudiemos:alarms-ready']) window.addEventListener(event, mount);
  for (const event of ['estudiemos:account-change', 'estudiemos:account-synced', 'estudiemos:cloud-restored']) window.addEventListener(event, () => {
    if (dialog?.open && identity() !== owner) close();
  });
  mount();
  window.dispatchEvent(new CustomEvent('estudiemos:note-colors-ready'));
})();
