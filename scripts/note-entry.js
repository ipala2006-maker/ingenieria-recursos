(function () {
  if (window.EstudiemosNoteEntry) return;
  const titles = '[data-quick-note-form] [name=title],#agendaTitle,[data-timetable-form] [name=title]';
  const forms = '[data-quick-note-form],#agendaForm,[data-timetable-form]';
  const continuing = new WeakSet();
  window.EstudiemosNoteEntry = Object.freeze({ continuing: form => continuing.has(form) });
  const style = document.createElement('link'); style.rel = 'stylesheet';
  style.href = new URL('../styles/note-entry.css?v=20261020-entry', document.currentScript.src); document.head.appendChild(style);
  function submit(form, next) {
    const button = form.querySelector('[type=submit]');
    if (!button || button.disabled) return;
    if (next) continuing.add(form);
    try { form.requestSubmit(button); } finally { continuing.delete(form); }
  }
  function mount() {
    document.querySelectorAll(forms).forEach(form => {
      const title = form.querySelector('[name=title],#agendaTitle'), save = form.querySelector('[type=submit]');
      if (!title || !save) return;
      title.setAttribute('enterkeyhint', 'send');
      let next = form.querySelector('[data-note-continue]');
      if (!next) {
        next = document.createElement('button'); next.type = 'button'; next.dataset.noteContinue = '';
        next.className = 'note-entry-next'; next.title = 'Guardar y agregar otra (Shift+Enter)'; next.setAttribute('aria-label', 'Guardar y agregar otra');
        next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 11h10M4 16h7M18 13v8M14 17h8"/></svg>';
        save.after(next); form.classList.add('has-note-entry');
      }
      if (next.disabled !== save.disabled) next.disabled = save.disabled;
    });
  }
  document.addEventListener('keydown', event => {
    if (!event.target.matches(titles) || event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    if (!event.repeat) submit(event.target.form, event.shiftKey);
  });
  document.addEventListener('beforeinput', event => {
    if (event.isComposing || !event.target.matches(titles) || !['insertParagraph','insertLineBreak'].includes(event.inputType)) return;
    event.preventDefault(); submit(event.target.form, event.inputType === 'insertLineBreak');
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-note-continue]');
    if (button) submit(button.form, true);
  });
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  mount();
})();
