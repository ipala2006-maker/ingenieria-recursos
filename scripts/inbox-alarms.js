(function () {
  if (window.EstudiemosInboxAlarms || !window.EstudiemosAlarmRules) return;
  const rules = window.EstudiemosAlarmRules;
  const root = new URL('../', document.currentScript.src);
  const KEY = 'bandeja_agenda';
  const NATIVE_KEY = 'estudiemos_inbox_alarm_windows';
  const FIRED_KEY = 'estudiemos_inbox_alarm_delivered';
  const CONNECTION_KEY = 'estudiemos_windows_alarm_connection';
  let nativeConnecting = false, nativeMessage = '', confirmingNative = false, setupAfterSignIn = false;
  let nativeAccountId = window.EstudiemosAccount?.getUser?.()?.id || null;
  let audio, soundTimer, currentId, returnFocus, checking = false, lastNative = '', accountReady = false, waitingForAccount = false;
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('styles/inbox-alarms.css?v=20260920-repair', root); document.head.appendChild(style);
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Reuse the existing icon set's bell geometry (also used by Pomodoro).
  const bell = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
  const dialog = document.createElement('dialog');
  dialog.className = 'inbox-alarm-dialog'; dialog.setAttribute('aria-labelledby', 'inboxAlarmTitle');
  dialog.innerHTML = '<form method="dialog" data-alarm-editor><header><div><small>Inbox</small><h2 id="inboxAlarmTitle">Alarma</h2></div><button type="button" data-alarm-close aria-label="Cerrar">×</button></header><p data-alarm-task></p><div data-alarm-slot></div><p data-alarm-error role="status"></p><footer><button type="button" data-alarm-test>Probar sonido</button><button type="submit">Guardar</button></footer></form>';
  document.body.appendChild(dialog);
  const setup = document.createElement('dialog');setup.className='inbox-alarm-dialog alarm-setup';setup.setAttribute('aria-labelledby','alarmSetupTitle');
  setup.innerHTML=`<header><h2 id="alarmSetupTitle">Alarma en toda la pantalla</h2><button type="button" data-alarm-setup-close aria-label="Cerrar">×</button></header>
    <p>Windows mostrará el nombre de tu tarea sobre las otras aplicaciones y repetirá el sonido, incluso con Estudiemos cerrado.</p>
    <ol class="alarm-setup-steps">
      <li><strong>Instalar una vez</strong><p>Descargá y abrí el archivo. No instala widgets ni Rainmeter. Al terminar vuelve a esta pantalla.</p><a class="alarm-setup-download" href="${new URL('downloads/Activar-Alarmas-Estudiemos.exe',root)}" download>Instalar alarmas para Windows</a></li>
      <li><strong>Conectar mi cuenta</strong><label class="alarm-setup-consent"><input type="checkbox" data-alarm-consent> Permitir que esta PC consulte mis alarmas y muestre pantalla completa con sonido, incluso con la app cerrada.</label><button type="button" data-alarm-activate disabled>Conectar con Windows</button><a data-alarm-retry hidden>Abrir activación de Windows</a><p>Al abrir Windows, esperá la confirmación en tu navegador. Si vuelve a pedir acceso, usá la misma cuenta de Estudiemos.</p></li>
      <li><strong>Comprobar la pantalla completa</strong><button type="button" data-alarm-native-test>Probar alarma de Windows</button><p>Podés probar después de instalar, incluso antes de conectar la cuenta. El aviso suena y se cierra con Entendido o Escape.</p></li>
    </ol><p data-alarm-native-status role="status"></p><small>La PC debe estar encendida, con la sesión iniciada y el volumen activo. Puede demorarse hasta un minuto. No se cambian el antivirus ni los permisos del navegador.</small>`;
  document.body.appendChild(setup);
  function nativeReady(){let saved={};try{saved=JSON.parse(localStorage.getItem(CONNECTION_KEY)||'{}');}catch(_){}return saved.userId===window.EstudiemosAccount?.getUser?.()?.id&&saved.expiresAt*1000>Date.now()&&['1.6.1','1.6.2'].includes(saved.version);}
  function showSetup(){renderNativeStatus();if(!setup.open)setup.showModal();}
  function signInForSetup(){setup.close();setupAfterSignIn=true;window.EstudiemosAccount?.open?.();}
  function launchNative(url){const link=document.createElement('a');link.href=url;document.body.appendChild(link);link.click();link.remove();}
  const notice = document.createElement('dialog'); notice.className = 'inbox-alarm-notice'; notice.hidden = true; notice.setAttribute('role', 'alertdialog'); notice.setAttribute('aria-modal', 'true'); notice.setAttribute('aria-labelledby', 'inboxAlarmNoticeTitle');
  notice.innerHTML = `<div class="inbox-alarm-notice__surface"><span class="inbox-alarm-notice__icon">${bell}</span><small>ESTUDIEMOS · ALARMA DE INBOX</small><time data-alarm-notice-clock></time><h2 id="inboxAlarmNoticeTitle">Es hora</h2><p></p><div class="inbox-alarm-notice__actions"><button type="button" data-alarm-notice-open>Abrir Inbox</button><button type="button" data-alarm-notice-dismiss>Entendido</button></div></div>`;
  document.body.appendChild(notice);
  function stopAlert() {
    if(notice.open)notice.close();
    notice.hidden = true;
    clearInterval(soundTimer);
    soundTimer = 0;
    try { navigator.vibrate?.(0); } catch (_) {}
  }
  notice.querySelector('[data-alarm-notice-dismiss]').onclick = stopAlert;
  notice.querySelector('[data-alarm-notice-open]').onclick = () => {
    stopAlert();
    window.dispatchEvent(new CustomEvent('estudiemos:home-navigate', { detail: { view: 'inbox' } }));
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !notice.hidden) stopAlert(); });
  function items() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function controls() {
    const windows = /Windows/i.test(navigator.userAgent);
    return `<fieldset class="inbox-alarm-fields">
      <label class="inbox-alarm-switch">${bell}<span>Programar alarma<small data-alarm-summary>Sin alarma</small></span><input type="checkbox" role="switch" name="inboxAlarmEnabled" aria-label="Activar alarma"></label>
      <div data-alarm-options hidden>
        <div class="inbox-alarm-date"><label>Día<input type="date" name="inboxAlarmDate" min="2020-01-01" max="2100-12-31"></label><label>Hora<input type="time" name="inboxAlarmTime"></label></div>
        <label>Repetir<select name="inboxAlarmRepeat" aria-label="Repetir">${rules.repeats.map(r => `<option value="${r}">${rules.labels[r]}</option>`).join('')}</select></label>
        <small>Hora local de cada dispositivo. Al completar la tarea, deja de sonar.</small>
        <small data-alarm-permission-status role="status" ${windows?'hidden':''}></small>
        <button type="button" data-alarm-permission ${windows?'hidden':''}>Permitir notificaciones</button>
        <details class="inbox-alarm-delivery" ${windows ? 'open' : 'hidden'}><summary>Pantalla completa en Windows</summary>
          <label><input type="checkbox" data-alarm-native ${localStorage.getItem(NATIVE_KEY) === 'true' ? 'checked' : ''}> Mostrar esta alarma con la app cerrada</label>
          <small>El nombre de tu tarea ocupa toda la pantalla y suena hasta que cierres el aviso.</small>
          <small data-alarm-native-status role="status"></small>
          <button type="button" data-alarm-native-connect>Activar pantalla completa en esta PC</button>
        </details>
      </div></fieldset>`;
  }
  function fill(form, alarm) {
    const a = rules.normalize(alarm);
    const soon = new Date(Math.ceil((Date.now() + 60000) / 300000) * 300000);
    form.elements.inboxAlarmEnabled.checked = !!a;
    form.elements.inboxAlarmDate.value = a?.date || rules.dateKey(soon);
    form.elements.inboxAlarmTime.value = a?.time || `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
    form.elements.inboxAlarmRepeat.value = a?.repeat || 'none';
    form.querySelector('[data-alarm-native]').checked = a ? a.windows : localStorage.getItem(NATIVE_KEY) === 'true';
    reveal(form);
  }
  function reveal(form) {
    const enabled = form.elements.inboxAlarmEnabled.checked;
    const description = rules.describe({date:form.elements.inboxAlarmDate.value,time:form.elements.inboxAlarmTime.value,repeat:form.elements.inboxAlarmRepeat.value});
    form.querySelector('[data-alarm-summary]').textContent = enabled ? description : 'Sin alarma';
    form.querySelector('[data-alarm-options]').hidden = !enabled;
    for (const name of ['inboxAlarmDate', 'inboxAlarmTime', 'inboxAlarmRepeat']) {
      form.elements[name].disabled = !enabled;
      form.elements[name].required = enabled;
    }
    renderPermission(form);
  }
  function renderPermission(form) {
    renderNativeStatus();
    const permission = 'Notification' in window ? Notification.permission : 'unavailable';
    form.querySelector('[data-alarm-permission]').hidden = /Windows/i.test(navigator.userAgent) || permission !== 'default';
    form.querySelector('[data-alarm-permission-status]').textContent = permission === 'granted'
      ? 'Notificaciones del navegador permitidas.'
      : permission === 'denied' ? 'Notificaciones bloqueadas. Podés habilitarlas en los permisos de este sitio. El aviso dentro de la app sigue activo.'
      : permission === 'default' ? 'Permití las notificaciones para ver el aviso fuera de esta pestaña.'
      : 'Este navegador no admite notificaciones del sistema.';
  }
  notice.addEventListener('cancel',stopAlert);
  function renderNativeStatus(message) {
    if(typeof message==='string')nativeMessage=message;
    const ready=nativeReady();setup.dataset.ready=String(ready);
    document.querySelectorAll('[data-alarm-native-status]').forEach(node=>node.textContent=nativeMessage || (ready?'Activado en esta PC. Guardá tu alarma con «Mostrar esta alarma con la app cerrada» marcado.':'Todavía no está activado fuera de la app. Completá la activación una sola vez.'));
    document.querySelectorAll('[data-alarm-native-connect]').forEach(button=>{button.textContent=ready?'Comprobar alarma de pantalla completa':'Activar pantalla completa en esta PC';});
    setup.querySelector('[data-alarm-activate]').disabled=nativeConnecting||!setup.querySelector('[data-alarm-consent]').checked;
    setup.querySelector('[data-alarm-activate]').textContent=nativeConnecting?'Preparando conexión…':'Conectar con Windows';
  }
  async function connectWindows() {
    if(nativeConnecting)return;
    const session=window.EstudiemosAccount?.getSession?.();
    if(!session?.access_token){signInForSetup();return;}
    if(!setup.querySelector('[data-alarm-consent]').checked)return;
    const connectingUserId=window.EstudiemosAccount?.getUser?.()?.id;
    nativeAccountId=connectingUserId||null;
    nativeConnecting=true;renderNativeStatus('Preparando conexión con Windows…');
    try{
      const response=await fetch(new URL('api/widget-link',root),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'alarms-connect',consent:true})});
      const result=await response.json();if(!response.ok||!result.token)throw new Error(result.error||result.message||'No pudimos iniciar la conexión.');
      if(connectingUserId!==window.EstudiemosAccount?.getUser?.()?.id)return;
      const retry=setup.querySelector('[data-alarm-retry]');retry.href=`estudiemos-alarms://connect?link=${encodeURIComponent(result.token)}`;retry.dataset.expires=String(Date.now()+110000);retry.hidden=false;
      retry.click();
      renderNativeStatus('Aceptá «Abrir» en el navegador. Si no apareció el aviso, tocá «Abrir activación de Windows». No hace falta descargar otra vez. La conexión todavía está pendiente.');
    }catch(error){renderNativeStatus(error.message);}
    finally{nativeConnecting=false;renderNativeStatus();}
  }
  async function confirmWindowsConnection() {
    const url=new URL(location.href),proof=url.searchParams.get('windows-alarms-ready');if(!proof)return;
    if(confirmingNative||!window.EstudiemosAccount?.whenReady)return;
    confirmingNative=true;
    try { await window.EstudiemosAccount.whenReady(); } catch(_) { confirmingNative=false;return; }
    const session=window.EstudiemosAccount?.getSession?.();if(!session?.access_token){confirmingNative=false;signInForSetup();return;}
    try{
      const response=await fetch(new URL('api/widget-link',root),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'alarms-confirm',proof})});
      const result=await response.json();
      if(!response.ok||!result.connected){renderNativeStatus(result.error||'La conexión venció. Volvé a conectar esta PC.');return;}
      url.searchParams.delete('windows-alarms-ready');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      localStorage.setItem(CONNECTION_KEY,JSON.stringify(result));localStorage.setItem(NATIVE_KEY,'true');renderNativeStatus('');
      showSetup();
      window.dispatchEvent(new CustomEvent('estudiemos:home-navigate',{detail:{view:'inbox'}}));
      window.EstudiemosAccount?.sync?.();
    }catch(_){renderNativeStatus('No pudimos confirmar la conexión. Volvé a intentarlo.');}
    finally{confirmingNative=false;}
  }
  async function requestPermission() {
    enableSound();
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (_) {}
    }
    document.querySelectorAll('form:has(.inbox-alarm-fields)').forEach(renderPermission);
  }
  function readForm(form) {
    if (!form?.elements.inboxAlarmEnabled?.checked) return null;
    const alarm = rules.normalize({ date: form.elements.inboxAlarmDate.value, time: form.elements.inboxAlarmTime.value, repeat: form.elements.inboxAlarmRepeat.value, windows: form.querySelector('[data-alarm-native]').checked });
    if (!alarm || !rules.next(alarm)) throw new Error('Elegí una fecha y hora futuras para la alarma.');
    return alarm;
  }
  function mount() {
    document.querySelectorAll('[data-quick-note-form],#agendaForm,[data-alarm-editor]').forEach(form => {
      if (form.querySelector('.inbox-alarm-fields')) return;
      const slot = form.querySelector('[data-alarm-slot]') || form.querySelector('[type="submit"]');
      const wrapper = document.createElement('div'); wrapper.className = 'inbox-alarm-form'; wrapper.innerHTML = controls();
      if (slot.hasAttribute('data-alarm-slot')) slot.appendChild(wrapper); else slot.before(wrapper);
      fill(form, null);
      form.addEventListener('reset', () => queueMicrotask(() => fill(form, null)));
      form.addEventListener('submit', e => {
        form.elements.inboxAlarmTime.setCustomValidity('');
        try { readForm(form); } catch (error) {
          e.preventDefault(); e.stopImmediatePropagation();
          form.elements.inboxAlarmTime.setCustomValidity(error.message); form.reportValidity();
        }
      }, true);
    });
  }
  async function enableSound() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
    } catch (_) {}
  }
  function sound() {
    if (!audio || audio.state !== 'running') return;
    for (let i = 0; i < 8; i++) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + i * .26;
      oscillator.type = i % 2 ? 'square' : 'sine';
      oscillator.frequency.value = i % 2 ? 740 : 940; gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.62, at + .018); gain.gain.exponentialRampToValueAtTime(.001, at + .2);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .22);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }
  function startAlert(matches) {
    const names = matches.map(item => item.title).join(' · ');
    notice.querySelector('p').textContent = names;
    notice.querySelector('[data-alarm-notice-clock]').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    notice.hidden = false;
    if(!notice.open)notice.showModal();
    notice.querySelector('[data-alarm-notice-dismiss]').focus();
    sound();
    clearInterval(soundTimer);
    soundTimer = setInterval(sound, 4200);
    try { navigator.vibrate?.([500, 180, 500, 180, 900]); } catch (_) {}
  }
  function open(id) {
    const item = items().find(i => i.id === id); if (!item) return;
    mount(); currentId = id; returnFocus = document.activeElement;
    dialog.querySelector('[data-alarm-task]').textContent = item.title;
    dialog.querySelector('[data-alarm-error]').textContent = '';
    fill(dialog.querySelector('form'), item.alarm); dialog.showModal(); enableSound();
  }
  function button(item) {
    const alarm = rules.normalize(item.alarm), label = alarm ? rules.describe(alarm) : 'Agregar alarma';
    return `<button type="button" class="inbox-alarm-button ${alarm ? 'is-set' : ''}" data-inbox-alarm-id="${escape(item.id)}" title="${escape(label)}" aria-label="${escape(label)}: ${escape(item.title)}">${bell}</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-inbox-alarm-id]'); if (b) { e.preventDefault(); open(b.dataset.inboxAlarmId); }
    if (e.target.closest('[data-alarm-close]')) dialog.close();
    if (e.target.closest('[data-alarm-test]')) enableSound().then(sound);
    if (e.target.closest('[data-alarm-permission]')) requestPermission();
    if (e.target.closest('[data-alarm-native-connect]')) showSetup();
    if (e.target.closest('[data-alarm-activate]')) connectWindows();
    if (e.target.closest('[data-alarm-setup-close]')) setup.close();
    if (e.target.closest('[data-alarm-native-test]')) {
      launchNative('estudiemos-alarms://test');
      if(!nativeReady())renderNativeStatus('La prueba solo comprueba el instalador. Para recibir tus tareas con la app cerrada, también conectá tu cuenta en el paso 2.');
    }
    const retry=e.target.closest('[data-alarm-retry]');
    if(retry&&Number(retry.dataset.expires)<Date.now()){e.preventDefault();retry.hidden=true;renderNativeStatus('El enlace venció. Tocá Conectar con Windows para generar otro, sin reinstalar.');}
  });
  dialog.addEventListener('close', () => returnFocus?.focus());
  document.addEventListener('change', e => {
    if(e.target.matches('[data-alarm-consent]'))renderNativeStatus();
    const form = e.target.closest('form');
    if (e.target.name?.startsWith('inboxAlarm')) {
      form.elements.inboxAlarmTime.setCustomValidity(''); reveal(form);
      if (e.target.name === 'inboxAlarmEnabled' && e.target.checked) {
        if(!/Windows/i.test(navigator.userAgent))requestPermission();else enableSound();
        const native = form.querySelector('[data-alarm-native]');
        if (native && !native.checked && /Windows/i.test(navigator.userAgent)) {
          native.checked = nativeReady();
        }
      }
    }
    if (e.target.matches('[data-alarm-native]')) {
      if (e.target.checked && !nativeReady()) showSetup();
      localStorage.setItem(NATIVE_KEY, String(e.target.checked));
    }
  });
  dialog.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const list = items(), target = list.find(i => i.id === currentId);
    if (!target) { dialog.querySelector('[data-alarm-error]').textContent = 'Esta tarea ya no existe.'; return; }
    try {
      target.alarm = readForm(e.currentTarget);
      localStorage.setItem(KEY, JSON.stringify(list));
      window.EstudiemosAndroid?.postMessage?.(JSON.stringify({ type: 'agenda-sync', items: list }));
      window.dispatchEvent(new CustomEvent('estudiemos:data-change', { detail: { key: KEY } }));
      dialog.close();
    } catch (error) { dialog.querySelector('[data-alarm-error]').textContent = error.message; }
  });
  async function check() {
    if (checking) return; checking = true;
    try {
      syncWindows();
      if (document.querySelector('[data-desktop-widget-host]')) return;
      const run = async () => {
        let delivered = {};
        try { delivered = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch (_) {}
        if (!delivered || typeof delivered !== 'object' || Array.isArray(delivered)) delivered = {};
        // An opt-in is not proof of a working native installation. Keep the web fallback.
        const matches = rules.due(items()).filter(item => !delivered[item.key]);
        if (!matches.length) return;
        for (const item of matches) delivered[item.key] = Date.now();
        delivered = Object.fromEntries(Object.entries(delivered).filter(([, at]) => at > Date.now() - 14 * 86400000));
        localStorage.setItem(FIRED_KEY, JSON.stringify(delivered));
        startAlert(matches);
        if ('Notification' in window && Notification.permission === 'granted') {
          const options = { body: notice.querySelector('p').textContent, tag: 'estudiemos-inbox-alarm', requireInteraction: true, icon: new URL('assets/icon-192.png', root).href, data: { url: new URL('?agenda=1', root).href } };
          const registration = await navigator.serviceWorker?.getRegistration();
          if (registration) await registration.showNotification('Alarma de Inbox', options);
          else new Notification('Alarma de Inbox', options);
        }
      };
      if (navigator.locks) await navigator.locks.request('estudiemos-inbox-alarm', run); else await run();
    } catch (_) {} finally { checking = false; }
  }
  function syncWindows() {
    if (!document.documentElement.classList.contains('rainmeter-widget') || !window.RainmeterAPI?.Bang) return;
    // Do not replace a saved native schedule while the cloud account is still loading.
    if (!accountReady) {
      if (!waitingForAccount && window.EstudiemosAccount?.whenReady) {
        waitingForAccount = true;
        window.EstudiemosAccount.whenReady().then(() => { accountReady = true; check(); }).catch(() => { waitingForAccount = false; });
      }
      return;
    }
    const user = window.EstudiemosAccount?.getUser?.();
    const payload = { version: 1, items: user ? items().filter(i => !i.done && rules.normalize(i.alarm)?.windows).map(i => ({ id: String(i.id).slice(0, 180), title: String(i.title).slice(0, 90), alarm: rules.normalize(i.alarm) })) : [] };
    const text = JSON.stringify(payload); if (text === lastNative) return;
    const encoded = btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join(''));
    const chunks = encoded.match(/.{1,3000}/g) || [];
    if (chunks.length > 200) return;
    window.RainmeterAPI.Bang('[!WriteKeyValue Alarms Count 0 "#@#InboxAlarms.inc"]');
    chunks.forEach((chunk, i) => window.RainmeterAPI.Bang(`[!WriteKeyValue Alarms Chunk${i} "${chunk}" "#@#InboxAlarms.inc"]`));
    window.RainmeterAPI.Bang(`[!WriteKeyValue Alarms Count ${chunks.length} "#@#InboxAlarms.inc"]`);
    lastNative = text;
  }
  window.EstudiemosInboxAlarms = { readForm, button, open, check, showSetup };
  const entry=new URL(location.href);
  if(entry.searchParams.get('alarms-setup')==='1'){entry.searchParams.delete('alarms-setup');history.replaceState(history.state,'',entry.pathname+entry.search+entry.hash);showSetup();}
  window.addEventListener('storage',e=>{if(e.key===CONNECTION_KEY){nativeMessage='';renderNativeStatus();}});
  confirmWindowsConnection();
  for(const name of ['estudiemos:account-ready','estudiemos:account-change'])window.addEventListener(name,()=>{
    const userId=window.EstudiemosAccount?.getUser?.()?.id||null;
    if(userId!==nativeAccountId){
      nativeAccountId=userId;nativeMessage='';
      const retry=setup.querySelector('[data-alarm-retry]');retry.hidden=true;retry.removeAttribute('href');
      setup.querySelector('[data-alarm-consent]').checked=false;
    }
    confirmingNative=false;confirmWindowsConnection();renderNativeStatus();
    if(setupAfterSignIn&&window.EstudiemosAccount?.getSession?.()?.access_token){setupAfterSignIn=false;showSetup();}
  });
  mount(); new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  for (const name of ['storage', 'estudiemos:data-change', 'estudiemos:cloud-restored', 'estudiemos:account-change']) window.addEventListener(name, check);
  window.addEventListener('pointerdown', enableSound, { once: true, passive: true });
  window.addEventListener('pageshow', check); setInterval(check, 10000); check();
  window.dispatchEvent(new CustomEvent('estudiemos:alarms-ready'));
})();
