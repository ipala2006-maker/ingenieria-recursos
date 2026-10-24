(function(){
  if(window.EstudiemosClassroomUI||!window.EstudiemosClasses)return;
  const api=window.EstudiemosClasses,rules=window.EstudiemosClassroomRules,time=window.EstudiemosTimetableRules,root=new URL('../',document.currentScript.src);
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon=name=>`<img src="${new URL(`assets/icons/${name}.svg`,root)}" width="20" height="20" alt="">`;
  const colors=['Azul','Turquesa','Violeta','Rosa','Amarillo'],days=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']];
  const dateLabel=value=>{const date=time.date(value);return date?new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric'}).format(date):value;};
  const roles=window.EstudiemosCourseRole,standalone=document.body.classList.contains('teacher-workspace');
  let selected='',detail=null,view='list',tab='events',busy=false,sequence=0,lastFocus,joinCode='',resume=false,uploaded=null,materialDraftId='';
  const dialog=document.createElement(standalone?'section':'dialog');dialog.className='classroom-dialog'+(standalone?' classroom-embedded':'');dialog.setAttribute('aria-labelledby','classroomTitle');
  dialog.innerHTML=`<header class="classroom-head"><div>${icon('graduation-cap')}<h2 id="classroomTitle">Materias y cátedras</h2></div><div class="classroom-actions"><button type="button" class="classroom-icon" data-class-role aria-label="Cambiar rol" title="Cambiar rol">${icon('users-round')}</button><button type="button" data-class-join>Unirme</button><button type="button" data-class-create>${icon('plus')}Crear materia</button>${standalone?'':`<button type="button" class="classroom-icon" data-class-close aria-label="Cerrar materias" title="Cerrar">${icon('x')}</button>`}</div></header><p class="classroom-status" role="status" aria-live="polite" hidden></p><div class="classroom-shell"><aside class="classroom-sidebar" aria-label="Mis materias"></aside><section class="classroom-main"></section></div>`;
  (standalone?document.querySelector('#teacherWorkspace'):document.body).append(dialog);
  const q=selector=>dialog.querySelector(selector),main=q('.classroom-main');
  const isOpen=()=>standalone?!dialog.hidden:dialog.open;
  const showHost=()=>{if(standalone)dialog.hidden=false;else if(!dialog.open)dialog.showModal();};
  const closeHost=()=>{if(standalone){dialog.hidden=true;onClose();}else dialog.close();};
  const courses=()=>{const list=api.snapshot()?.classes||[];return standalone?list.filter(course=>course.role==='teacher'):list;};
  const current=()=>courses().find(item=>item.id===selected);
  const teacher=()=>current()?.role==='teacher';
  function status(text='',error=false){const node=q('.classroom-status');node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);}
  function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button:not([data-class-close]),input,select,textarea').forEach(node=>node.disabled=value);}
  function colorFields(value='blue'){return `<fieldset class="classroom-colors"><legend>Color</legend>${time.COLORS.map((color,index)=>`<label title="${colors[index]}" class="classroom-color--${color}"><input type="radio" name="color" value="${color}" ${value===color?'checked':''} aria-label="${colors[index]}"><span></span></label>`).join('')}</fieldset>`;}
  function sidebar(){
    const list=courses(),node=q('.classroom-sidebar');
    node.innerHTML=`<h3>Mis materias <span>${list.length}</span></h3>${list.map(course=>`<button type="button" data-class-select="${escape(course.id)}" aria-current="${course.id===selected?'page':'false'}" class="classroom-course classroom-color--${course.color}"><span class="classroom-dot"></span><span><strong>${escape(course.title)}</strong><small>${course.archived?'Archivada':course.role==='teacher'?'Administrás · '+course.memberCount+' alumnos':escape(course.teacherName)}</small></span></button>`).join('')||'<p class="classroom-muted">Todavía no tenés materias.</p>'}`;
  }
  function draw(){
    sidebar();dialog.classList.toggle('has-selection',view!=='list');
    const choosing=view==='role'||!roles?.get();
    dialog.classList.toggle('is-choosing-role',choosing);
    q('[data-class-join]').hidden=standalone||choosing;
    q('[data-class-create]').hidden=choosing;
    q('[data-class-role]').hidden=choosing;
    if(choosing){main.innerHTML=`<div class="classroom-role"><h3>¿Cómo vas a usar Materias?</h3><div class="classroom-role-options"><button type="button" data-class-role-choice="teacher">${icon('graduation-cap')}<strong>Soy Profesor</strong><span>Fechas, archivos y tu curso.</span></button><button type="button" data-class-role-choice="student">${icon('book-open')}<strong>Soy Alumno</strong><span>Mis herramientas y mis materias.</span></button></div></div>`;return;}
    if(!window.EstudiemosAccount?.getUser()){main.innerHTML=`<div class="classroom-empty"><h3>Tus materias, en Estudiemos</h3><button type="button" data-class-login>Iniciar sesión</button></div>`;return;}
    const course=current();
    if(!teacher()&&tab==='members')tab='events';
    if(view==='list'){
      main.innerHTML=`<div class="classroom-empty">${icon('graduation-cap')}<h3>${courses().length?'Elegí una materia':'¿Con qué materia empezamos?'}</h3><div class="classroom-actions">${standalone?'':'<button type="button" class="classroom-primary" data-class-join>Unirme a una materia</button>'}<button type="button" ${standalone?'class="classroom-primary"':''} data-class-create>${standalone?'Crear materia':'Crear espacio de materia'}</button></div><button type="button" data-class-refresh>${icon('refresh-cw')}Actualizar</button></div>`;return;
    }
    if(view==='join'){drawJoin();return;}
    if(view==='create'||view==='settings'){drawCourseForm(view==='settings'?course:null);return;}
    if(!course){view='list';selected='';detail=null;draw();return;}
    if(view==='event'){drawEvent();return;}
    if(view==='material'){drawMaterial();return;}
    if(view==='share'){drawShare();return;}
    const code=course.code?course.code.slice(0,5)+'-'+course.code.slice(5):'';
    main.innerHTML=`<button type="button" class="classroom-mobile-back" data-class-back>${icon('arrow-left')}Mis materias</button><header class="classroom-course-head classroom-color--${course.color}"><div><span class="classroom-muted">${escape(course.institution||'Materia')}${course.archived?' · Archivada':''}</span><h3>${escape(course.title)}</h3><p>Responsable: ${escape(course.teacherName)} · ${course.memberCount} ${course.memberCount===1?'alumno':'alumnos'}</p></div><div class="classroom-actions"><button type="button" class="classroom-icon" data-class-refresh aria-label="Actualizar materia" title="Actualizar">${icon('refresh-cw')}</button>${teacher()?`<button type="button" class="classroom-icon" data-class-settings aria-label="Configurar materia" title="Configurar materia">${icon('settings-2')}</button>`:'<button type="button" data-class-leave>Salir de la materia</button>'}</div></header>
      ${teacher()&&!course.archived?`<div class="classroom-tools"><button type="button" data-class-event>${icon('calendar-days')}Cargar fechas</button><button type="button" data-class-material>${icon('folder')}Añadir archivos</button><button type="button" data-class-share>${icon('link')}Compartir link</button></div><div class="classroom-code-line"><span>Código de materia</span><strong data-class-code>${escape(code)}</strong></div>`:''}
      <div class="classroom-tabs" role="tablist" aria-label="Contenido de la materia">${[['events','Fechas'],['materials','Archivos']].map(([key,label])=>`<button type="button" role="tab" id="class-tab-${key}" aria-controls="classroomContent" aria-selected="${tab===key}" tabindex="${tab===key?'0':'-1'}" data-class-tab="${key}">${label}</button>`).join('')}</div><div id="classroomContent" class="classroom-content" role="tabpanel" aria-labelledby="class-tab-${tab}"></div>`;
    const content=q('.classroom-content');
    if(!detail||detail.id!==selected){content.innerHTML='<p class="classroom-muted">Cargando clase…</p>';return;}
    if(tab==='events'){
      content.innerHTML=`<div class="classroom-section-head"><span class="classroom-muted">${escape(course.timezone)}</span></div><div class="classroom-items">${detail.events.map(item=>`<article class="classroom-row classroom-color--${item.data.color}"><span class="classroom-dot"></span><div><strong>${escape(item.data.title)}</strong><p>${dateLabel(item.data.date)}${item.data.repeat==='weekly'?' · '+days.filter(([day])=>item.data.days.includes(day)).map(([,label])=>label).join(', '):''}${item.data.endDate?' · hasta '+dateLabel(item.data.endDate):''}</p><small>${item.data.allDay?'Todo el día':item.data.start+' – '+item.data.end} · ${escape(item.data.type)}</small>${item.data.note?`<p class="classroom-note">${escape(item.data.note)}</p>`:''}</div><div class="classroom-actions">${teacher()&&!course.archived?`<button type="button" data-class-event="${item.id}">Editar</button>`:`<button type="button" data-class-calendar="${item.data.date}">Calendario</button>`}</div></article>`).join('')||'<p class="classroom-empty-line">Todavía no hay fechas publicadas.</p>'}</div>`;
    }else if(tab==='materials'){
      content.innerHTML=`<div class="classroom-section-head"><span class="classroom-muted">Google Drive</span></div><div class="classroom-items">${detail.materials.map(item=>`<article class="classroom-row">${icon('file-text')}<div><a href="${escape(rules.driveUrl(item.url))}" target="_blank" rel="noopener noreferrer" class="classroom-material-link">${escape(item.title)}</a><small>Google Drive</small></div>${teacher()&&!course.archived?`<button type="button" data-class-material="${item.id}">Editar</button>`:''}</article>`).join('')||'<p class="classroom-empty-line">Todavía no hay materiales publicados.</p>'}</div>`;
    }else content.innerHTML=`<div class="classroom-items">${detail.members.map(item=>`<article class="classroom-row"><strong>${escape(item.name)}</strong>${!course.archived?`<button type="button" data-class-remove-member="${item.id}">Quitar</button>`:''}</article>`).join('')||'<p class="classroom-empty-line">Todavía no se unieron alumnos.</p>'}</div>`;
  }
  function drawJoin(){main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Mis materias</button><form data-class-form="join" class="classroom-form"><h3>Unirme a una materia</h3><label>Link o código de la materia<input name="code" required maxlength="1200" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Pegá el enlace o ABCDE-FGHJK" value="${escape(joinCode)}"></label><button class="classroom-primary" type="submit">Aceptar y unirme</button></form>`;}
  function invitation(){const course=current(),url=new URL('./',root);url.hash='materia='+course.code;return {url:url.href,text:`Te invito a ${course.title} en Estudiemos.\nResponsable: ${course.teacherName}\nCódigo: ${course.code.slice(0,5)}-${course.code.slice(5)}\n${url.href}`};}
  function drawShare(){const course=current(),invite=invitation();main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la materia</button><div class="classroom-form"><h3>Compartir ${escape(course.title)}</h3><label>Enlace de invitación<input readonly value="${escape(invite.url)}" data-class-link></label><label>Código de materia<input readonly value="${course.code.slice(0,5)}-${course.code.slice(5)}"></label><button type="button" class="classroom-primary" data-class-copy>${icon('copy')}Copiar invitación</button></div>`;}
  function drawCourseForm(course){
    if(course?.archived){main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la clase</button><h3>Clase archivada</h3><div class="classroom-settings-actions"><button type="button" data-class-archive>Reactivar clase</button></div>`;return;}
    main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}${course?'Volver a la materia':'Mis materias'}</button><form data-class-form="${course?'update':'create'}" class="classroom-form"><h3>${course?'Configuración de la materia':standalone?'Crear materia':'Crear espacio de materia'}</h3><label>Materia, cátedra o comisión<input name="title" maxlength="90" required placeholder="Ej: Álgebra · Comisión 2" value="${escape(course?.title)}"></label><label>Tu nombre<input name="teacherName" maxlength="60" required autocomplete="name" value="${escape(course?.teacherName)}"></label>${colorFields(course?.color)}<details><summary>Institución y zona horaria</summary><label>Escuela o universidad (opcional)<input name="institution" maxlength="90" value="${escape(course?.institution)}"></label><label>Zona horaria de la materia<input name="timezone" maxlength="80" required value="${escape(course?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')}"></label></details><button class="classroom-primary" type="submit">${course?'Guardar cambios':'Crear materia'}</button></form>${course?`<details class="classroom-members"><summary>Alumnos · ${course.memberCount}</summary>${detail?.members.map(item=>`<article class="classroom-row"><strong>${escape(item.name)}</strong><button type="button" data-class-remove-member="${item.id}">Quitar</button></article>`).join('')||'<p class="classroom-muted">Todavía no se unieron alumnos.</p>'}</details><div class="classroom-settings-actions"><button type="button" data-class-archive>Archivar materia</button><button type="button" data-class-rotate>Cambiar código de invitación</button></div>`:''}`;
  }
  let editing='';
  function drawEvent(){
    const item=detail?.events.find(item=>item.id===editing)?.data||{title:'',date:time.dateKey(new Date()),start:'08:00',end:'09:00',allDay:false,repeat:'none',days:[],endDate:'',color:current().color,type:'Clase',note:''};
    main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la clase</button><form data-class-form="event_save" class="classroom-form"><h3>${editing?'Editar fecha':'Publicar una fecha'}</h3><label>Actividad<input name="title" required maxlength="90" value="${escape(item.title)}" placeholder="Clase, examen o entrega"></label><div class="classroom-form-row"><label>Fecha<input name="date" type="date" required value="${item.date}"></label><label>Tipo<select name="type">${['Clase','Examen','Entrega','Actividad'].map(type=>`<option ${item.type===type?'selected':''}>${type}</option>`).join('')}</select></label></div><label class="classroom-toggle"><input name="allDay" type="checkbox" ${item.allDay?'checked':''}>Todo el día</label><div class="classroom-form-row" data-class-times ${item.allDay?'hidden':''}><label>Desde<input name="start" type="time" value="${item.start}" ${!item.allDay?'required':''}></label><label>Hasta<input name="end" type="time" value="${item.end}" ${!item.allDay?'required':''}></label></div><label>Repetir<select name="repeat"><option value="none">Una sola vez</option><option value="weekly" ${item.repeat==='weekly'?'selected':''}>Cada semana</option></select></label><div data-class-weekly ${item.repeat==='weekly'?'':'hidden'}><fieldset class="classroom-weekdays"><legend>Días de la semana</legend>${days.map(([day,label])=>`<label><input type="checkbox" name="day" value="${day}" ${item.days.includes(day)?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><label>Hasta (opcional)<input name="endDate" type="date" value="${item.endDate}"></label></div>${colorFields(item.color)}<label>Detalle (opcional)<textarea name="note" maxlength="1200" rows="2">${escape(item.note)}</textarea></label><div class="classroom-actions"><button class="classroom-primary" type="submit">Publicar fecha</button>${editing?'<button type="button" data-class-delete="event_remove">Eliminar fecha</button>':''}</div></form>`;
  }
  function drawMaterial(){
    const item=detail?.materials.find(item=>item.id===editing)||{};
    main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la materia</button><form data-class-form="material_save" class="classroom-form"><h3>${editing?'Editar archivo':'Añadir archivos'}</h3>${editing?'':`<div class="classroom-upload"><button type="button" data-class-connect-drive>${icon('link')}Conectar Drive</button><label>Subir PDF<input type="file" name="pdf" accept="application/pdf,.pdf" data-class-pdf></label><label class="classroom-toggle"><input type="checkbox" name="shareByLink">Permitir leer este PDF a cualquiera con su enlace</label><p class="classroom-muted">Opcional. El enlace podrá reenviarse fuera de la comisión. Sin marcarlo, se conservan los permisos de Drive. Hasta 50 MB.</p></div>`}<div class="classroom-actions">${window.EstudiemosDriveLibrary?.pick?'<button type="button" data-class-pick-drive>Elegir de Mi espacio</button>':''}</div><label>Nombre del material<input name="title" maxlength="120" required value="${escape(item.title)}"></label><label>Enlace de Google Drive<input name="url" type="url" maxlength="1200" required value="${escape(item.url)}" placeholder="https://drive.google.com/…"></label><p class="classroom-muted">Para enlaces existentes, revisá en Drive que tus alumnos tengan permiso de lectura.</p><div class="classroom-actions"><button class="classroom-primary" type="submit">Publicar material</button>${editing?'<button type="button" data-class-delete="material_remove">Quitar material</button>':''}</div></form>`;
    const version=sequence,form=q('[data-class-form=material_save]');
    if(!editing)window.EstudiemosCourseDrive?.status().then(state=>{if(version!==sequence||!form.isConnected)return;const button=form.querySelector('[data-class-connect-drive]');if(state.connected){button.textContent='Drive conectado';button.disabled=true;}}).catch(()=>{});
  }
  async function choose(id){selected=id;view='class';detail=null;draw();const version=++sequence;lock(true);status('');try{const result=await api.detail(id);if(version!==sequence||!isOpen())return;detail=result;draw();}catch(error){if(version===sequence)status(error.message,true);}finally{if(version===sequence)lock(false);}}
  async function mutate(action,data,message){
    if(busy)return;const version=++sequence;lock(true);status('Guardando…');
    try{const result=await api.act(action,{id:selected,...data});if(version!==sequence||!isOpen())return;selected=action==='leave'?'':result.selected;detail=result.detail||null;view=selected?'class':'list';if(action.startsWith('material_'))tab='materials';editing='';uploaded=null;if(action==='join'){joinCode='';try{sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}}draw();status(message||'Cambios guardados.');}
    catch(error){if(version===sequence)status(error.name==='AbortError'?'La conexión tardó demasiado. Volvé a intentar.':error.message,true);}finally{if(version===sequence)lock(false);}
  }
  async function refresh(){if(busy)return;const version=++sequence;lock(true);status('Actualizando…');try{await api.refresh(true);if(version!==sequence||!isOpen())return;if(selected&&current())detail=await api.detail(selected);if(version!==sequence||!isOpen())return;draw();status('');}catch(error){if(version===sequence)status(error.message,true);}finally{if(version===sequence)lock(false);}}
  function confirmAction(message,callback,cancelled=()=>{}){
    let accepted=false;
    const confirmation=document.createElement('dialog');confirmation.className='classroom-confirm';const p=document.createElement('p');p.textContent=message;const actions=document.createElement('div');actions.className='classroom-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>confirmation.close();const yes=document.createElement('button');yes.type='button';yes.textContent='Confirmar';yes.className='classroom-primary';yes.onclick=()=>{accepted=true;confirmation.close();callback();};actions.append(cancel,yes);confirmation.append(p,actions);confirmation.onclose=()=>{confirmation.remove();if(!accepted)cancelled();};document.body.append(confirmation);confirmation.showModal();
  }
  async function publishMaterial(form,values){
    const file=form.elements.pdf?.files[0];
    if(!file){mutate('material_save',{itemId:editing||undefined,material:rules.material(values)},'Material publicado.');return;}
    if(!values.title.trim())throw new Error('Escribí el nombre del material.');
    const course=current(),version=++sequence;lock(true);status('Subiendo PDF a tu Drive…');
    try{
      if(!uploaded){const result=await window.EstudiemosCourseDrive.upload(file,course,value=>{if(version===sequence)status('Subiendo PDF… '+value+'%');});if(version!==sequence)return;uploaded={...result,shared:false};}
      if(version!==sequence||!isOpen())return;
      if(form.elements.shareByLink.checked&&!uploaded.shared){
        const consent=await new Promise(resolve=>confirmAction('Este PDF podrá leerlo cualquier persona con el enlace, incluso fuera de la comisión. ¿Habilitar lectura por enlace para «'+values.title+'»?',()=>resolve(true),()=>resolve(false)));
        if(!consent||version!==sequence)return;
        status('Habilitando lectura del PDF…');await window.EstudiemosCourseDrive.share(uploaded,course.id,true);uploaded.shared=true;
      }
      if(version!==sequence||!isOpen())return;
      form.elements.url.value=uploaded.url;
      lock(false);
      await mutate('material_save',{itemId:materialDraftId,material:rules.material({title:values.title,url:uploaded.url})},uploaded.shared?'PDF publicado con lectura por enlace.':'PDF publicado. Se conservan sus permisos de Drive.');
    }catch(error){if(version===sequence)status(error.message,true);}finally{if(version===sequence)lock(false);}
  }
  dialog.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-class-form]');if(!form)return;event.preventDefault();if(busy)return;const values=Object.fromEntries(new FormData(form)),action=form.dataset.classForm;
    try{
      if(action==='join'){const code=rules.invitation(values.code,root.origin);if(!code)throw new Error('Revisá el enlace o código de la materia.');joinCode=code;mutate('join',{code},'Ya estás en la materia. Sus fechas aparecen en tu calendario.');}
      else if(action==='create'||action==='update')mutate(action,rules.course(values),action==='create'?'Clase creada. Ya podés compartir tu invitación.':'Clase actualizada.');
      else if(action==='event_save')mutate(action,{itemId:editing||undefined,event:rules.event({...values,allDay:form.elements.allDay.checked,days:[...form.querySelectorAll('[name=day]:checked')].map(input=>Number(input.value))})},'Fecha publicada en el calendario de la clase.');
      else if(action==='material_save')await publishMaterial(form,values);
    }catch(error){status(error.message==='INVALID_EVENT'?'Revisá las fechas, el horario y los días de repetición.':error.message==='INVALID_MATERIAL'?'Pegá un enlace a un archivo o carpeta de Google Drive.':'Revisá los campos de la actividad.',true);}
  });
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-class-pdf]')){uploaded=null;materialDraftId=crypto.randomUUID();const form=event.target.form,file=event.target.files[0];if(file){if(!form.elements.title.value)form.elements.title.value=file.name.replace(/\.pdf$/i,'').slice(0,120);form.elements.url.required=false;}else form.elements.url.required=true;return;}
    const form=event.target.closest('[data-class-form]');if(form?.dataset.classForm!=='event_save')return;
    if(event.target.name==='repeat')q('[data-class-weekly]').hidden=form.elements.repeat.value!=='weekly';
    if(event.target.name==='allDay'){q('[data-class-times]').hidden=form.elements.allDay.checked;form.elements.start.required=form.elements.end.required=!form.elements.allDay.checked;}
  });
  dialog.addEventListener('keydown',event=>{
    if(!event.target.closest('[data-class-tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const keys=['events','materials'],index=keys.indexOf(tab);
    tab=keys[event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length];draw();q('[data-class-tab='+tab+']').focus();
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-class-close'))return closeHost();if(busy)return;
    if(button.hasAttribute('data-class-role')){view='role';draw();return;}
    if(button.hasAttribute('data-class-role-choice')){const value=button.dataset.classRoleChoice;roles.choose(value);view=joinCode?'join':'list';draw();return;}
    if(button.hasAttribute('data-class-login')){resume=true;if(!standalone)closeHost();return window.EstudiemosAccount?.open();}
    if(button.hasAttribute('data-class-join')){view='join';draw();return;}
    if(button.hasAttribute('data-class-create')){view='create';draw();return;}
    if(button.hasAttribute('data-class-select'))return choose(button.dataset.classSelect);
    if(button.hasAttribute('data-class-back')){if(['event','material','settings','share'].includes(view))view='class';else{view='list';selected='';detail=null;}draw();status('');return;}
    if(button.hasAttribute('data-class-tab')){tab=button.dataset.classTab;draw();return;}
    if(button.hasAttribute('data-class-settings')){view='settings';draw();return;}
    if(button.hasAttribute('data-class-refresh'))return refresh();
    if(button.hasAttribute('data-class-event')){editing=button.dataset.classEvent;view='event';draw();return;}
    if(button.hasAttribute('data-class-material')){editing=button.dataset.classMaterial;uploaded=null;materialDraftId=crypto.randomUUID();view='material';draw();return;}
    if(button.hasAttribute('data-class-share')){view='share';draw();return;}
    if(button.hasAttribute('data-class-connect-drive')){try{await window.EstudiemosCourseDrive.connect(selected);}catch(error){status(error.message,true);}return;}
    if(button.hasAttribute('data-class-copy')){
      const {text}=invitation();
      try{await navigator.clipboard.writeText(text);status('Invitación copiada.');}catch(_){const input=document.createElement('textarea');input.value=text;input.readOnly=true;main.prepend(input);input.focus();input.select();status('Seleccioná y copiá tu invitación.');}return;
    }
    if(button.hasAttribute('data-class-leave'))return confirmAction('¿Salir de esta clase? Sus fechas dejarán de aparecer en tu calendario. Tus anotaciones personales se conservan.',()=>mutate('leave',{},'Saliste de la clase.'));
    if(button.hasAttribute('data-class-archive'))return confirmAction(current().archived?'¿Reactivar esta clase y sus fechas?':'¿Archivar esta clase? Se conserva el contenido, pero sus fechas se ocultan y no se pueden sumar alumnos.',()=>mutate('archive',{archived:!current().archived}));
    if(button.hasAttribute('data-class-rotate'))return confirmAction('¿Cambiar el código? El enlace anterior dejará de admitir alumnos; quienes ya se unieron siguen en la clase.',()=>mutate('rotate',{}));
    if(button.hasAttribute('data-class-delete'))return confirmAction('¿Quitar este contenido de la clase para todos sus alumnos?',()=>mutate(button.dataset.classDelete,{itemId:editing}));
    if(button.hasAttribute('data-class-remove-member'))return confirmAction('¿Quitar a este alumno de la clase?',()=>mutate('member_remove',{itemId:button.dataset.classRemoveMember}));
    if(button.hasAttribute('data-class-calendar')){const date=button.dataset.classCalendar;closeHost();window.dispatchEvent(new CustomEvent('estudiemos:class-calendar',{detail:{date}}));return;}
    if(button.hasAttribute('data-class-pick-drive')){
      try{if(!window.EstudiemosDriveLibrary?.pick)throw new Error('Pegá un enlace de Google Drive.');const version=sequence,item=await window.EstudiemosDriveLibrary.pick();if(item&&version===sequence&&isOpen()&&view==='material'){const form=q('[data-class-form]');form.elements.title.value=item.title.slice(0,120);form.elements.url.value=item.url;}}catch(error){status(error.message,true);}return;
    }
  });
  function onClose(){sequence++;busy=false;uploaded=null;document.querySelectorAll('.classroom-confirm[open]').forEach(node=>node.close());status('');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});if(!resume){if(view==='join'){joinCode='';try{sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}}window.dispatchEvent(new CustomEvent('estudiemos:classes-closed'));}}
  dialog.addEventListener('close',onClose);
  window.addEventListener('estudiemos:account-change',()=>{sequence++;selected='';detail=null;uploaded=null;document.querySelectorAll('.classroom-confirm[open]').forEach(node=>node.close());view=joinCode?'join':'list';busy=false;draw();lock(false);if((resume||standalone)&&window.EstudiemosAccount?.getUser()){resume=false;showHost();refresh();}});
  window.addEventListener('estudiemos:classes-updated',()=>{if(!isOpen())return;sidebar();if(view==='class'&&!busy){if(!current()){view='list';selected='';draw();}else choose(selected);}});
  window.EstudiemosClassroomUI=Object.freeze({isOpen,open(options={}){
    lastFocus=document.activeElement;status('');joinCode=options.join||joinCode;
    if(!standalone&&!joinCode)try{const pending=JSON.parse(sessionStorage.getItem(rules.PENDING_KEY)||'null');if(pending?.expires>Date.now()&&(!pending.owner||pending.owner===window.EstudiemosAccount?.getUser()?.id))joinCode=pending.code;else sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}
    view=joinCode?'join':'list';selected=options.id||'';if(selected&&current())view='class';showHost();draw();
    if(window.EstudiemosAccount?.getUser())refresh().then(()=>{if(!isOpen())return;if(options.id&&current()&&view==='list'){view='class';draw();}if(options.upload&&teacher()){view='material';editing='';uploaded=null;materialDraftId=crypto.randomUUID();draw();}});
  }});
})();
