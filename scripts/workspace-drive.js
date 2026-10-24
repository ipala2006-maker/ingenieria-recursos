(function () {
  if (!window.EstudiemosRelease?.enabled('driveWorkspace') || !window.EstudiemosDriveFiles) return;
  const section = document.querySelector('[data-drive-workspace]') || document.querySelector('.workspace-section');
  if (!section) return;
  const rules = window.EstudiemosDriveFiles, $ = selector => section.querySelector(selector);
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons = {
    folder:'<path d="M3 6h6l2 2h10v12H3z"/>', file:'<path d="M6 3h8l4 4v14H6V3zm8 0v5h5M9 12h6m-6 4h6"/>', plus:'<path d="M12 5v14M5 12h14"/>',
    cloud:'<path d="M7 18a5 5 0 0 1-1-10 6 6 0 0 1 11-2 6 6 0 0 1 1 12M12 11v10m-4-6 4-4 4 4"/>', more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>', check:'<path d="m5 12 4 4L19 6"/>', back:'<path d="m14 6-6 6 6 6"/>', refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5M4 13a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';
  const size = value => { const n = Math.max(0,Number(value)||0); return n >= 1073741824 ? (n/1073741824).toFixed(1)+' GB' : n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : Math.ceil(n/1024)+' KB'; };
  let account, owner = '', epoch = 0, enabled = false, configReady = false, initializing = false, browseEnabled = false, connected = false, busy = false, fs, token = '', expiresAt = 0, items = [], current = '', crumbs = [], dialog, returnFocus, query = '', searchTimer, lastLoad = 0, connectAfterLogin = false;
  const body = $('[data-workspace-items]'), state = $('[data-workspace-state]'), status = $('[data-workspace-status]');
  const full = document.body.classList.contains('drive-library-page');
  if (!full && !document.querySelector('[data-drive-library-link]')) {
    const link=document.createElement('a');link.href=new URL('../mi-espacio.html',document.currentScript.src).href;link.className='topbar__link topbar-icon-btn';link.dataset.driveLibraryLink='';link.title='Mi espacio';link.setAttribute('aria-label','Abrir Mi espacio');link.innerHTML=icon('folder');document.querySelector('.topbar__nav')?.appendChild(link);
  }
  const signal = new URL(location.href).searchParams.get('drive');
  if (signal) { const url = new URL(location.href); url.searchParams.delete('drive'); history.replaceState(history.state,'',url.pathname+url.search+url.hash); }
  const band = document.createElement('div'); band.className = 'drive-connection'; band.dataset.driveConnection = '';
  band.innerHTML = `<span class="drive-connection__icon">${icon('cloud')}</span><div><strong>Google Drive</strong><small data-drive-account>Sin conectar</small></div><button type="button" class="workspace-btn drive-browse" data-drive-browse hidden>Mostrar Mi unidad</button><button type="button" class="workspace-tool-icon" data-drive-refresh aria-label="Actualizar archivos de Drive" title="Actualizar archivos">${icon('refresh')}</button><button type="button" class="workspace-tool-icon" data-drive-settings aria-label="Configurar conexi\u00f3n de Drive" title="Conexi\u00f3n de Drive">${icon('more')}</button>`;
  section.querySelector('.workspace-browser').prepend(band); band.hidden = true;
  const toolbar = section.querySelector('.workspace-toolbar');
  const locations=document.createElement('div');locations.className='drive-locations';locations.hidden=true;locations.setAttribute('role','group');locations.setAttribute('aria-label','Ubicaci\u00f3n de Drive');
  locations.innerHTML='<button type="button" data-drive-location="unit">Mi unidad</button><button type="button" data-drive-location="space">Estudiemos</button><span data-drive-readonly hidden>Solo lectura</span>';
  band.after(locations);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-drive-connect]')) connect(browseEnabled);
    if (section.contains(event.target) && event.target.closest('[data-drive-browse]')) connect(true);
    if (event.target.closest('[data-drive-retry]')) configReady?load():initialize();
    if (!section.contains(event.target)) return;
    if (event.target.closest('[data-drive-refresh]') && !busy) load();
    const location=event.target.closest('[data-drive-location]');
    if(location && !busy && fs){current=location.dataset.driveLocation==='unit'?'root':fs.rootId;crumbs=current==='root'?[{id:'root',name:'Mi unidad',writable:false}]:[...(fs.browse?[{id:'root',name:'Mi unidad',writable:false}]:[]),{id:fs.rootId,name:'Estudiemos',writable:true}];query='';$('[data-workspace-search]').value='';loadFiles();return;}
    const target = event.target.closest('[data-workspace-add],[data-workspace-upload],[data-workspace-new-folder],[data-workspace-folder],[data-workspace-open],[data-workspace-menu],[data-workspace-view],[data-drive-settings]');
    if (!target || busy) return;
    if (target.matches('[data-drive-settings]')) connectionSettings();
    if (target.matches('[data-workspace-add]')) addMenu();
    if (target.matches('[data-workspace-upload]')) $('[data-workspace-file-input]')?.click();
    if (target.matches('[data-workspace-new-folder]')) folderForm();
    if (target.matches('[data-workspace-folder]')) navigate(target.dataset.workspaceFolder);
    if (target.matches('[data-workspace-view]')) { body.classList.toggle('is-list',target.dataset.workspaceView==='list'); section.querySelectorAll('[data-workspace-view]').forEach(button => button.setAttribute('aria-pressed',String(button===target))); }
    if (target.matches('[data-workspace-open]')) {
      const item = items.find(item => item.id === target.dataset.workspaceOpen);
      if (item?.mimeType === rules.FOLDER) { crumbs.push({id:item.id,name:item.name,writable:fs.owned(item)}); current=item.id; query=''; $('[data-workspace-search]').value=''; loadFiles(); }
      else if (item) window.open(rules.openUrl(item),'_blank','noopener,noreferrer');
    }
    if (target.matches('[data-workspace-menu]')) itemMenu(items.find(item => item.id === target.dataset.workspaceMenu));
  });
  $('[data-workspace-search]')?.addEventListener('input', event => { query=event.target.value.trim(); clearTimeout(searchTimer); searchTimer=setTimeout(loadFiles,300); });
  $('[data-workspace-sort]')?.addEventListener('change', render);
  const input = document.querySelector('[data-workspace-file-input]');
  input?.addEventListener('change',async () => { const files=Array.from(input.files||[]); input.value=''; await upload(files); });
  const dropzone = $('[data-workspace-dropzone]');
  dropzone?.addEventListener('dragover',event => {if(event.dataTransfer?.types.includes('Files')){event.preventDefault();dropzone.classList.add('is-dragging');}});
  dropzone?.addEventListener('dragleave',() => dropzone.classList.remove('is-dragging'));
  dropzone?.addEventListener('drop',event => {event.preventDefault();dropzone.classList.remove('is-dragging');if(connected)upload(Array.from(event.dataTransfer?.files||[]));});
  function refreshOnReturn(force=false) {if(!initializing&&!busy&&!dialog?.open&&(force||Date.now()-lastLoad>15000)){if(!configReady)initialize();else if(owner&&enabled)load();}}
  window.addEventListener('focus',() => refreshOnReturn());
  document.addEventListener('visibilitychange',() => {if(document.visibilityState==='visible')refreshOnReturn();});
  window.addEventListener('estudiemos:drive-resume',() => refreshOnReturn(true));
  window.addEventListener('estudiemos:account-change',() => { if(account?.getUser()?.id !== owner) initialize(); });
  window.addEventListener('estudiemos-android-ready',render);
  window.addEventListener('estudiemos-android-widget-account-ready',publishNativeWidget);
  initialize();
  window.EstudiemosDriveLibrary=Object.freeze({pick:async()=>{
    if(!fs||!connected||busy)throw new Error('Conectá Google Drive desde Mi espacio, o pegá un enlace de Drive.');
    if(dialog?.open)throw new Error('Cerrá el panel de Drive antes de elegir un material.');
    const picker=modal('Elegir material de Drive','<div class="drive-picker"><div class="drive-picker__head"><button type="button" data-pick-back>Volver</button><strong data-pick-path></strong><button type="button" data-pick-folder>Elegir esta carpeta</button></div><div data-pick-items></div></div>');
    const stack=[{id:fs.browse?'root':fs.rootId,name:fs.browse?'Mi unidad':'Estudiemos'}];let chosen=null,loadVersion=0;
    async function renderPicker(){
      const version=++loadVersion,folder=stack.at(-1),list=picker.querySelector('[data-pick-items]');
      picker.querySelector('[data-pick-path]').textContent=folder.name;picker.querySelector('[data-pick-back]').disabled=stack.length===1;picker.querySelector('[data-pick-folder]').hidden=folder.id==='root';list.textContent='Cargando…';
      try{const files=await fs.list(folder.id);if(version!==loadVersion||!picker.open)return;list.replaceChildren();
        for(const file of files){const button=document.createElement('button');button.type='button';button.textContent=(file.mimeType===rules.FOLDER?'Carpeta · ':'')+file.name;button.addEventListener('click',()=>{if(file.mimeType===rules.FOLDER){stack.push({id:file.id,name:file.name});renderPicker();}else{chosen={title:file.name,url:rules.openUrl(file)};picker.close();}});list.append(button);}
        if(!files.length)list.textContent='Esta carpeta está vacía.';
      }catch(error){if(picker.open)list.textContent=error.message;}
    }
    picker.querySelector('[data-pick-back]').onclick=()=>{if(stack.length>1){stack.pop();renderPicker();}};
    picker.querySelector('[data-pick-folder]').onclick=()=>{const folder=stack.at(-1);chosen={title:folder.name,url:'https://drive.google.com/drive/folders/'+folder.id};picker.close();};
    const result=new Promise(resolve=>picker.addEventListener('close',()=>{loadVersion++;resolve(chosen);},{once:true}));renderPicker();return result;
  }});

  function message(text='',error=false) {status.textContent=text;status.dataset.type=error?'error':'success';}
  function currentUser(id,version) {return owner===id && epoch===version && account?.getUser()?.id===id;}
  function clear() {epoch++; busy=false;token='';expiresAt=0;fs=null;connected=false;items=[];current='';crumbs=[];query='';body.replaceChildren();band.hidden=true;locations.hidden=true;section.removeAttribute('aria-busy');band.querySelector('[data-drive-account]').textContent='Sin conectar';$('[data-workspace-breadcrumbs]')?.replaceChildren();if($('[data-workspace-search]'))$('[data-workspace-search]').value='';dialog?.close();dialog?.replaceChildren();returnFocus=null;}
  function show(title,copy,action='') {
    body.hidden=true;state.hidden=false;state.innerHTML=`<span class="drive-state-icon">${icon('cloud')}</span><h3>${escape(title)}</h3><p>${escape(copy)}</p>${action}`;
    toolbar.hidden=true; section.querySelector('[data-workspace-add]')?.setAttribute('disabled','');
  }
  function renderDisconnected() {
    band.hidden=true;locations.hidden=true;
    const native=Boolean(window.EstudiemosAndroid);
    show('Tus apuntes, en tu Drive',browseEnabled?'Mi unidad se muestra en modo lectura. El contenido de tus archivos previos no se copia a Estudiemos.':'Acceso solo a los archivos de Estudiemos. Tu Drive y tus documentos siguen siendo tuyos.',`<button type="button" class="workspace-btn workspace-btn--primary drive-connect" data-drive-connect ${enabled||!owner?'':'disabled'}>${icon('cloud')}<span>${!owner?'Iniciar sesión para conectar Drive':enabled ? native ? 'Conectar desde el navegador' : 'Conectar Google Drive' : 'Conexión no habilitada para esta cuenta'}</span></button>${enabled?'<small class="drive-consent-note">Eleg\u00eds tu cuenta y autoriz\u00e1s el acceso en Google.</small>':''}`);
  }
  async function initialize() {
    clear(); enabled=false;configReady=false;initializing=true;lastLoad=Date.now();show('Preparando tu Drive…','');const initialEpoch=epoch;account=window.EstudiemosAccount;
    if (!account) { await new Promise(resolve => { const timer=setTimeout(resolve,10000);window.addEventListener('estudiemos:account-ready',()=>{clearTimeout(timer);resolve();},{once:true}); }); account=window.EstudiemosAccount; }
    if (!account) {initializing=false;return show('No pudimos preparar Mi espacio','Revis\u00e1 tu conexi\u00f3n.', '<button class="workspace-btn" data-drive-retry>Reintentar</button>');}
    await account.whenReady();if(initialEpoch!==epoch)return; owner=account.getUser()?.id||'';
    const id=owner, version=epoch;
    try {
      const session=account.getSession();
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);let config;
      try{const response=await fetch('/api/account-config?drive=config',{signal:controller.signal,cache:'no-store',credentials:'same-origin',headers:owner&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{}});if(!response.ok)throw new Error('No pudimos comprobar la conexión de Drive.');config=await response.json();if(typeof config.enabled!=='boolean')throw new Error('La conexión de Drive no respondió correctamente.');}finally{clearTimeout(timeout);}
      if(epoch!==version)return;configReady=true;enabled=config.enabled===true;browseEnabled=config.browseEnabled===true;
      if (!owner || !enabled) return renderDisconnected();
      if (connectAfterLogin) {connectAfterLogin=false;return connect(browseEnabled);}
      await load();
      if (signal==='cancelled')message('No se conect\u00f3 Drive. Pod\u00e9s hacerlo m\u00e1s adelante.');
      if (signal==='error')message('Google no complet\u00f3 la conexi\u00f3n. Volv\u00e9 a intentar.',true);
    } catch(error) {if(epoch===version){show('No pudimos conectar con Drive','Tus archivos siguen en Google Drive. Volvé a intentar sin desconectar tu cuenta.','<button class="workspace-btn" data-drive-retry>Reintentar</button>');message(error.name==='AbortError'?'La conexión tardó demasiado. Volvé a intentar.':error.message,true);}}
    finally{if(epoch===version)initializing=false;}
  }
  async function api(action,method='POST',values={}) {
    const id=owner,version=epoch, session=account?.getSession();
    if(!session?.access_token || !id)throw new Error('Ingres\u00e1 a tu cuenta de Estudiemos.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    let response;
    try {response=await fetch('/api/account-config?drive='+action,{method,headers:{Authorization:'Bearer '+session.access_token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(values)}:{}),cache:'no-store',credentials:'same-origin',signal:controller.signal});}
    finally {clearTimeout(timer);}
    const result=await response.json().catch(()=>({}));
    if(!currentUser(id,version))throw new Error('La cuenta cambi\u00f3.');
    if(!response.ok){const error=new Error(result.message||'No pudimos conectar con Drive.');error.code=result.code;throw error;}
    return result;
  }
  async function connect(browse=false) {
    if(busy)return;
    if(!owner){connectAfterLogin=true;return account?.open();}
    if(!enabled)return;
    if(window.EstudiemosAndroid){
      lastLoad=0;
      window.EstudiemosAndroid.postMessage(JSON.stringify({type:'drive-connect-browser'}));
      message('Complet\u00e1 la conexi\u00f3n en Chrome y volv\u00e9 a la app. Si no se abre, actualiz\u00e1 Estudiemos o abr\u00ed estudiemos-app.vercel.app/mi-espacio.html en Chrome.');return;
    }
    busy=true;section.querySelectorAll('[data-drive-connect]').forEach(button=>{button.disabled=true;button.querySelector('span').textContent='Abriendo Google...';});
    try {const result=await api('start','POST',{browse:browse===true && browseEnabled});const url=new URL(result.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw new Error('No se pudo abrir Google.');location.assign(url.href);}
    catch(error){busy=false;renderDisconnected();message(error.message,true);}
  }
  async function access(force=false) {
    if(!force && token && expiresAt>Date.now()+120000)return token;
    const result=await api('token','POST',{force});token=result.accessToken;expiresAt=result.expiresAt;return token;
  }
  async function load() {
    if(busy)return;busy=true;lastLoad=Date.now();const id=owner,version=epoch;
    if(!fs)show('Abriendo tu espacio...','');section.setAttribute('aria-busy','true');message('');
    try {
      const result=await api('status','GET');if(!result.connected){publishNativeWidget(false);connected=false;token='';expiresAt=0;fs=null;items=[];body.replaceChildren();return renderDisconnected();}
      if(!fs || fs.browse !== (result.browse===true)){token='';expiresAt=0;const candidate=new rules.DriveFiles({userId:id,getToken:access,isCurrent:()=>currentUser(id,version),browse:result.browse===true});await candidate.initialize();if(!currentUser(id,version))return;fs=candidate;current=fs.browse?'root':fs.rootId;crumbs=[{id:current,name:fs.browse?'Mi unidad':'Mi espacio',writable:!fs.browse}];}
      items=await fs.list(current,query);if(!currentUser(id,version))return;
      connected=true;busy=false;render();
    }catch(error){if(currentUser(id,version)){if(error.code==='DRIVE_CONNECT_REQUIRED'){publishNativeWidget(false);connected=false;token='';fs=null;renderDisconnected();}else {if(error.status===404)fs=null;show('No pudimos abrir tu Drive','Tus archivos no se modificaron.','<button class="workspace-btn" data-drive-retry>Reintentar</button>');}message(error.message,true);}}
    finally{if(currentUser(id,version)){busy=false;section.removeAttribute('aria-busy');}}
  }
  async function loadFiles() {
    if(!fs||!connected||busy)return;busy=true;const id=owner,version=epoch;
    try{const result=await fs.list(current,query);if(!currentUser(id,version))return;items=result;busy=false;render();}
    catch(error){if(currentUser(id,version))message(error.message,true);}finally{if(currentUser(id,version))busy=false;}
  }
  function render() {
    if(!connected || !fs)return renderDisconnected();
    toolbar.hidden=false;band.hidden=false;state.hidden=true;body.hidden=false;
    const writable=current===fs.rootId || crumbs.at(-1)?.writable===true;
    section.querySelector('[data-workspace-add]')?.toggleAttribute('disabled',!writable);
    locations.hidden=!fs.browse;locations.querySelector('[data-drive-readonly]').hidden=writable;
    locations.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.driveLocation===(crumbs.some(part=>part.id===fs.rootId)?'space':'unit'))));
    band.querySelector('[data-drive-browse]').hidden=!browseEnabled||fs.browse;
    band.querySelector('[data-drive-account]').textContent=fs.about?.user?.emailAddress||'Conectado';
    const quota=fs.about?.storageQuota, free=quota?.limit?Math.max(0,Number(quota.limit)-Number(quota.usage||0)):null;
    band.querySelector('strong').textContent=free===null?'Google Drive':'Google Drive \u00b7 '+size(free)+' disponibles';
    $('[data-workspace-breadcrumbs]').innerHTML=crumbs.map((part,index)=>`${index?'<span aria-hidden="true">/</span>':''}<button type="button" data-workspace-folder="${escape(part.id)}">${escape(part.name)}</button>`).join('');
    const sort=$('[data-workspace-sort]')?.value||'updated';
    const visible=[...items].sort((a,b)=>Number(b.mimeType===rules.FOLDER)-Number(a.mimeType===rules.FOLDER)||(sort==='name'?a.name.localeCompare(b.name,'es'):sort==='type'?a.mimeType.localeCompare(b.mimeType):new Date(b.modifiedTime)-new Date(a.modifiedTime)));
    body.innerHTML=visible.map(item=>`<article class="workspace-item"><button class="workspace-item__open" type="button" data-workspace-open="${escape(item.id)}" aria-label="Abrir ${escape(item.name)}"><span class="workspace-item__icon">${icon(item.mimeType===rules.FOLDER?'folder':'file')}</span><span class="workspace-item__copy"><span class="workspace-item__name" title="${escape(item.name)}">${escape(item.name)}</span><span class="workspace-item__meta">${item.mimeType===rules.FOLDER?'Carpeta':size(item.size)}${!fs.owned(item)?' · Solo lectura':''}</span></span></button>${fs.owned(item)&&item.id!==fs.rootId?`<button class="workspace-item__menu" data-workspace-menu="${escape(item.id)}" type="button" aria-label="Opciones de ${escape(item.name)}" title="Opciones">${icon('more')}</button>`:''}</article>`).join('')+(writable?`<button class="workspace-add-tile" data-workspace-add type="button">${icon('plus')}<span>${query?'Agregar archivo':'Agregar'}<small>Carpeta o archivo</small></span></button>`:'');
    if(!visible.length&&!writable)body.innerHTML='<p class="drive-empty">'+(query?'No encontramos archivos con ese nombre.':'Esta carpeta est\u00e1 vac\u00eda.')+'</p>';
    if(query&&!visible.length)message('No encontramos archivos con ese nombre.');
    publishNativeWidget();
  }
  function publishNativeWidget(available=connected) {
    if(available!==false)available=connected;
    if(!window.EstudiemosAndroidDriveWidget||!window.EstudiemosAndroid?.postMessage||!owner||account?.getUser()?.id!==owner)return;
    if(available&&(busy||!fs||query||![fs.rootId,'root'].includes(current)))return;
    const payload=window.EstudiemosDriveWidget?.snapshot(owner,available,items,current==='root'?'unit':'space');
    if(payload)window.EstudiemosAndroid.postMessage(JSON.stringify(payload));
  }
  function navigate(id) {const index=crumbs.findIndex(part=>part.id===id);if(index<0)return;current=id;crumbs=crumbs.slice(0,index+1);query='';$('[data-workspace-search]').value='';loadFiles();}
  function modal(title,content) {
    if(!dialog){dialog=document.createElement('dialog');dialog.className='drive-dialog';dialog.setAttribute('aria-labelledby','driveDialogTitle');document.body.appendChild(dialog);dialog.addEventListener('click',event=>{if(event.target.closest('[data-drive-close]'))dialog.close();});dialog.addEventListener('close',()=>returnFocus?.isConnected&&returnFocus.focus());}
    returnFocus=document.activeElement;
    dialog.innerHTML=`<header><h2 id="driveDialogTitle">${escape(title)}</h2><button type="button" data-drive-close aria-label="Cerrar">${icon('close')}</button></header>${content}<p data-drive-dialog-status role="status"></p>`;
    if(!dialog.open)dialog.showModal();return dialog;
  }
  function addMenu() {const d=modal('Agregar a Mi espacio',`<div class="drive-actions"><button type="button" data-drive-add-folder>${icon('folder')}Nueva carpeta</button><button type="button" data-drive-add-file>${icon('cloud')}Subir archivos</button></div>`);d.querySelector('[data-drive-add-folder]').onclick=folderForm;d.querySelector('[data-drive-add-file]').onclick=()=>{d.close();input.click();};}
  function formDialog(title,label,value,submit) {
    const d=modal(title,`<form><label>${label}<input name="name" maxlength="120" value="${escape(value)}" required autocomplete="off"></label><footer><button type="button" data-drive-close>Cancelar</button><button type="submit" class="workspace-btn workspace-btn--primary">Guardar</button></footer></form>`);
    d.querySelector('form').addEventListener('submit',event=>{event.preventDefault();mutate(()=>submit(d.querySelector('input').value));});d.querySelector('input').focus();
  }
  function folderForm() {formDialog('Nueva carpeta','Nombre','',value=>fs.createFolder(value,current));}
  function itemMenu(item) {
    if(!item || !fs.owned(item) || item.id===fs.rootId)return;const d=modal(item.name,`<div class="drive-actions"><button type="button" data-drive-rename>Cambiar nombre</button><button type="button" data-drive-move>Mover a otra carpeta</button><button type="button" data-drive-trash>Enviar a la papelera de Drive</button></div>`);
    d.querySelector('[data-drive-rename]').onclick=()=>formDialog('Cambiar nombre','Nombre',item.name,value=>fs.rename(item.id,value));
    d.querySelector('[data-drive-move]').onclick=()=>moveForm(item);
    d.querySelector('[data-drive-trash]').onclick=()=>{const confirmation=modal('Enviar a la papelera',`<p>${escape(item.name)} quedar\u00e1 en la papelera de Google Drive, donde pod\u00e9s recuperarlo.</p><footer><button type="button" data-drive-close>Cancelar</button><button type="button" data-drive-trash-confirm>Enviar a la papelera</button></footer>`);confirmation.querySelector('[data-drive-trash-confirm]').onclick=()=>mutate(()=>fs.trash(item.id));};
  }
  async function moveForm(item) {
    try {
      const version=epoch,folders=await fs.folders();if(version!==epoch)return;
      const d=modal('Mover '+item.name,`<form><label>Carpeta de destino<select name="parent"><option value="${escape(fs.rootId)}">Mi espacio</option>${folders.filter(folder=>folder.id!==item.id).map(folder=>`<option value="${escape(folder.id)}">${escape(folder.name)}</option>`).join('')}</select></label><footer><button type="button" data-drive-close>Cancelar</button><button type="submit">Mover</button></footer></form>`);
      d.querySelector('form').onsubmit=event=>{event.preventDefault();mutate(()=>fs.move(item.id,d.querySelector('select').value));};
    }catch(error){message(error.message,true);}
  }
  async function mutate(action) {
    if(busy)return;busy=true;const id=owner,version=epoch;
    dialog?.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await action();if(!currentUser(id,version))return;dialog?.close();busy=false;await loadFiles();message('Cambios guardados en tu Drive.');}
    catch(error){if(currentUser(id,version)){const target=dialog?.open?dialog.querySelector('[data-drive-dialog-status]'):status;target.textContent=error.message;}}
    finally{if(currentUser(id,version)){busy=false;dialog?.querySelectorAll('button').forEach(button=>button.disabled=false);}}
  }
  async function upload(files) {
    if(busy||!connected||!fs||!files.length)return;
    if(current!==fs.rootId && crumbs.at(-1)?.writable!==true)return message('Abr\u00ed la carpeta Estudiemos para subir archivos. Esta ubicaci\u00f3n es de solo lectura.',true);
    try{files.forEach(rules.fileCheck);}catch(error){return message(error.message,true);}
    busy=true;const id=owner,version=epoch,parent=current,provider=fs;let done=0;const failed=[];
    for(const file of files){if(!currentUser(id,version))break;try{await provider.upload(file,parent,percent=>{if(currentUser(id,version))message('Subiendo '+file.name+' \u00b7 '+percent+'%');});done++;}catch(error){failed.push(file.name+': '+error.message);}}
    if(!currentUser(id,version))return;busy=false;await loadFiles();message(failed.length?`${done} subidos. ${failed.join(' ')}`:`${done===1?'Archivo subido':done+' archivos subidos'} a tu Drive.`,Boolean(failed.length));
  }
  function connectionSettings() {
    const d=modal('Tu Google Drive',`<p>${escape(fs?.about?.user?.emailAddress||'Cuenta conectada')}</p><p>Desconectar no elimina tus carpetas ni archivos. La conexi\u00f3n se quitar\u00e1 de tu cuenta de Estudiemos en todos tus dispositivos.</p><footer><button type="button" data-drive-close>Volver</button><button type="button" data-drive-disconnect>Desconectar Drive</button></footer>`);
    d.querySelector('[data-drive-disconnect]').onclick=async()=>{if(busy)return;busy=true;try{await api('disconnect');publishNativeWidget(false);clear();busy=false;renderDisconnected();message('Drive desconectado. Tus archivos siguen en Google Drive.');}catch(error){busy=false;d.querySelector('[data-drive-dialog-status]').textContent=error.message;}};
  }
})();
