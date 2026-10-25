(function(){
  if(window.EstudiemosClassroomUI||!window.EstudiemosClasses)return;
  const api=window.EstudiemosClasses,rules=window.EstudiemosClassroomRules,time=window.EstudiemosTimetableRules,root=new URL('../',document.currentScript.src);
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon=name=>`<img src="${new URL(`assets/icons/${name}.svg`,root)}" width="20" height="20" alt="">`;
  const colors=['Azul','Turquesa','Violeta','Rosa','Amarillo'],days=[[1,'Lun'],[2,'Mar'],[3,'Mié'],[4,'Jue'],[5,'Vie'],[6,'Sáb'],[0,'Dom']];
  const dateLabel=value=>{const date=time.date(value);return date?new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric'}).format(date):value;};
  const roles=window.EstudiemosCourseRole,standalone=document.body.classList.contains('teacher-workspace');
  let selected='',detail=null,view='list',tab='events',busy=false,sequence=0,lastFocus,joinCode='',autoJoin=false,resume=false,uploaded=null,materialDraftId='';
  const dialog=document.createElement(standalone?'section':'dialog');dialog.className='classroom-dialog'+(standalone?' classroom-embedded':'');dialog.setAttribute('aria-labelledby','classroomTitle');
  dialog.innerHTML=`<header class="classroom-head"><div>${icon('graduation-cap')}<h2 id="classroomTitle">Materias y cátedras</h2></div><div class="classroom-actions"><button type="button" class="classroom-icon" data-class-role aria-label="Cambiar rol" title="Cambiar rol">${icon('users-round')}</button><button type="button" data-class-join>Unirme</button><button type="button" data-class-create>${icon('plus')}Crear materia</button>${standalone?'':`<button type="button" class="classroom-icon" data-class-close aria-label="Cerrar materias" title="Cerrar">${icon('x')}</button>`}</div></header><p class="classroom-status" role="status" aria-live="polite" hidden></p><div class="classroom-shell"><aside class="classroom-sidebar" aria-label="Mis materias"></aside><section class="classroom-main"></section></div>`;
  (standalone?document.querySelector('#teacherWorkspace'):document.body).append(dialog);
  const q=selector=>dialog.querySelector(selector),main=q('.classroom-main');
  const isOpen=()=>standalone?!dialog.hidden:dialog.open;
  const showHost=()=>{if(standalone)dialog.hidden=false;else if(!dialog.open)dialog.showModal();};
  const closeHost=()=>{if(standalone){dialog.hidden=true;onClose();}else dialog.close();};
  const courses=()=>{const list=api.snapshot()?.classes||[];return standalone?list.filter(course=>course.role==='teacher'):list;};
  const current=()=>courses().find(item=>item.id===selected);
  const teacher=()=>rules.isOwner(current());
  const can=permission=>rules.can(current(),permission);
  const roleLabel=role=>({teacher:'Profesor',collaborator:'Colaborador',moderator:'Delegado',student:'Alumno'}[role]||'Alumno');
  const permissionLabels={datesAdd:'Agregar fechas',datesEdit:'Editar fechas',datesRemove:'Quitar fechas',filesAdd:'Agregar archivos',filesEdit:'Editar archivos',filesRemove:'Quitar archivos'};
  function teamSummary(course){
    const delegates=detail?.team?.delegates||[],owner=detail?.team?.owner||{name:course.teacherName,role:course.ownerRole||'teacher'};
    return `<section class="classroom-team" aria-label="Equipo y permisos de la cátedra"><div class="classroom-team-owner">${icon('users-round')}<span><small>${roleLabel(owner.role)}</small><strong>${escape(owner.name)}</strong></span><span class="classroom-rank">Tu rol: ${roleLabel(course.role)}</span></div><details><summary>${delegates.length?delegates.length+' '+(delegates.length===1?'delegado':'delegados')+' · ':''}Roles y permisos</summary><div class="classroom-team-roles"><p><strong>${roleLabel(owner.role)}</strong><span>${owner.role==='collaborator'?'Administra la cátedra, sus fechas y archivos. Asigna delegados y sus permisos.':'Administra la cátedra. Publica y modifica sus fechas y archivos.'}</span></p><p><strong>Alumno</strong><span>Consulta las fechas y abre o descarga los materiales desde Drive. No modifica el contenido compartido.</span></p></div>${owner.role==='collaborator'?`<div class="classroom-team-delegates"><h4>Delegados</h4>${delegates.map(member=>`<article><strong>${escape(member.name)}</strong><ul>${rules.PERMISSIONS.filter(key=>member.permissions?.[key]===true).map(key=>`<li>${permissionLabels[key]}</li>`).join('')||'<li>Sin permisos de edición</li>'}</ul></article>`).join('')||'<p class="classroom-muted">Sin delegados asignados.</p>'}</div>`:''}</details></section>`;
  }
  let managingMember='',settingsTab='general',settingsDraft=null;
  const settingsTabs=[['general','General','settings-2'],['members','Participantes','users-round'],['manage','Gestión','folder']];
  function status(text='',error=false){const node=q('.classroom-status');node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);}
  function lock(value){busy=value;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button:not([data-class-close]),input,select,textarea').forEach(node=>node.disabled=value);}
  function colorFields(value='blue'){return `<fieldset class="classroom-colors"><legend>Color</legend>${time.COLORS.map((color,index)=>`<label title="${colors[index]}" class="classroom-color--${color}"><input type="radio" name="color" value="${color}" ${value===color?'checked':''} aria-label="${colors[index]}"><span></span></label>`).join('')}</fieldset>`;}
  function sidebar(){
    const list=courses(),node=q('.classroom-sidebar');
    node.innerHTML=`<h3>Mis materias <span>${list.length}</span></h3>${list.map(course=>`<button type="button" data-class-select="${escape(course.id)}" aria-current="${course.id===selected?'page':'false'}" class="classroom-course classroom-color--${course.color}"><span class="classroom-dot"></span><span><strong>${escape(course.title)}</strong><small>${course.archived?'Archivada':rules.isOwner(course)?roleLabel(course.role)+' · '+course.memberCount+' alumnos':course.role==='moderator'?'Delegado':escape(course.teacherName)}</small></span></button>`).join('')||'<p class="classroom-muted">Todavía no tenés materias.</p>'}`;
  }
  function draw(){
    dialog.dataset.view=view;
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
    if(view==='settings'&&!teacher())view='class';
    if(view==='create'||view==='settings'){drawCourseForm(view==='settings'?course:null);return;}
    if(!course){view='list';selected='';detail=null;draw();return;}
    if(view==='event'&&can(editing?'datesEdit':'datesAdd')){drawEvent();return;}
    if(view==='material'&&can(editing?'filesEdit':'filesAdd')){drawMaterial();return;}
    if(view==='share'&&teacher()){drawShare();return;}
    view='class';
    const code=course.code?course.code.slice(0,5)+'-'+course.code.slice(5):'';
    main.innerHTML=`<button type="button" class="classroom-mobile-back" data-class-back>${icon('arrow-left')}Mis materias</button><header class="classroom-course-head classroom-color--${course.color}"><div><span class="classroom-muted">${escape(course.institution||'Materia')}${course.archived?' · Archivada':''}</span><h3>${escape(course.title)}</h3><p>${course.memberCount} ${course.memberCount===1?'alumno':'alumnos'}</p></div><div class="classroom-actions"><button type="button" class="classroom-icon" data-class-refresh aria-label="Actualizar materia" title="Actualizar">${icon('refresh-cw')}</button>${teacher()?`<button type="button" class="classroom-icon" data-class-settings aria-label="Configurar materia" title="Configurar materia">${icon('settings-2')}</button>`:'<button type="button" data-class-leave>Quitar de mis materias</button>'}</div></header>${teamSummary(course)}
      ${!course.archived&&(teacher()||can('datesAdd')||can('filesAdd'))?`<div class="classroom-tools">${can('datesAdd')?`<button type="button" data-class-event>${icon('calendar-days')}Cargar fechas</button>`:''}${can('filesAdd')?`<button type="button" data-class-material>${icon('folder')}Añadir archivos</button>`:''}${teacher()?`<button type="button" data-class-share>${icon('link')}Compartir link</button>`:''}</div>${teacher()?`<div class="classroom-code-line"><span>Código de materia</span><strong data-class-code>${escape(code)}</strong></div>`:''}`:''}
      <div class="classroom-tabs" role="tablist" aria-label="Contenido de la materia">${[['events','Fechas'],['materials','Archivos']].map(([key,label])=>`<button type="button" role="tab" id="class-tab-${key}" aria-controls="classroomContent" aria-selected="${tab===key}" tabindex="${tab===key?'0':'-1'}" data-class-tab="${key}">${label}</button>`).join('')}</div><div id="classroomContent" class="classroom-content" role="tabpanel" aria-labelledby="class-tab-${tab}"></div>`;
    const content=q('.classroom-content');
    if(!detail||detail.id!==selected){content.innerHTML='<p class="classroom-muted">Cargando clase…</p>';return;}
    if(tab==='events'){
      content.innerHTML=`<div class="classroom-section-head"><span class="classroom-muted">${escape(course.timezone)}</span></div><div class="classroom-items">${detail.events.map(item=>`<article class="classroom-row classroom-color--${item.data.color}"><span class="classroom-dot"></span><div><strong>${escape(item.data.title)}</strong><p>${dateLabel(item.data.date)}${item.data.repeat==='weekly'?' · '+days.filter(([day])=>item.data.days.includes(day)).map(([,label])=>label).join(', '):''}${item.data.endDate?' · hasta '+dateLabel(item.data.endDate):''}</p><small>${item.data.allDay?'Todo el día':item.data.start+' – '+item.data.end} · ${escape(item.data.type)}</small>${item.data.note?`<p class="classroom-note">${escape(item.data.note)}</p>`:''}</div><div class="classroom-actions">${can('datesEdit')?`<button type="button" data-class-event="${item.id}">Editar</button>`:`<button type="button" data-class-calendar="${item.data.date}">Calendario</button>${can('datesRemove')?`<button type="button" data-class-remove-event="${item.id}">Quitar</button>`:''}`}</div></article>`).join('')||'<p class="classroom-empty-line">Todavía no hay fechas publicadas.</p>'}</div>`;
    }else if(tab==='materials'){
      content.innerHTML=`<div class="classroom-section-head"><span class="classroom-muted">Archivos alojados en Google Drive</span></div><div class="classroom-items">${detail.materials.map(item=>`<article class="classroom-row">${icon('file-text')}<div><a href="${escape(rules.driveUrl(item.url))}" target="_blank" rel="noopener noreferrer" class="classroom-material-link">${escape(item.title)}</a><small>Abrir y descargar en Drive</small></div><div class="classroom-actions"><a href="${escape(rules.driveUrl(item.url))}" target="_blank" rel="noopener noreferrer" class="classroom-file-open" aria-label="Abrir ${escape(item.title)} en Drive" title="Abrir en Google Drive">${icon('link')}<span>Abrir</span></a>${can('filesEdit')?`<button type="button" data-class-material="${item.id}">Editar</button>`:can('filesRemove')?`<button type="button" data-class-remove-material="${item.id}">Quitar</button>`:''}</div></article>`).join('')||'<p class="classroom-empty-line">Todavía no hay materiales publicados.</p>'}</div>`;
    }else content.innerHTML=`<div class="classroom-items">${detail.members.map(item=>`<article class="classroom-row"><strong>${escape(item.name)}</strong>${!course.archived?`<button type="button" data-class-remove-member="${item.id}">Quitar</button>`:''}</article>`).join('')||'<p class="classroom-empty-line">Todavía no se unieron alumnos.</p>'}</div>`;
  }
  function drawJoin(){main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Mis materias</button><form data-class-form="join" class="classroom-form"><h3>Unirme a una materia</h3><label>Link o código de la materia<input name="code" required maxlength="1200" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Pegá el enlace o ABCDE-FGHJK" value="${escape(joinCode)}"></label><button class="classroom-primary" type="submit">Aceptar y unirme</button></form>`;}
  function invitation(){const course=current(),url=new URL('materia/'+course.code,root);return {url:url.href,text:`Te invito a ${course.title} en Estudiemos.\nFechas y materiales de nuestra cursada, en un mismo lugar.\n${url.href}\nCódigo: ${course.code.slice(0,5)}-${course.code.slice(5)}`};}
  function drawShare(){const course=current(),invite=invitation();main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la materia</button><div class="classroom-form"><h3>Invitá a tu comisión</h3><section class="classroom-invitation-preview" aria-label="Vista previa de la invitación">${icon('graduation-cap')}<span>Estudiemos · Cátedra</span><h4>${escape(course.title)}</h4><p>${escape(course.institution||course.teacherName)}</p><small>Fechas y materiales de la cursada</small></section><label>Enlace de invitación<input readonly value="${escape(invite.url)}" data-class-link></label><p class="classroom-share-code">Código de cátedra <strong>${course.code.slice(0,5)}-${course.code.slice(5)}</strong></p><div class="classroom-actions"><button type="button" class="classroom-primary" data-class-copy>${icon('copy')}Copiar invitación</button>${navigator.share?`<button type="button" data-class-native-share>${icon('link')}Compartir</button>`:''}</div></div>`;}
  function memberControls(course){
    const collaborative=course.ownerRole==='collaborator';
    return `<details class="classroom-members" ${managingMember?'open':''}><summary>${collaborative?'Alumnos y delegados':'Alumnos'} · ${course.memberCount}</summary>${detail?.members.map(item=>`<article class="classroom-member"><div class="classroom-row"><div><strong>${escape(item.name)}</strong><small>${roleLabel(item.role)}</small></div><div class="classroom-actions">${collaborative?`<button type="button" data-class-member="${item.id}" aria-expanded="${managingMember===item.id}">${icon('settings-2')}Permisos</button>`:''}<button type="button" data-class-remove-member="${item.id}">Quitar</button></div></div>${collaborative&&managingMember===item.id?`<form data-class-form="member_permissions" data-member-id="${item.id}" class="classroom-permissions"><label class="classroom-toggle"><span>Delegado</span><input type="checkbox" name="moderator" role="switch" ${item.role==='moderator'?'checked':''}></label><div class="classroom-permission-groups" ${item.role==='moderator'?'':'hidden'}>${[['dates','Fechas'],['files','Archivos']].map(([prefix,title])=>`<fieldset><legend>${title}</legend>${[['Add','Agregar'],['Edit','Editar'],['Remove','Quitar']].map(([suffix,label])=>`<label class="classroom-toggle"><input type="checkbox" name="${prefix+suffix}" ${item.permissions?.[prefix+suffix]===true?'checked':''}>${label}</label>`).join('')}</fieldset>`).join('')}</div><button type="submit" class="classroom-primary">Guardar permisos</button></form>`:''}</article>`).join('')||'<p class="classroom-muted">Todavía no se unieron alumnos.</p>'}</details>`;
  }
  function drawCourseForm(course){
    if(course?.archived){main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la clase</button><h3>Clase archivada</h3><div class="classroom-settings-actions"><button type="button" data-class-archive>Reactivar clase</button><button type="button" data-class-delete-course>Eliminar materia</button></div>`;return;}
    const navigation=course?`<div class="classroom-settings-tabs" role="tablist" aria-label="Configuración de la materia">${settingsTabs.map(([key,label,name])=>`<button type="button" role="tab" id="class-settings-${key}" data-class-settings-tab="${key}" aria-selected="${settingsTab===key}" aria-controls="classroomSettingsPanel" tabindex="${settingsTab===key?'0':'-1'}">${icon(name)}${label}</button>`).join('')}</div>`:'';
    const back=`<button type="button" data-class-back>${icon('arrow-left')}${course?'Volver a la materia':'Mis materias'}</button>`;
    if(course&&settingsTab!=='general'){
      const content=settingsTab==='members'?memberControls(course):`<section class="classroom-management"><h3>Gestión de la materia</h3><div><button type="button" data-class-archive>Archivar materia</button><button type="button" data-class-rotate>Cambiar código de invitación</button></div><div class="classroom-danger-zone"><button type="button" data-class-delete-course>Eliminar materia</button></div></section>`;
      main.innerHTML=back+navigation+`<div id="classroomSettingsPanel" role="tabpanel" aria-labelledby="class-settings-${settingsTab}">${content}</div>`;
      const members=q('.classroom-members');if(members)members.open=true;return;
    }
    const ownerRole=course?.ownerRole||(standalone||roles?.get()==='teacher'?'teacher':'collaborator');
    main.innerHTML=back+navigation+`${course?'<div id="classroomSettingsPanel" role="tabpanel" aria-labelledby="class-settings-general">':''}<form data-class-form="${course?'update':'create'}" class="classroom-form"><h3>${course?'Datos de la materia':standalone?'Crear materia':'Crear espacio de materia'}</h3><label>Materia, cátedra o comisión<input name="title" maxlength="90" required placeholder="Ej: Álgebra · Comisión 2" value="${escape(course?.title)}"></label><label>Tu nombre<input name="teacherName" maxlength="60" required autocomplete="name" value="${escape(course?.teacherName)}"></label>${course&&!standalone?`<label>Organización<select name="ownerRole"><option value="teacher" ${ownerRole==='teacher'?'selected':''}>Profesor</option><option value="collaborator" ${ownerRole==='collaborator'?'selected':''}>Colaborador</option></select></label>`:`<input type="hidden" name="ownerRole" value="${ownerRole}"><span class="classroom-rank">${roleLabel(ownerRole)}</span>`}${colorFields(course?.color)}<details><summary>Institución y zona horaria</summary><label>Escuela o universidad (opcional)<input name="institution" maxlength="90" value="${escape(course?.institution)}"></label><label>Zona horaria de la materia<input name="timezone" maxlength="80" required value="${escape(course?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')}"></label></details><button class="classroom-primary" type="submit">${course?'Guardar cambios':'Crear materia'}</button></form>${course?'</div>':''}`;
  }
  function switchSettings(key){
    if(busy||!settingsTabs.some(([value])=>value===key))return;
    const form=q('[data-class-form=update]');if(form)settingsDraft=Object.fromEntries(new FormData(form));
    settingsTab=key;draw();main.scrollTop=0;
    if(key==='general'&&settingsDraft){const target=q('[data-class-form=update]');for(const [name,value]of Object.entries(settingsDraft)){const field=target?.elements.namedItem(name);if(field)field.value=value;}}
    q('[data-class-settings-tab='+key+']')?.focus({preventScroll:true});
  }
  let editing='';
  function drawEvent(){
    const item=detail?.events.find(item=>item.id===editing)?.data||{title:'',date:time.dateKey(new Date()),start:'08:00',end:'09:00',allDay:false,repeat:'none',days:[],endDate:'',color:current().color,type:'Clase',note:''};
    main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la clase</button><form data-class-form="event_save" class="classroom-form"><h3>${editing?'Editar fecha':'Publicar una fecha'}</h3><label>Actividad<input name="title" required maxlength="90" value="${escape(item.title)}" placeholder="Clase, examen o entrega"></label><div class="classroom-form-row"><label>Fecha<input name="date" type="date" required value="${item.date}"></label><label>Tipo<select name="type">${['Clase','Examen','Entrega','Actividad'].map(type=>`<option ${item.type===type?'selected':''}>${type}</option>`).join('')}</select></label></div><label class="classroom-toggle"><input name="allDay" type="checkbox" ${item.allDay?'checked':''}>Todo el día</label><div class="classroom-form-row" data-class-times ${item.allDay?'hidden':''}><label>Desde<input name="start" type="time" value="${item.start}" ${!item.allDay?'required':''}></label><label>Hasta<input name="end" type="time" value="${item.end}" ${!item.allDay?'required':''}></label></div><label>Repetir<select name="repeat"><option value="none">Una sola vez</option><option value="weekly" ${item.repeat==='weekly'?'selected':''}>Cada semana</option></select></label><div data-class-weekly ${item.repeat==='weekly'?'':'hidden'}><fieldset class="classroom-weekdays"><legend>Días de la semana</legend>${days.map(([day,label])=>`<label><input type="checkbox" name="day" value="${day}" ${item.days.includes(day)?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><label>Hasta (opcional)<input name="endDate" type="date" value="${item.endDate}"></label></div>${colorFields(item.color)}<label>Detalle (opcional)<textarea name="note" maxlength="1200" rows="2">${escape(item.note)}</textarea></label><div class="classroom-actions"><button class="classroom-primary" type="submit">Publicar fecha</button>${editing&&can('datesRemove')?'<button type="button" data-class-delete="event_remove">Eliminar fecha</button>':''}</div></form>`;
  }
  function drawMaterial(){
    const item=detail?.materials.find(item=>item.id===editing)||{};
    main.innerHTML=`<button type="button" data-class-back>${icon('arrow-left')}Volver a la materia</button><form data-class-form="material_save" class="classroom-form"><h3>${editing?'Editar archivo':'Añadir archivos'}</h3><label>Nombre del material<input name="title" maxlength="120" required value="${escape(item.title)}"></label><label>Enlace de Google Drive<input name="url" type="url" maxlength="1200" required value="${escape(item.url)}" placeholder="https://drive.google.com/…"></label><div class="classroom-actions">${window.EstudiemosDriveLibrary?.pick?`<button type="button" data-class-pick-drive>${icon('folder')}Elegir de Mi espacio</button>`:''}</div>${editing?'':`<details class="classroom-upload"><summary>${icon('file-text')}Subir un PDF</summary><div class="classroom-upload-fields"><button type="button" data-class-connect-drive>${icon('link')}Conectar Drive</button><label>Guardar en tu Drive<select name="driveFolder" data-class-drive-folder><option value="">Estudiemos / ${escape(current().title)}</option></select></label><p class="classroom-drive-destination" data-class-drive-destination>Carpeta de la cátedra en tu Drive.</p><label>Archivo PDF<input type="file" name="pdf" accept="application/pdf,.pdf" data-class-pdf></label><label class="classroom-toggle"><input type="checkbox" name="shareByLink">Permitir leer este PDF a cualquiera con su enlace</label><p class="classroom-muted">Opcional. El enlace podrá reenviarse fuera de la comisión. Sin marcarlo, se conservan los permisos de Drive. Hasta 50 MB.</p></div></details>`}<p class="classroom-muted">Los archivos conservan sus permisos de Google Drive.</p><div class="classroom-actions"><button class="classroom-primary" type="submit">Publicar material</button>${editing&&can('filesRemove')?'<button type="button" data-class-delete="material_remove">Quitar material</button>':''}</div></form>`;
    const version=sequence,form=q('[data-class-form=material_save]');
    if(!editing)window.EstudiemosCourseDrive?.status().then(state=>{if(version!==sequence||!form.isConnected)return;const button=form.querySelector('[data-class-connect-drive]');if(state.connected){button.textContent='Drive conectado';button.disabled=true;}}).catch(()=>{});
  }
  async function choose(id){selected=id;view='class';detail=null;draw();const version=++sequence;lock(true);status('');try{const result=await api.detail(id);if(version!==sequence||!isOpen())return;detail=result;draw();}catch(error){if(version===sequence)status(error.message,true);}finally{if(version===sequence)lock(false);}}
  dialog.addEventListener('toggle',async event=>{
    const upload=event.target;if(!upload.matches?.('.classroom-upload')||!upload.open||upload.dataset.destinations)return;
    upload.dataset.destinations='loading';const version=sequence,course=current(),form=upload.closest('form'),select=form.elements.driveFolder,note=form.querySelector('[data-class-drive-destination]');
    try{
      const result=await window.EstudiemosCourseDrive.destinations(course);
      if(version!==sequence||!form.isConnected)return;
      for(const folder of result.folders){const option=document.createElement('option');option.value=folder.id;option.textContent=folder.name;select.append(option);}
      note.textContent=result.email?'Drive de '+result.email+' · Archivos originales, sin copias en Estudiemos.':'Archivos originales en tu Drive, sin copias en Estudiemos.';
      upload.dataset.destinations='ready';
    }catch(_){if(version===sequence&&form.isConnected){delete upload.dataset.destinations;note.textContent='Conectá Drive para elegir una carpeta de Estudiemos. La carpeta de la cátedra se usa por defecto.';}}
  },true);
  async function mutate(action,data,message){
    if(busy)return;const version=++sequence;lock(true);status('Guardando…');
    try{const result=await api.act(action,{id:selected,...data});if(version!==sequence||!isOpen())return;selected=['leave','delete'].includes(action)?'':result.selected;detail=result.detail||null;view=selected?(action==='member_permissions'?'settings':'class'):'list';if(action.startsWith('material_'))tab='materials';editing='';uploaded=null;if(action==='join'){joinCode='';autoJoin=false;window.EstudiemosCourseInvitation?.clear();try{sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}}draw();status(message||'Cambios guardados.');}
    catch(error){if(version===sequence){try{await api.refresh(true);if(selected&&current())detail=await api.detail(selected);if(version!==sequence||!isOpen())return;draw();}catch(_){}if(version===sequence)status(error.name==='AbortError'?'La conexión tardó demasiado. Volvé a intentar.':error.message,true);}}finally{if(version===sequence)lock(false);}
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
      await api.refresh(true);if(version!==sequence)return;
      if(!can('filesAdd'))throw new Error('Ya no tenés permiso para añadir archivos en esta materia.');
      if(!uploaded){const result=await window.EstudiemosCourseDrive.upload(file,course,value=>{if(version===sequence)status('Subiendo PDF… '+value+'%');},values.driveFolder||'');if(version!==sequence)return;uploaded={...result,shared:false};}
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
      else if(action==='create'||action==='update'){
        const save=()=>mutate(action,rules.course(values),action==='create'?'Clase creada. Ya podés compartir tu invitación.':'Clase actualizada.');
        if(action==='update'&&current().ownerRole==='collaborator'&&values.ownerRole==='teacher')confirmAction('Al pasar a cátedra docente, todos los moderadores vuelven a ser alumnos sin permisos de edición. ¿Guardar este cambio?',save);else save();
      }
      else if(action==='member_permissions'){
        managingMember=form.dataset.memberId;
        const moderator=form.elements.moderator.checked,permissions=Object.fromEntries(rules.PERMISSIONS.map(key=>[key,moderator&&form.elements[key].checked]));
        mutate(action,{itemId:managingMember,role:moderator?'moderator':'student',permissions},moderator?'Permisos del delegado guardados.':'Ahora es alumno, sin permisos de edición.');
      }
      else if(action==='event_save')mutate(action,{itemId:editing||undefined,event:rules.event({...values,allDay:form.elements.allDay.checked,days:[...form.querySelectorAll('[name=day]:checked')].map(input=>Number(input.value))})},'Fecha publicada en el calendario de la clase.');
      else if(action==='material_save')await publishMaterial(form,values);
    }catch(error){status(error.message==='INVALID_EVENT'?'Revisá las fechas, el horario y los días de repetición.':error.message==='INVALID_MATERIAL'?'Pegá un enlace a un archivo o carpeta de Google Drive.':'Revisá los campos de la actividad.',true);}
  });
  dialog.addEventListener('change',event=>{
    if(event.target.name==='moderator'&&event.target.closest('[data-class-form=member_permissions]')){event.target.form.querySelector('.classroom-permission-groups').hidden=!event.target.checked;return;}
    if(event.target.matches('[data-class-pdf]')){uploaded=null;materialDraftId=crypto.randomUUID();const form=event.target.form,file=event.target.files[0];if(file){if(!form.elements.title.value)form.elements.title.value=file.name.replace(/\.pdf$/i,'').slice(0,120);form.elements.url.required=false;}else form.elements.url.required=true;return;}
    const form=event.target.closest('[data-class-form]');if(form?.dataset.classForm!=='event_save')return;
    if(event.target.name==='repeat')q('[data-class-weekly]').hidden=form.elements.repeat.value!=='weekly';
    if(event.target.name==='allDay'){q('[data-class-times]').hidden=form.elements.allDay.checked;form.elements.start.required=form.elements.end.required=!form.elements.allDay.checked;}
  });
  dialog.addEventListener('keydown',event=>{
    if(event.target.closest('[data-class-settings-tab]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const keys=settingsTabs.map(([key])=>key),index=keys.indexOf(settingsTab);
      switchSettings(keys[event.key==='Home'?0:event.key==='End'?keys.length-1:(index+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length]);return;
    }
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
    if(button.hasAttribute('data-class-settings')){view='settings';settingsTab='general';managingMember='';settingsDraft=null;draw();main.scrollTop=0;return;}
    if(button.hasAttribute('data-class-settings-tab')){switchSettings(button.dataset.classSettingsTab);return;}
    if(button.hasAttribute('data-class-member')){managingMember=managingMember===button.dataset.classMember?'':button.dataset.classMember;draw();if(managingMember)q('[data-class-form=member_permissions] [name=moderator]')?.focus({preventScroll:true});return;}
    if(button.hasAttribute('data-class-refresh'))return refresh();
    if(button.hasAttribute('data-class-event')){editing=button.dataset.classEvent;view='event';draw();return;}
    if(button.hasAttribute('data-class-material')){editing=button.dataset.classMaterial;uploaded=null;materialDraftId=crypto.randomUUID();view='material';draw();return;}
    if(button.hasAttribute('data-class-share')){view='share';draw();return;}
    if(button.hasAttribute('data-class-connect-drive')){try{await window.EstudiemosCourseDrive.connect(selected);}catch(error){status(error.message,true);}return;}
    if(button.hasAttribute('data-class-copy')){
      const {text}=invitation();
      try{await navigator.clipboard.writeText(text);status('Invitación copiada.');}catch(_){const input=document.createElement('textarea');input.value=text;input.readOnly=true;main.prepend(input);input.focus();input.select();status('Seleccioná y copiá tu invitación.');}return;
    }
    if(button.hasAttribute('data-class-native-share')){const invite=invitation();try{await navigator.share({title:current().title+' · Estudiemos',text:invite.text.replace(invite.url,''),url:invite.url});}catch(error){if(error.name!=='AbortError')status('No pudimos abrir el menú. Podés copiar la invitación.',true);}return;}
    if(button.hasAttribute('data-class-leave'))return confirmAction('¿Salir de esta clase? Sus fechas dejarán de aparecer en tu calendario. Tus anotaciones personales se conservan.',()=>mutate('leave',{},'Saliste de la clase.'));
    if(button.hasAttribute('data-class-delete-course'))return confirmAction('¿Eliminar esta materia para todo el curso? Se quitarán sus fechas, enlaces e inscripciones. No se borran archivos de Google Drive ni anotaciones personales. Esta acción no se puede deshacer.',()=>mutate('delete',{},'Materia eliminada.'));
    if(button.hasAttribute('data-class-archive'))return confirmAction(current().archived?'¿Reactivar esta clase y sus fechas?':'¿Archivar esta clase? Se conserva el contenido, pero sus fechas se ocultan y no se pueden sumar alumnos.',()=>mutate('archive',{archived:!current().archived}));
    if(button.hasAttribute('data-class-rotate'))return confirmAction('¿Cambiar el código? El enlace anterior dejará de admitir alumnos; quienes ya se unieron siguen en la clase.',()=>mutate('rotate',{}));
    if(button.hasAttribute('data-class-delete'))return confirmAction('¿Quitar este contenido de la clase para todos sus alumnos?',()=>mutate(button.dataset.classDelete,{itemId:editing}));
    if(button.hasAttribute('data-class-remove-event'))return confirmAction('¿Quitar esta fecha de la materia para todos?',()=>mutate('event_remove',{itemId:button.dataset.classRemoveEvent}));
    if(button.hasAttribute('data-class-remove-material'))return confirmAction('¿Quitar este archivo de la materia? El original de Drive se conserva.',()=>mutate('material_remove',{itemId:button.dataset.classRemoveMaterial}));
    if(button.hasAttribute('data-class-remove-member'))return confirmAction('¿Quitar a este alumno de la clase?',()=>mutate('member_remove',{itemId:button.dataset.classRemoveMember}));
    if(button.hasAttribute('data-class-calendar')){const date=button.dataset.classCalendar;closeHost();window.dispatchEvent(new CustomEvent('estudiemos:class-calendar',{detail:{date}}));return;}
    if(button.hasAttribute('data-class-pick-drive')){
      try{if(!window.EstudiemosDriveLibrary?.pick)throw new Error('Pegá un enlace de Google Drive.');const version=sequence,item=await window.EstudiemosDriveLibrary.pick();if(item&&version===sequence&&isOpen()&&view==='material'){const form=q('[data-class-form]');form.elements.title.value=item.title.slice(0,120);form.elements.url.value=item.url;}}catch(error){status(error.message,true);}return;
    }
  });
  function onClose(){sequence++;busy=false;uploaded=null;document.querySelectorAll('.classroom-confirm[open]').forEach(node=>node.close());status('');if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});if(!resume){if(view==='join'){joinCode='';autoJoin=false;window.EstudiemosCourseInvitation?.clear();try{sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}}window.dispatchEvent(new CustomEvent('estudiemos:classes-closed'));}}
  dialog.addEventListener('close',onClose);
  async function joinInvitation(){
    const user=window.EstudiemosAccount?.getUser();
    if(!autoJoin||!joinCode||!user||busy||!isOpen())return;
    if(!roles?.get())roles?.set('student');
    if(window.EstudiemosCourseInvitation){const pending=window.EstudiemosCourseInvitation.pending(user.id);if(!pending||pending.code!==joinCode){autoJoin=false;joinCode='';return;}window.EstudiemosCourseInvitation.save(joinCode,user.id,pending.preview);}
    await mutate('join',{code:joinCode},'Ya estás en la materia. Sus fechas están en tu calendario.');
  }
  window.addEventListener('estudiemos:account-change',()=>{sequence++;selected='';detail=null;uploaded=null;document.querySelectorAll('.classroom-confirm[open]').forEach(node=>node.close());view=joinCode?'join':'list';busy=false;draw();lock(false);if((resume||standalone||autoJoin)&&window.EstudiemosAccount?.getUser()){resume=false;showHost();refresh().then(joinInvitation);}});
  window.addEventListener('estudiemos:classes-updated',()=>{if(!isOpen())return;sidebar();if(view==='class'&&!busy){if(!current()){view='list';selected='';draw();}else choose(selected);}});
  window.EstudiemosClassroomUI=Object.freeze({isOpen,open(options={}){
    lastFocus=document.activeElement;status('');joinCode=options.join||joinCode;autoJoin=options.autoJoin===true;
    if(!standalone&&!joinCode)try{const pending=JSON.parse(sessionStorage.getItem(rules.PENDING_KEY)||'null');if(pending?.expires>Date.now()&&(!pending.owner||pending.owner===window.EstudiemosAccount?.getUser()?.id))joinCode=pending.code;else sessionStorage.removeItem(rules.PENDING_KEY);}catch(_){}
    view=joinCode?'join':'list';selected=options.id||'';if(selected&&current())view='class';showHost();draw();
    if(window.EstudiemosAccount?.getUser())refresh().then(()=>{if(!isOpen())return;if(options.id&&current()&&view==='list'){view='class';draw();}if(options.upload&&can('filesAdd')){view='material';editing='';uploaded=null;materialDraftId=crypto.randomUUID();draw();}joinInvitation();});
  }});
})();
