(function () {
  if (window.EstudiemosTimetable || !window.EstudiemosTimetableRules) return;
  const rules = window.EstudiemosTimetableRules, AGENDA_KEY = 'bandeja_agenda';
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('../styles/timetable.css?v=20261023-repeat', document.currentScript.src); document.head.appendChild(style);
  const days = [[1,'Lun','Lunes'],[2,'Mar','Martes'],[3,'Mié','Miércoles'],[4,'Jue','Jueves'],[5,'Vie','Viernes'],[6,'Sáb','Sábado'],[0,'Dom','Domingo']];
  const colors = ['Azul','Turquesa','Violeta','Rosa','Amarillo'];
  let panel, form, status, owner = identity(), editingId = '', agendaId = '', active = false, draft = false;
  window.EstudiemosTimetable = Object.freeze({open});
  function identity() { return window.EstudiemosAccount?.getUser()?.id || 'guest'; }
  function agenda() {
    const items = JSON.parse(localStorage.getItem(AGENDA_KEY) || '[]');
    if (!Array.isArray(items)) throw new Error('No se pudo leer el calendario.');
    return items;
  }
  function mount() {
    if (form) return true;
    panel = document.querySelector('[data-calendar-editor]');
    if (!panel) return false;
    panel.dataset.timetable = '';
    panel.innerHTML = `<form data-timetable-form>
      <header class="calendar-planner__head"><h3 data-timetable-title>Nueva actividad</h3><button type="button" data-timetable-delete hidden aria-label="Eliminar actividad" title="Eliminar actividad"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></header>
      <label>Actividad<input name="title" maxlength="90" required autocomplete="off" placeholder="Materia, tarea o evento"></label>
      <div class="calendar-planner__row calendar-planner__recurrence-row"><label>Repetir<select name="repeat"><option value="none">No repetir</option><option value="daily">Cada día</option><option value="weekly">Cada semana</option><option value="custom">Personalizar</option></select></label><label><span data-timetable-date-label>Fecha</span><input name="date" type="date" required></label></div>
      <div class="calendar-planner__row" data-timetable-custom hidden><label>Cada<input name="interval" type="number" min="1" max="${rules.MAX_INTERVAL}" step="1" value="1" inputmode="numeric" disabled></label><label>Unidad<select name="unit" disabled><option value="days">Días</option><option value="weeks">Semanas</option><option value="months">Meses</option><option value="years">Años</option></select></label></div>
      <p class="calendar-planner__status" data-timetable-repeat-summary aria-live="polite" hidden></p>
      <fieldset data-timetable-days hidden><legend>Días de la semana</legend><div class="timetable__days">${days.map(([day,label,name])=>`<label title="${name}"><input type="checkbox" name="day" value="${day}" aria-label="${name}"><span>${label}</span></label>`).join('')}</div></fieldset>
      <div data-timetable-period hidden><label class="calendar-planner__toggle"><input type="checkbox" name="limited">Hasta una fecha</label><label data-timetable-until hidden>Último día<input name="until" type="date"></label></div>
      <label class="calendar-planner__toggle" data-timetable-all-day><input type="checkbox" name="allDay">Todo el día</label>
      <div class="calendar-planner__row" data-timetable-times><label>Hora de inicio<input name="start" type="time" required></label><label>Hora de fin<input name="end" type="time" required></label></div>
      <fieldset><legend>Color</legend><input type="hidden" name="color" value="blue"><div class="timetable__colors">${rules.COLORS.map((color,index)=>`<button type="button" data-timetable-color="${color}" class="timetable-color--${color}" aria-label="${colors[index]}" title="${colors[index]}" aria-pressed="${index===0}"><span></span></button>`).join('')}</div></fieldset>
      <div class="calendar-planner__row" data-timetable-type><label>Tipo<select name="type"><option value="Tarea">Actividad</option><option value="Clase">Clase</option><option value="Parcial">Examen</option><option value="Final">Final</option><option value="Entrega">Entrega</option><option value="Estudio">Estudio</option></select></label></div>
      <details data-timetable-details><summary data-timetable-place-label>Detalle (opcional)</summary><label class="sr-only" for="calendarActivityDetail">Lugar o detalle</label><textarea id="calendarActivityDetail" name="place" maxlength="1200" rows="2" placeholder="Aula, lugar o un detalle"></textarea></details>
      <div class="sr-only" data-timetable-preview><strong></strong><span></span></div>
      <p class="calendar-planner__status" data-timetable-conflict></p>
      <p class="calendar-planner__status" data-timetable-status role="status" aria-live="polite"></p>
      <footer class="calendar-planner__actions"><button type="button" data-timetable-close>Cancelar</button><button type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Guardar actividad</button></footer>
    </form>`;
    form = panel.querySelector('form'); status = form.querySelector('[data-timetable-status]');
    form.addEventListener('input', update); form.addEventListener('change', update);
    form.addEventListener('submit', save);
    form.addEventListener('invalid', event=>{
      const input=event.target;
      status.textContent=['date','until'].includes(input.name) ? 'Elegí una fecha real y completa.' : input.name==='interval' ? 'Elegí un número entero entre 1 y '+rules.MAX_INTERVAL+'.' : input.validationMessage;
    },true);
    form.addEventListener('click', event=>{
      const color = event.target.closest('[data-timetable-color]');
      if (color) { form.elements.color.value = color.dataset.timetableColor; update(); }
      if (event.target.closest('[data-timetable-close]')) cancel();
      if (event.target.closest('[data-timetable-delete]')) remove();
    });
    return true;
  }
  function open(options = {}) {
    if (!mount()) return;
    if (options.retain && draft && identity() === owner) {
      active = true; window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-open')); update(); form.elements.title.focus(); return;
    }
    owner = identity(); editingId = options.id || ''; agendaId = options.agendaId || ''; form.reset(); status.textContent = '';
    form.querySelector('[data-timetable-details]').open = false;
    const selected = rules.date(options.date) || new Date();
    form.elements.date.value = rules.dateKey(selected); form.elements.start.value = '08:00'; form.elements.end.value = '10:00';
    form.querySelectorAll('[name=day]').forEach(input=>{input.checked=Number(input.value)===selected.getDay();});
    form.elements.repeat.value = options.repeat || 'none';
    try {
      const item = editingId ? rules.read(localStorage).find(item=>item.id===editingId) : agendaId ? agenda().find(item=>item.id===agendaId) : null;
      if ((editingId || agendaId) && !item) return;
      if (item) {
        form.elements.title.value = item.title; form.elements.color.value = rules.COLORS.includes(item.color) ? item.color : 'blue';
        if (editingId) {
          form.elements.repeat.value = item.recurrence ? 'custom' : item.days.length===7 ? 'daily' : 'weekly';
          form.elements.interval.value = String(item.recurrence?.interval || 1); form.elements.unit.value = item.recurrence?.unit || 'days';
          form.elements.date.value = item.startDate || ''; form.elements.until.value = item.endDate || ''; form.elements.limited.checked = Boolean(item.endDate);
          form.elements.start.value = item.start; form.elements.end.value = item.end; form.elements.place.value = item.place || '';
          form.querySelectorAll('[name=day]').forEach(input=>{input.checked=item.days.includes(Number(input.value));});
        } else {
          form.elements.date.value = item.date; form.elements.start.value = item.horaInicio || item.startTime || '08:00';
          form.elements.end.value = item.horaFin || item.endTime || '10:00'; form.elements.allDay.checked = !(item.horaInicio || item.startTime);
          form.elements.place.value = item.note || ''; form.elements.type.value = ['Tarea','Clase','Parcial','Final','Entrega','Estudio'].includes(item.type) ? item.type : 'Tarea';
        }
      }
    } catch (_) { return; }
    form.querySelector('[data-timetable-details]').open = Boolean(form.elements.place.value);
    form.querySelector('[data-timetable-title]').textContent = editingId || agendaId ? 'Editar actividad' : 'Nueva actividad';
    form.querySelector('[data-timetable-delete]').hidden = !(editingId || agendaId);
    active = true; draft = true; window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-open')); update(); form.elements.title.focus();
  }
  function update() {
    status.textContent = '';
    const custom = form.elements.repeat.value === 'custom';
    const repeat = form.elements.repeat.value !== 'none', allDay = !repeat && form.elements.allDay.checked;
    form.querySelector('[data-timetable-custom]').hidden = !custom;
    form.elements.interval.disabled = !custom; form.elements.interval.required = custom; form.elements.unit.disabled = !custom;
    form.querySelector('[data-timetable-days]').hidden = !(form.elements.repeat.value === 'weekly' || custom && form.elements.unit.value === 'weeks');
    form.querySelector('[data-timetable-period]').hidden = !repeat; form.querySelector('[data-timetable-all-day]').hidden = repeat;
    form.querySelector('[data-timetable-date-label]').textContent = custom ? 'Desde' : repeat ? 'Desde (opcional)' : 'Fecha'; form.elements.date.required = !repeat || custom;
    form.querySelector('[data-timetable-until]').hidden = !repeat || !form.elements.limited.checked; form.elements.until.required = repeat && form.elements.limited.checked;
    form.elements.until.disabled = !repeat || !form.elements.limited.checked;
    for (const name of ['date','until']) {
      const input=form.elements[name];
      input.setCustomValidity(!input.disabled && (input.validity.badInput || input.value && !rules.date(input.value)) ? 'Elegí una fecha real y completa.' : '');
    }
    form.querySelector('[data-timetable-times]').hidden = allDay; form.elements.start.required = !allDay; form.elements.end.required = !allDay;
    form.querySelector('[data-timetable-type]').hidden = repeat; form.elements.place.maxLength = repeat ? 90 : 1200;
    form.querySelector('[data-timetable-place-label]').textContent = repeat ? 'Lugar (opcional)' : 'Detalle (opcional)';
    form.querySelectorAll('[data-timetable-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.timetableColor===form.elements.color.value)));
    const preview = form.querySelector('[data-timetable-preview]');
    preview.querySelector('strong').textContent = form.elements.title.value.trim() || 'Nueva actividad';
    const labels = days.filter(([day])=>form.querySelector('[name=day][value="'+day+'"]').checked).map(([,label])=>label);
    const candidate = weeklyCandidate();
    const recurrence = !repeat ? 'Una sola vez' : custom ? (rules.normalize({...candidate,title:candidate.title||'Actividad'}) ? rules.describe(candidate) : 'Elegí el intervalo y una fecha de inicio') : form.elements.repeat.value==='daily' ? 'Cada día' : 'Cada semana · '+(labels.join(' · ') || 'Elegí los días');
    const summary=form.querySelector('[data-timetable-repeat-summary]');
    summary.hidden=!custom; summary.textContent=custom ? recurrence+(form.elements.unit.value==='months'||form.elements.unit.value==='years' ? ' · Se omiten las fechas que no existen.' : '') : '';
    const date = form.elements.date.value ? shortDate(form.elements.date.value) : 'Sin fecha de inicio';
    preview.querySelector('span').textContent = [recurrence, allDay ? 'Todo el día' : form.elements.start.value+'–'+form.elements.end.value, date+(repeat && form.elements.limited.checked && form.elements.until.value ? ' → '+shortDate(form.elements.until.value) : '')].join(' · ');
    const overlap = repeat ? rules.overlaps(rules.read(localStorage), weeklyCandidate())[0] : null;
    form.querySelector('[data-timetable-conflict]').textContent = overlap ? 'Coincide con '+overlap.title+'.' : '';
    if (active) {
      const title = form.elements.title.value.trim() || 'Nueva actividad';
      const schedule = repeat ? rules.normalize({...weeklyCandidate(),title}) : null;
      const entry = !repeat && rules.date(form.elements.date.value) && (allDay || rules.time(form.elements.start.value) && rules.time(form.elements.end.value) && form.elements.end.value > form.elements.start.value) ? {id:'calendar-preview', title, date:form.elements.date.value, horaInicio:allDay?'':form.elements.start.value, horaFin:allDay?'':form.elements.end.value, type:form.elements.type.value, color:form.elements.color.value} : null;
      window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-preview',{detail:schedule||entry?{schedule,entry,replaceId:editingId||agendaId,date:form.elements.date.value}:null}));
    }
  }
  function shortDate(value) { const date=rules.date(value); return date ? new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric'}).format(date) : value; }
  function weeklyCandidate() {
    const custom=form.elements.repeat.value==='custom';
    return {id:editingId || agendaId || 'preview', title:form.elements.title.value, days:form.elements.repeat.value==='daily' || custom && form.elements.unit.value!=='weeks' ? [1,2,3,4,5,6,0] : [...form.querySelectorAll('[name=day]:checked')].map(input=>Number(input.value)), start:form.elements.start.value, end:form.elements.end.value, place:form.elements.place.value, color:form.elements.color.value, startDate:form.elements.date.value, endDate:form.elements.limited.checked ? form.elements.until.value : '', ...(custom ? {recurrence:{unit:form.elements.unit.value,interval:Number(form.elements.interval.value)}} : {})};
  }
  function commit(values) {
    const previous=Object.fromEntries(Object.keys(values).map(key=>[key,localStorage.getItem(key)]));
    try { for(const [key,value] of Object.entries(values))localStorage.setItem(key,JSON.stringify(value)); }
    catch(error) {for(const [key,raw] of Object.entries(previous)) {if(raw===null)localStorage.removeItem(key);else localStorage.setItem(key,raw);}throw error;}
    if(values[AGENDA_KEY]) {try {window.EstudiemosAndroid?.postMessage?.(JSON.stringify({type:'agenda-sync',items:values[AGENDA_KEY]}));}catch(_){}}
    for(const key of Object.keys(values))window.dispatchEvent(new CustomEvent('estudiemos:data-change',{detail:{key}}));
  }
  function save(event) {
    event.preventDefault(); if(!active || identity()!==owner)return cancel();
    status.textContent = '';
    try {
      const repeat=form.elements.repeat.value!=='none', allDay=!repeat&&form.elements.allDay.checked;
      if(!form.elements.title.value.trim())throw new Error('Escribí el nombre de la actividad.');
      const notes=agenda(), schedules=rules.read(localStorage);
      const original=editingId?schedules.find(item=>item.id===editingId):agendaId?notes.find(item=>item.id===agendaId):null;
      if((editingId||agendaId)&&!original)throw new Error('Esta actividad se eliminó en otro dispositivo.');
      if(!allDay && (!rules.time(form.elements.start.value)||!rules.time(form.elements.end.value)||form.elements.end.value<=form.elements.start.value))throw new Error('La hora de fin debe ser posterior a la de inicio.');
      if(form.elements.date.validity.badInput || form.elements.date.value&&!rules.date(form.elements.date.value))throw new Error('Elegí una fecha real y completa.');
      if(repeat && form.elements.limited.checked && (form.elements.until.validity.badInput || !rules.date(form.elements.until.value)))throw new Error('Elegí una fecha final real y completa.');
      if(form.elements.repeat.value==='custom' && (!rules.date(form.elements.date.value) || !Number.isInteger(Number(form.elements.interval.value)) || Number(form.elements.interval.value)<1 || Number(form.elements.interval.value)>rules.MAX_INTERVAL))throw new Error('Elegí una fecha de inicio y un intervalo entero entre 1 y '+rules.MAX_INTERVAL+'.');
      const id=editingId||agendaId||crypto.randomUUID(), values={};
      let selected=form.elements.date.value || rules.dateKey(new Date());
      if(repeat) {
        if(agendaId&&original.alarm)throw new Error('Quitá la alarma de esta actividad antes de convertirla en un horario repetitivo.');
        if(form.elements.place.value.trim().length>90)throw new Error('El lugar admite hasta 90 caracteres. Acortá el detalle antes de convertir esta actividad.');
        const item=rules.normalize({...weeklyCandidate(),id});
        if(!item)throw new Error(!form.querySelector('[name=day]:checked')&&form.elements.repeat.value==='weekly'?'Elegí al menos un día.':'Revisá el período: la fecha final no puede ser anterior al inicio.');
        if(item.startDate&&item.endDate&&!rules.occurrences([item],item.startDate,item.endDate).length)throw new Error('No hay ningún día seleccionado dentro de ese período.');
        if(!editingId&&schedules.length>=rules.MAX_ITEMS)throw new Error('Podés guardar hasta 100 horarios repetitivos.');
        values[rules.KEY]=[...schedules.filter(item=>item.id!==editingId),item];
        if(agendaId)values[AGENDA_KEY]=notes.filter(item=>item.id!==agendaId);
        const end=new Date(rules.date(selected));end.setDate(end.getDate()+6);
        selected=rules.occurrences([item],selected,rules.dateKey(end))[0]?.date||selected;
      } else {
        if(!rules.date(selected)||!form.elements.date.value)throw new Error('Elegí la fecha de la actividad.');
        if(!agendaId&&notes.length>=500)throw new Error('Podés guardar hasta 500 anotaciones.');
        const item={...(agendaId?original:{}),id,title:form.elements.title.value.trim(),date:selected,type:form.elements.type.value,horaInicio:allDay?'':form.elements.start.value,horaFin:allDay?'':form.elements.end.value,note:form.elements.place.value.trim(),color:form.elements.color.value,done:agendaId?Boolean(original.done):false,alarm:agendaId?original.alarm||null:null,createdAt:original?.createdAt||Date.now()};
        values[AGENDA_KEY]=[...notes.filter(item=>item.id!==agendaId),item];
        if(editingId)values[rules.KEY]=schedules.filter(item=>item.id!==editingId);
      }
      commit(values);
      if (window.EstudiemosNoteEntry?.continuing(form)) {
        editingId='';agendaId='';form.elements.title.value='';form.elements.place.value='';
        form.querySelector('[data-timetable-title]').textContent='Nueva actividad';
        form.querySelector('[data-timetable-delete]').hidden=true;
        window.dispatchEvent(new CustomEvent('estudiemos:calendar-entry-added',{detail:{date:selected}}));
        update();status.textContent='Actividad guardada.';form.elements.title.focus();return;
      }
      active=false;draft=false;
      window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-saved',{detail:{date:selected}}));
    } catch(error) {status.textContent=error.message||'No se pudo guardar. Intentá de nuevo.';}
  }
  function remove() {
    if(!active||identity()!==owner)return cancel();
    try {
      const key=editingId?rules.KEY:AGENDA_KEY,id=editingId||agendaId;
      if(!id)return;commit({[key]:(editingId?rules.read(localStorage):agenda()).filter(item=>item.id!==id)});
      active=false;draft=false;window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-saved'));
    } catch(_) {status.textContent='No se pudo eliminar. Intentá de nuevo.';}
  }
  function cancel() {active=false;draft=false;window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-cancel'));}
  function refresh() {
    if(identity()===owner)return;
    active=false;draft=false;owner=identity();if(form){form.reset();status.textContent='';}
    window.dispatchEvent(new CustomEvent('estudiemos:calendar-edit-preview',{detail:null}));
    document.querySelector('[data-calendar-reader][open]')?.close();
  }
  for(const name of ['estudiemos:cloud-restored','estudiemos:account-synced','estudiemos:account-change'])window.addEventListener(name,refresh);
  window.addEventListener('storage',event=>{if(event.key==='estudiemos_cloud_user')refresh();});
  window.addEventListener('estudiemos:calendar-closed',()=>{active=false;draft=false;});
  window.addEventListener('estudiemos:calendar-ready',mount);
  mount();window.dispatchEvent(new CustomEvent('estudiemos:timetable-ready'));
})();
