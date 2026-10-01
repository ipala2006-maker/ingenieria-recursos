(function () {
  if (window.EstudiemosFriends || location.pathname.endsWith('/widget.html')) return;
  const root = new URL('../', document.currentScript.src);
  const endpoint = new URL('api/account-config?friends=1', root);
  const css = document.createElement('link'); css.rel='stylesheet'; css.href=new URL('styles/friends.css?v=20261001',root); document.head.append(css);
  const pendingKey='estudiemos_friend_invite';
  const url=new URL(location.href);
  const invitation=new URLSearchParams(url.hash.slice(1)).get('friend') || url.searchParams.get('friend');
  if (/^[a-f0-9]{32}$/.test(invitation || '')) {
    sessionStorage.setItem(pendingKey,invitation);
    url.searchParams.delete('friend'); if(url.hash.startsWith('#friend=')) url.hash=''; history.replaceState(null,'',url);
  }
  let model=null,busy=false,epoch=0,owner='',lastFocus=null;
  const dialog=document.createElement('dialog'); dialog.className='friends-dialog'; dialog.setAttribute('aria-labelledby','friendsTitle');
  dialog.innerHTML=`<header class="friends-head"><div><h2 id="friendsTitle">Amigos</h2><span>Tu círculo de estudio</span></div><button type="button" data-close aria-label="Cerrar amigos" title="Cerrar">×</button></header>
    <p data-status role="status" aria-live="polite"></p>
    <button type="button" data-retry hidden>Volver a intentar</button>
    <section data-signed-out hidden><p>Iniciá sesión para conectar con tus amigos.</p><button type="button" data-login>Iniciar sesión</button></section>
    <div data-content hidden>
      <section class="friends-invite"><div class="friends-section-head"><h3>Invitar</h3><button type="button" data-copy>Copiar enlace</button></div>
        <input data-my-link readonly aria-label="Tu enlace de invitación">
        <form data-invite-form><label for="friendInvite">Enlace de un amigo</label><div class="friends-inline"><input id="friendInvite" type="text" inputmode="url" maxlength="300" placeholder="Pegá su invitación" required><button type="submit">Enviar solicitud</button></div></form>
      </section>
      <details class="friends-settings"><summary>Mi nombre y privacidad</summary><form data-profile>
        <label for="friendName">Nombre visible para tus amigos</label><input id="friendName" maxlength="32" required autocomplete="nickname">
        <label class="friends-toggle"><span>Compartir mi racha<small>Solo con amigos aceptados. Podés ocultarla cuando quieras.</small></span><input type="checkbox" role="switch" data-share></label>
        <button type="submit">Guardar cambios</button><button type="button" data-rotate>Cambiar enlace de invitación</button>
      </form><div data-blocked></div></details>
      <section><div class="friends-section-head"><h3>Ranking de racha</h3><button type="button" data-refresh aria-label="Actualizar amigos" title="Actualizar">↻</button></div><p class="friends-caption">Días consecutivos · Solo rachas compartidas</p><ol class="friends-list" data-list></ol></section>
      <details data-requests><summary>Solicitudes <span data-request-count></span></summary><div data-incoming></div><div data-outgoing></div></details>
    </div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s);
  const status=(text,error=false)=>{q('[data-status]').textContent=text;q('[data-status]').classList.toggle('is-error',error);q('[data-retry]').hidden=!error;};
  const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
  const button=(label,callback)=>{const b=text('button',label);b.type='button';b.disabled=busy;b.addEventListener('click',callback);return b;};
  function account(){return window.EstudiemosAccount;}
  function lock(value){busy=value;dialog.querySelectorAll('button:not([data-close]),input').forEach(n=>n.disabled=value);}
  async function call(action,data={}) {
    const session=account()?.getSession(); if(!session?.access_token) throw new Error('Iniciá sesión para continuar.');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(endpoint,{method:action?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(action?{'Content-Type':'application/json'}:{})},body:action?JSON.stringify({action,...data}):undefined,signal:controller.signal,cache:'no-store'});
      const result=await response.json(); if(!response.ok)throw new Error(result.message || 'No pudimos guardar el cambio.'); return result;
    } finally {clearTimeout(timeout);}
  }
  async function refresh(action,data,message='') {
    if(busy)return;
    const current=++epoch, user=account()?.getUser()?.id;
    if(!user){q('[data-content]').hidden=true;q('[data-signed-out]').hidden=false;return;}
    owner=user;
    lock(true); status(action?'Guardando…':'Actualizando…');
    try {
      const result=await call(action,data);
      if(current!==epoch || account()?.getUser()?.id!==user)return;
      model=result; draw();status(message);
    } catch(error){if(current===epoch)status(error.name==='AbortError'?'La conexión tardó demasiado. Volvé a intentar.':error.message,true);}
    finally{if(current===epoch)lock(false);}
  }
  function draw(){
    q('[data-signed-out]').hidden=true;q('[data-content]').hidden=false;
    q('#friendName').value=model.me.name;q('[data-share]').checked=model.me.share;
    q('[data-my-link]').value=new URL(`#friend=${model.me.invite}`,root).href;
    const pending=sessionStorage.getItem(pendingKey);if(pending)q('#friendInvite').value=new URL(`#friend=${pending}`,root).href;
    const list=q('[data-list]');list.replaceChildren();
    const rows=[...model.friends];if(model.me.share)rows.push({...model.me,self:true});
    rows.sort((a,b)=>Number(b.share)-Number(a.share)||(b.streak||0)-(a.streak||0)||a.name.localeCompare(b.name));
    let rank=0,last=-1;
    rows.forEach((friend,index)=>{
      if(friend.share && friend.streak!==last){rank=index+1;last=friend.streak;}
      const row=document.createElement('li');row.className='friends-row';
      row.append(text('span',friend.share?String(rank):'—','friends-rank'));
      const person=text('div','','friends-person');person.append(text('strong',friend.name+(friend.self?' (vos)':'')),text('span',friend.share?`${friend.streak} ${friend.streak===1?'día':'días'} de racha`:'Racha privada'));row.append(person);
      if(!friend.self){const more=document.createElement('details');more.className='friends-row-menu';const summary=text('summary','•••');summary.setAttribute('aria-label',`Opciones de ${friend.name}`);more.append(summary,button('Quitar',()=>confirmAction('remove',friend)),button('Bloquear',()=>confirmAction('block',friend)));row.append(more);}
      list.append(row);
    });
    if(!model.friends.length)list.append(text('li','Todavía no tenés amigos. Compartí tu enlace para conectar.','friends-empty'));
    const requests=q('[data-requests]');q('[data-request-count]').textContent=`(${model.incoming.length+model.outgoing.length})`;if(model.incoming.length)requests.open=true;
    const incoming=q('[data-incoming]'),outgoing=q('[data-outgoing]');incoming.replaceChildren();outgoing.replaceChildren();
    for(const p of model.incoming){const row=text('div','','friends-request');row.append(text('strong',p.name),button('Aceptar',()=>refresh('accept',{id:p.id},'Solicitud aceptada.')),button('Rechazar',()=>refresh('decline',{id:p.id},'Solicitud rechazada.')),button('Bloquear',()=>confirmAction('block',p)));incoming.append(row);}
    for(const p of model.outgoing){const row=text('div','','friends-request');row.append(text('span',`${p.name} · Enviada`),button('Cancelar',()=>refresh('decline',{id:p.id},'Solicitud cancelada.')));outgoing.append(row);}
    if(!model.incoming.length&&!model.outgoing.length)incoming.append(text('p','No hay solicitudes pendientes.','friends-caption'));
    const blocked=q('[data-blocked]');blocked.replaceChildren();if(model.blocked.length)blocked.append(text('h3','Bloqueados'));
    for(const p of model.blocked){const row=text('div','','friends-request');row.append(text('span',p.name),button('Desbloquear',()=>refresh('unblock',{id:p.id},'Usuario desbloqueado.')));blocked.append(row);}
  }
  function confirmAction(action,person){
    if(confirm(action==='block'?`¿Bloquear a ${person.name}? Se quitará la amistad y no podrá enviarte solicitudes.`:`¿Quitar a ${person.name} de tus amigos?`))refresh(action,{id:person.id},action==='block'?'Usuario bloqueado.':'Amigo eliminado.');
  }
  async function open(){
    lastFocus=document.activeElement;if(!dialog.open)dialog.showModal();
    await account()?.whenReady?.();await refresh();
  }
  q('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>lastFocus?.focus());
  q('[data-login]').onclick=()=>{dialog.close();account()?.open();};
  q('[data-refresh]').onclick=()=>refresh();
  q('[data-retry]').onclick=()=>refresh();
  q('[data-profile]').onsubmit=e=>{e.preventDefault();refresh('profile',{name:q('#friendName').value,share:q('[data-share]').checked,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'},'Nombre y privacidad guardados.');};
  q('[data-invite-form]').onsubmit=async e=>{
    e.preventDefault();let invite='';try{const link=new URL(q('#friendInvite').value);if(link.origin===root.origin)invite=new URLSearchParams(link.hash.slice(1)).get('friend')||link.searchParams.get('friend')||'';}catch(_){}
    if(!/^[a-f0-9]{32}$/.test(invite)){status('Pegá un enlace de invitación de Estudiemos válido.',true);return;}
    await refresh('request',{invite},'Solicitud enviada. Tu amigo tiene que aceptarla.');
    if(model?.outgoing.length && !q('[data-status]').classList.contains('is-error')){sessionStorage.removeItem(pendingKey);q('#friendInvite').value='';}
  };
  q('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(q('[data-my-link]').value);status('Enlace copiado.');}catch(_){q('[data-my-link]').select();status('Seleccioné tu enlace para que puedas copiarlo.');}};
  q('[data-rotate]').onclick=()=>{if(confirm('¿Cambiar tu enlace? Los anteriores dejarán de permitir nuevas solicitudes. Tus amigos actuales no cambian.'))refresh('rotate',{},'Enlace de invitación actualizado.');};
  window.addEventListener('estudiemos:account-change',()=>{
    const next=account()?.getUser()?.id||'';
    if(next!==owner){owner=next;epoch++;busy=false;model=null;lock(false);q('[data-content]').hidden=true;q('[data-list]').replaceChildren();q('#friendName').value='';q('[data-my-link]').value='';status('');
      if(dialog.open)refresh();else if(next && sessionStorage.getItem(pendingKey))open();}
  });
  setInterval(()=>{if(dialog.open&&!document.hidden&&!busy&&!dialog.querySelector('form:focus-within,details.friends-settings[open]'))refresh();},60000);
  window.EstudiemosFriends={open};
  const nav=document.querySelector('.topbar__nav');
  if(nav){const trigger=button('',open);trigger.className='topbar__link topbar-icon-btn';trigger.dataset.friendsOpen='';trigger.title='Amigos';trigger.setAttribute('aria-label','Amigos');const icon=document.createElement('img');icon.src=new URL('assets/icons/users-round.svg',root);icon.alt='';icon.width=20;icon.height=20;trigger.append(icon);nav.append(trigger);}
  if(invitation)open();
})();
