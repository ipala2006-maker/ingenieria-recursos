(function () {
  if (!document.body.classList.contains('workspace-home')) return;
  const empty = document.querySelector('[data-home-empty]'), inbox = document.querySelector('[data-dashboard-agenda]');
  const courses = document.querySelector('[data-home-classes-list]'), suggestions = document.querySelector('[data-home-suggestions]');
  if (!empty || !inbox || !courses || !suggestions) return;
  const list = key => { try { const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]; } catch (_) { return []; } };
  let frame=0, courseSignature='';
  function schedule() { cancelAnimationFrame(frame);frame=requestAnimationFrame(render); }
  function button(text, action) { const node=document.createElement('button');node.type='button';node.textContent=text;node.addEventListener('click',action);return node; }
  function render() {
    const account=window.EstudiemosAccount, classes=window.EstudiemosClasses, snapshot=classes?.snapshot();
    const drive=window.EstudiemosDriveLibrary?.status?.();
    const settled=account && (!account.getUser?.() || account.isSynchronized?.()===true);
    const classesKnown=!account?.getUser?.() || Boolean(snapshot);
    const isEmpty=Boolean(settled && classesKnown && drive?.ready && !drive.connected && !list('bandeja_agenda').length && !list('bandeja_horarios').length && !snapshot?.calendar?.length);
    empty.hidden=!isEmpty;inbox.hidden=isEmpty;
    const layout=window.EstudiemosHomeLayout?.read()||{};
    suggestions.hidden=layout.preset!=='light';
    for (const node of suggestions.querySelectorAll('[data-home-add-tool]')) node.hidden=layout.visible?.[node.dataset.homeAddTool]!==false;
    suggestions.hidden ||= ![...suggestions.querySelectorAll('button')].some(node=>!node.hidden);
    const state=classes?.status?.(), available=(snapshot?.classes||[]).filter(course=>!course.archived);
    const signature=JSON.stringify([account?.getUser?.()?.id||'',available,Boolean(snapshot),Boolean(state?.failed)]);
    if(signature===courseSignature)return;
    courseSignature=signature;courses.replaceChildren();
    if (available.length) {
      for (const course of available) {
        const row=button('',()=>classes.open({id:course.id}));row.className='home-classes__row';
        const icon=document.createElement('img');icon.src='./assets/icons/graduation-cap.svg';icon.alt='';icon.width=22;icon.height=22;
        const copy=document.createElement('span'), title=document.createElement('strong'), detail=document.createElement('small');
        title.textContent=course.title;detail.textContent=course.institution||course.teacherName||'Fechas y materiales compartidos';copy.append(title,detail);row.append(icon,copy);courses.append(row);
      }
    } else {
      const wrap=document.createElement('div');wrap.className='home-classes__state';const copy=document.createElement('p');
      copy.textContent=!account?.getUser?.()?'Tu comisión, sus fechas y materiales en un lugar.':state?.failed?'No pudimos cargar tus cátedras.':!snapshot?'Cargando tus cátedras…':'Sumate a tu comisión con su enlace o código, o creá una cátedra.';
      wrap.append(copy);
      if (state?.failed) wrap.append(button('Reintentar',async()=>{try { await classes.refresh(true); } catch (_) {} schedule();}));
      else if (!account?.getUser?.() || snapshot) wrap.append(button(account?.getUser?.()?'Unirme o crear cátedra':'Iniciar sesión',()=>classes?.open()));
      courses.append(wrap);
    }
  }
  document.addEventListener('click',event=>{
    if (event.target.closest('[data-home-tools-open]')) window.EstudiemosHomeCustomizer?.open();
    const add=event.target.closest('[data-home-add-tool]');
    if (add && window.EstudiemosHomeCustomizer?.show(add.dataset.homeAddTool)) {
      window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'overview'}}));
    }
    if (event.target.closest('[data-home-classes-open]')) window.EstudiemosClasses?.open();
    if (event.target.closest('[data-home-connect-drive]')) {
      if (!window.EstudiemosHomeCustomizer?.show('workspace')) return;
      window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'space'}}));
      document.querySelector('.workspace-section [data-drive-connect]')?.click();
    }
  });
  window.addEventListener('estudiemos:data-change',event=>{if(['bandeja_agenda','bandeja_horarios'].includes(event.detail?.key))schedule();});
  for (const name of ['estudiemos:cloud-restored','estudiemos:account-synced','estudiemos:account-ready','estudiemos:account-change','estudiemos:classes-updated','estudiemos:classes-status','estudiemos:drive-state','estudiemos:home-customized']) window.addEventListener(name,schedule);
  window.addEventListener('storage',schedule);
  schedule();
})();
