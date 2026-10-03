(function () {
  if (window.EstudiemosFriends || location.pathname.endsWith('/widget.html')) return;
  const root = new URL('../', document.currentScript.src);
  const endpoint = new URL('api/account-config?friends=1', root);
  const css = document.createElement('link'); css.rel='stylesheet'; css.href=new URL('styles/friends.css?v=20261003-identity',root); document.head.append(css);
  const pendingKey='estudiemos_friend_invite_v2';
  let model=null,busy=false,epoch=0,owner='',lastFocus=null,panel='friends',view='all',resumeLogin=false,notice='';
  let memoryPending=null;
  function account(){return window.EstudiemosAccount;}
  function pending(){
    try{memoryPending=JSON.parse(localStorage.getItem(pendingKey));}catch(_){}
    if(!memoryPending || !/^[a-f0-9]{32}$/.test(memoryPending.token) || !(memoryPending.expires>Date.now())){clearPending();return null;}
    return memoryPending;
  }
  function savePending(value){memoryPending=value;try{localStorage.setItem(pendingKey,JSON.stringify(value));}catch(_){} }
  function clearPending(token){
    let stored=memoryPending;try{stored=JSON.parse(localStorage.getItem(pendingKey))||stored;}catch(_){}
    if(token && stored?.token!==token)return;
    memoryPending=null;try{localStorage.removeItem(pendingKey);}catch(_){}
  }
  function remember(token){savePending({token,expires:Date.now()+86400000,userId:account()?.getUser()?.id||''});}
  function inviteToken(value){
    try{const link=new URL(value,root);const token=new URLSearchParams(link.hash.slice(1)).get('friend')||link.searchParams.get('friend');return link.origin===root.origin && /^[a-f0-9]{32}$/.test(token||'')?token:'';}catch(_){return '';}
  }
  function captureInvitation(){
    const url=new URL(location.href),token=inviteToken(url.href);if(!token)return false;
    remember(token);url.searchParams.delete('friend');
    const hash=new URLSearchParams(url.hash.slice(1));if(hash.has('friend')){hash.delete('friend');url.hash=hash.toString();}
    history.replaceState(history.state,'',url);return true;
  }
  const hasInvitation=captureInvitation();
  const icon=name=>`<img src="${new URL(`assets/icons/${name}.svg`,root)}" alt="" width="20" height="20">`;
  const dialog=document.createElement('dialog');dialog.className='friends-dialog';dialog.setAttribute('aria-labelledby','friendsTitle');
  dialog.innerHTML=`<header class="friends-head"><div><h2 id="friendsTitle">Amigos</h2><span data-count>Tu círculo de estudio</span></div><div class="friends-actions">
    <button type="button" class="friends-icon" data-invite-toggle aria-label="Agregar amigos" title="Agregar amigos" aria-expanded="false">${icon('plus')}</button>
    <button type="button" class="friends-icon" data-settings-toggle aria-label="Mi nombre y privacidad" title="Mi nombre y privacidad" aria-expanded="false">${icon('settings-2')}</button>
    <button type="button" class="friends-icon" data-close aria-label="Cerrar amigos" title="Cerrar">${icon('x')}</button></div></header>
    <p data-status role="status" aria-live="polite" hidden></p><button type="button" data-retry hidden>Volver a intentar</button>
    <section data-signed-out hidden><h3>Conectá con tu grupo</h3><p>Iniciá sesión para enviar la solicitud y ver a tus amigos.</p><button type="button" class="friends-primary" data-login>Iniciar sesión</button></section>
    <div data-content hidden>
      <button type="button" class="friends-back" data-back hidden>${icon('arrow-left')} Mis amigos</button>
      <section data-panel="invite" hidden><h3>Agregar amigos</h3>
        <form data-contact-form><label for="friendContact">Usuario o correo de tu amigo</label><div class="friends-inline"><input id="friendContact" type="text" maxlength="254" placeholder="@usuario o nombre@correo.com" autocomplete="off" autocapitalize="none" spellcheck="false" required><button type="submit">Enviar solicitud</button></div></form>
        <p class="friends-caption">La solicitud aparece en Amigos de su cuenta de Estudiemos.</p>
        <div class="friends-invite-divider"><span>O compartí tu enlace</span></div><p class="friends-caption">Al abrirlo e iniciar sesión, se envía la solicitud automáticamente. Solo queda aceptarla.</p>
        <button type="button" class="friends-primary friends-copy" data-copy>${icon('link')} Copiar mi invitación</button><input data-my-link readonly aria-label="Tu enlace de invitación">
      </section>
      <section data-panel="settings" hidden><h3>Mi nombre y privacidad</h3><form data-profile>
        <label for="friendName">Nombre de usuario</label><input id="friendName" minlength="3" maxlength="25" pattern="@?[A-Za-z0-9_]{3,24}" required autocomplete="nickname" autocapitalize="none" spellcheck="false" aria-describedby="friendUsernameHint" placeholder="@tu_usuario">
        <small id="friendUsernameHint" class="friends-caption">Es el nombre que ven tus amigos y tambien tu @usuario. Usá 3–24 letras sin tildes, números o guion bajo.</small>
        <label class="friends-toggle"><span>Compartir mi racha<small>Solo con amigos aceptados. Podés ocultarla cuando quieras.</small></span><input type="checkbox" role="switch" data-share></label>
        <button type="submit">Guardar cambios</button><button type="button" data-rotate>Cambiar enlace de invitación</button>
      </form><div data-blocked></div></section>
      <section data-panel="friends"><section data-requests hidden><h3>Solicitudes <span data-request-count></span></h3><div data-incoming></div><div data-outgoing></div></section>
        <div class="friends-section-head"><div class="friends-views" role="group" aria-label="Vista de amigos"><button type="button" data-view="all" aria-pressed="true">Todos</button><button type="button" data-view="ranking" aria-pressed="false">Ranking</button></div><button type="button" class="friends-icon" data-refresh aria-label="Actualizar amigos" title="Actualizar">${icon('refresh-cw')}</button></div>
        <label data-search hidden>Buscar amigos<input id="friendSearch" type="search" placeholder="Nombre o @usuario" autocomplete="off"></label>
        <p class="friends-caption" data-ranking-caption hidden>Días consecutivos · Solo rachas compartidas</p><ol class="friends-list" data-list></ol>
      </section>
    </div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s);
  const status=(value,error=false)=>{q('[data-status]').textContent=value;q('[data-status]').hidden=!value;q('[data-status]').classList.toggle('is-error',error);q('[data-retry]').hidden=!error;};
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  const button=(label,callback)=>{const b=text('button',label);b.type='button';b.disabled=busy;b.addEventListener('click',callback);return b;};
  function lock(value){busy=value;dialog.querySelectorAll('button:not([data-close]),input').forEach(n=>n.disabled=value);}
  function showPanel(value){panel=value;dialog.querySelectorAll('[data-panel]').forEach(n=>n.hidden=n.dataset.panel!==value);q('[data-back]').hidden=value==='friends';q('[data-invite-toggle]').setAttribute('aria-expanded',String(value==='invite'));q('[data-settings-toggle]').setAttribute('aria-expanded',String(value==='settings'));}
  async function call(action,data={}) {
    const session=account()?.getSession();if(!session?.access_token)throw new Error('Iniciá sesión para continuar.');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(endpoint,{method:action?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(action?{'Content-Type':'application/json'}:{})},body:action?JSON.stringify({action,...data}):undefined,signal:controller.signal,cache:'no-store'});
      const result=await response.json();if(!response.ok){const error=new Error(result.message||'No pudimos guardar el cambio.');error.status=response.status;throw error;}return result;
    }finally{clearTimeout(timeout);}
  }
  async function refresh(action,data,message='') {
    if(busy)return;
    const current=++epoch,user=account()?.getUser()?.id,pendingAtStart=pending()?.token;
    if(!user){q('[data-content]').hidden=true;q('[data-signed-out]').hidden=false;return;}
    owner=user;lock(true);status(action?'Guardando…':'Actualizando…');
    try {
      let result=await call(action,data);
      if(current!==epoch || account()?.getUser()?.id!==user)return;
      const invitation=!action && pending();
      if(invitation){
        if(invitation.userId && invitation.userId!==user){clearPending(invitation.token);notice='Volvé a abrir la invitación con esta cuenta.';}
        else if(invitation.token===result.me.invite){clearPending(invitation.token);notice='Este es tu propio enlace. Compartilo con otra persona.';showPanel('invite');}
        else {
          // Bind before sending so a pending invitation cannot switch accounts during login.
          savePending({...invitation,userId:user});status('Enviando solicitud…');
          const previous=new Set(result.outgoing.map(p=>p.id));
          try{result=await call('request',{invite:invitation.token});}catch(error){if(error.status===400)clearPending(invitation.token);throw error;}
          if(current!==epoch || account()?.getUser()?.id!==user)return;
          clearPending(invitation.token);showPanel('friends');
          notice=result.outgoing.some(p=>!previous.has(p.id))?'Solicitud enviada. Tu amigo tiene que aceptarla.':'Esta invitación ya estaba procesada. Revisá tus amigos y solicitudes.';
        }
      }
      if(message)notice=message;
      if(action==='request_email'||action==='request_username'){
        q('#friendContact').value='';showPanel('friends');
        notice='Si corresponde a una cuenta confirmada y disponible, recibirá tu solicitud en Amigos. Si ya había una solicitud, no se duplica.';
      }
      model=result;draw();status(notice);
    }catch(error){if(current===epoch)status(error.name==='AbortError'?'La conexión tardó demasiado. Volvé a intentar.':error.message,true);}
    finally{
      if(current===epoch){lock(false);const next=pending();if(next && next.token!==pendingAtStart && model && !q('[data-status]').classList.contains('is-error'))queueMicrotask(()=>refresh());}
    }
  }
  function avatar(name){return text('span',name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]||'').join('').toLocaleUpperCase(),'friends-avatar');}
  function normalizeHandle(value){return String(value||'').trim().toLocaleLowerCase().replace(/^@/,'');}
  function visibleHandle(person){return person.username?`@${person.username}`:person.name;}
  function identity(person){const node=text('div','','friends-person');node.append(text('strong',visibleHandle(person)+(person.self?' (vos)':'')));return node;}
  function drawList(){
    if(!model)return;
    const list=q('[data-list]');list.replaceChildren();
    const rows=view==='ranking'?model.friends.filter(p=>p.share):[...model.friends];if(view==='ranking' && model.me.share)rows.push({...model.me,self:true});
    rows.sort((a,b)=>(view==='ranking'?(b.streak||0)-(a.streak||0):0)||a.name.localeCompare(b.name));
    const query=q('#friendSearch').value.trim().toLocaleLowerCase();let rank=0,last=-1;
    rows.forEach((friend,index)=>{
      if(friend.streak!==last){rank=index+1;last=friend.streak;}
      if(query && !friend.name.toLocaleLowerCase().includes(query) && !('@'+(friend.username||'')).includes(query))return;
      const row=document.createElement('li');row.className='friends-row';
      row.append(view==='ranking'?text('span',String(rank),'friends-rank'):avatar(friend.name));
      const person=identity(friend);person.append(text('span',friend.share?`${friend.streak} ${friend.streak===1?'día':'días'} de racha`:'Racha privada'));row.append(person);
      if(!friend.self){const more=document.createElement('details');more.className='friends-row-menu';const summary=text('summary','•••');summary.setAttribute('aria-label',`Opciones de ${friend.name}`);more.append(summary,button('Quitar',()=>confirmAction('remove',friend)),button('Bloquear',()=>confirmAction('block',friend)));row.append(more);}
      list.append(row);
    });
    if(!list.children.length){const empty=text('li','','friends-empty');
      if(query)empty.append(text('p','No encontramos ese nombre.'));
      else if(view==='ranking')empty.append(text('strong','Todavía no hay rachas compartidas.'),text('p','Cada amigo elige si quiere compartir la suya.'));
      else{const img=document.createElement('img');img.src=new URL('assets/icons/users-round.svg',root);img.alt='';img.width=40;img.height=40;empty.append(img,text('strong','Tu grupo empieza acá'),text('p','Estudiar se siente mejor acompañado.'),button('Invitar a un amigo',()=>showPanel('invite')));}
      list.append(empty);
    }
    q('[data-ranking-caption]').hidden=view!=='ranking';dialog.querySelectorAll('[data-view]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.view===view)));
  }
  function draw(){
    q('[data-signed-out]').hidden=true;q('[data-content]').hidden=false;
    q('#friendName').value=model.me.username||normalizeHandle(model.me.name);q('[data-share]').checked=model.me.share;q('[data-my-link]').value=new URL(`#friend=${model.me.invite}`,root).href;
    q('[data-count]').textContent=`${model.friends.length} ${model.friends.length===1?'amigo':'amigos'}`;q('[data-search]').hidden=model.friends.length<6;
    drawList();
    const count=model.incoming.length+model.outgoing.length;q('[data-requests]').hidden=!count;q('[data-request-count]').textContent=String(count);
    const incoming=q('[data-incoming]'),outgoing=q('[data-outgoing]');incoming.replaceChildren();outgoing.replaceChildren();
    for(const p of model.incoming){const row=text('div','','friends-request');const actions=text('div','','friends-request-actions');const accept=button('Aceptar',()=>refresh('accept',{id:p.id},'Solicitud aceptada.'));accept.className='friends-primary';const more=document.createElement('details');more.className='friends-row-menu';const summary=text('summary','•••');summary.setAttribute('aria-label',`Opciones de la solicitud de ${p.name}`);more.append(summary,button('Rechazar',()=>refresh('decline',{id:p.id},'Solicitud rechazada.')),button('Bloquear',()=>confirmAction('block',p)));actions.append(accept,more);row.append(avatar(p.name),identity(p),actions);incoming.append(row);}
    for(const p of model.outgoing){const row=text('div','','friends-request');const person=identity(p);person.append(text('span','Solicitud enviada'));row.append(avatar(p.name),person,button('Cancelar',()=>refresh('decline',{id:p.id},'Solicitud cancelada.')));outgoing.append(row);}
    const blocked=q('[data-blocked]');blocked.replaceChildren();if(model.blocked.length)blocked.append(text('h3','Bloqueados'));
    for(const p of model.blocked){const row=text('div','','friends-inline');row.append(text('span',p.name),button('Desbloquear',()=>refresh('unblock',{id:p.id},'Usuario desbloqueado.')));blocked.append(row);}
  }
  function confirmAction(action,person){if(confirm(action==='block'?`¿Bloquear a ${person.name}? Se quitará la amistad y no podrá enviarte solicitudes.`:`¿Quitar a ${person.name} de tus amigos?`))refresh(action,{id:person.id},action==='block'?'Usuario bloqueado.':'Amigo eliminado.');}
  async function open(){
    if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();}
    await account()?.whenReady?.();await refresh();
  }
  q('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>lastFocus?.focus());
  q('[data-login]').onclick=()=>{resumeLogin=true;dialog.close();account()?.open();};
  q('[data-invite-toggle]').onclick=()=>showPanel(panel==='invite'?'friends':'invite');q('[data-settings-toggle]').onclick=()=>showPanel(panel==='settings'?'friends':'settings');q('[data-back]').onclick=()=>{notice='';status('');showPanel('friends');};
  dialog.querySelectorAll('[data-view]').forEach(n=>n.onclick=()=>{view=n.dataset.view;drawList();});q('#friendSearch').oninput=drawList;
  q('[data-refresh]').onclick=()=>{notice='';refresh();};q('[data-retry]').onclick=()=>refresh();
  q('[data-profile]').onsubmit=e=>{e.preventDefault();const username=normalizeHandle(q('#friendName').value);refresh('profile',{name:username,username,share:q('[data-share]').checked,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'},'Nombre y privacidad guardados.');};
  q('[data-contact-form]').onsubmit=e=>{e.preventDefault();const value=q('#friendContact').value.trim();if(value.indexOf('@')>0)refresh('request_email',{email:value});else refresh('request_username',{username:value});};
  q('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(q('[data-my-link]').value);status('Enlace copiado.');}catch(_){q('[data-my-link]').select();status('Seleccioné tu enlace para que puedas copiarlo.');}};
  q('[data-rotate]').onclick=()=>{if(confirm('¿Cambiar tu enlace? Los anteriores dejarán de permitir nuevas solicitudes. Tus amigos actuales no cambian.'))refresh('rotate',{},'Enlace de invitación actualizado.');};
  function accountChanged(){
    const next=account()?.getUser()?.id||'';
    if(next!==owner){owner=next;epoch++;model=null;notice='';lock(false);q('[data-content]').hidden=true;q('[data-list]').replaceChildren();q('#friendName').value='';q('#friendContact').value='';q('[data-my-link]').value='';q('#friendSearch').value='';q('[data-count]').textContent='Tu círculo de estudio';showPanel('friends');status('');}
    if(next && (resumeLogin||pending())){resumeLogin=false;open();}else if(dialog.open)refresh();
  }
  window.addEventListener('estudiemos:account-change',accountChanged);window.addEventListener('estudiemos:account-ready',accountChanged);
  window.addEventListener('hashchange',()=>{if(captureInvitation())open();});
  window.addEventListener('popstate',()=>{if(captureInvitation())open();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && !busy){if(pending())open();else if(dialog.open && panel==='friends')refresh();}});
  setInterval(()=>{if(dialog.open&&!document.hidden&&!busy&&panel==='friends'&&!dialog.querySelector('form:focus-within,details[open]')&&!q('[data-status]').classList.contains('is-error'))refresh();},60000);
  window.EstudiemosFriends={open};
  const nav=document.querySelector('.topbar__nav');if(nav){const trigger=button('',open);trigger.className='topbar__link topbar-icon-btn';trigger.dataset.friendsOpen='';trigger.title='Amigos';trigger.setAttribute('aria-label','Amigos');trigger.innerHTML=icon('users-round');nav.append(trigger);}
  if(hasInvitation||pending())open();
})();
