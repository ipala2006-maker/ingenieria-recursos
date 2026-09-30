(function () {
  if (window.EstudiemosMobileNotifications) return;
  const root = new URL('../', document.currentScript.src);
  const endpoint = new URL('api/widget-push?mobilePush=1', root);
  const ownerKey = 'estudiemos_mobile_push_owner';
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const native = () => !!window.EstudiemosAndroid?.postMessage;
  const handled = () => native() || isIOS || /Android/.test(navigator.userAgent);
  let config, busy = false, connected = false, message = '', nativeStatus, configLoading, lastOwner;
  const changed = () => window.dispatchEvent(new CustomEvent('estudiemos:mobile-notifications'));
  const owner = () => window.EstudiemosAccount?.getUser?.()?.id || '';
  const standalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  function status() {
    if (native()) {
      if (!nativeStatus) return { text: 'Actualizá Estudiemos para activar alarmas con la app cerrada.', button: 'Actualizar aplicación', action: 'update' };
      const ready = nativeStatus.permission === 'granted';
      return { ready, text: message || (ready ? (nativeStatus.exact ? 'Activadas con la app cerrada. El sonido respeta el volumen y No molestar.' : 'Activadas. Permití «Alarmas y recordatorios» para mejorar la puntualidad.') : 'Activá los avisos de tus tareas en este celular.'), button: ready ? 'Ajustar permisos' : 'Activar notificaciones', action: 'native' };
    }
    if (isIOS && !standalone()) return { text: 'En Safari: Compartir → Agregar a inicio. Abrí Estudiemos desde ese icono y activá las notificaciones.', button: '', action: '' };
    if (!('PushManager' in window) || !('Notification' in window) || !navigator.serviceWorker) return { text: 'Necesitás un navegador compatible. En iPhone, iOS 16.4 o posterior y Estudiemos en inicio.', button: '', action: '' };
    if (!owner()) return { text: 'Ingresá a tu cuenta para recibir tus alarmas con la app cerrada.', button: 'Ingresar', action: 'login' };
    if (Notification.permission === 'denied') return { text: 'Notificaciones bloqueadas. Habilitalas en Ajustes → Notificaciones → Estudiemos.', button: '', action: '' };
    return { ready: connected, text: message || (connected ? 'Conectadas con la app cerrada. Requieren internet y respetan el modo silencio. Pueden demorar un minuto.' : config?.enabled === false ? 'Estamos preparando las notificaciones de este celular. No están activas todavía.' : 'Recibí el nombre de tus tareas aunque Estudiemos esté cerrado.'), button: busy ? 'Conectando…' : connected ? 'Enviar prueba' : 'Activar notificaciones', action: 'push', disabled: busy || config?.enabled === false };
  }
  async function loadConfig() {
    if (!handled() || native() || configLoading) return configLoading;
    configLoading = fetch(endpoint, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(value => { config = value; changed(); }).catch(() => { message = 'No pudimos comprobar la conexión. Volvé a intentarlo.'; changed(); }).finally(() => { configLoading = null; });
    return configLoading;
  }
  async function registration() {
    return navigator.serviceWorker.getRegistration(root.href).then(r => r || navigator.serviceWorker.register(new URL('service-worker.js', root))).then(() => navigator.serviceWorker.ready);
  }
  async function bind(reg, subscription, test) {
    const userId = owner(), token = window.EstudiemosAccount?.getSession?.()?.access_token;
    if (!userId || !token) throw new Error('Ingresá a tu cuenta primero.');
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, action: test ? 'test' : 'subscribe' }) });
    const result = await response.json();
    if (!response.ok || !result.connected) throw new Error(result.message || 'No pudimos conectar las notificaciones.');
    if (owner() !== userId) { await subscription.unsubscribe(); throw new Error('La cuenta cambió. Volvé a activar las notificaciones.'); }
    localStorage.setItem(ownerKey, userId);
    reg.active?.postMessage({ type: 'ESTUDIEMOS_PUSH_OWNER', owner: userId });
    connected = true;
  }
  async function request() {
    const state = status();
    if (state.action === 'login') { window.EstudiemosAccount?.open?.(); return; }
    if (state.action === 'update') { window.EstudiemosAndroid.postMessage(JSON.stringify({ type: 'app-update' })); return; }
    if (state.action === 'native') { window.EstudiemosAndroid.postMessage(JSON.stringify({ type: state.ready ? 'inbox-notifications-settings' : 'inbox-notifications-enable' })); return; }
    if (state.action !== 'push' || busy) return;
    if (!config?.enabled) { await loadConfig(); message = config?.enabled ? 'Listo. Tocá Activar notificaciones para permitirlas.' : 'Las notificaciones todavía no están activadas en el servidor.'; changed(); return; }
    busy = true; message = ''; changed();
    try {
      // Invoke permission directly from the user's click, before asynchronous registration.
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se activaron los permisos de notificación.');
      const reg = await registration();
      let subscription = await reg.pushManager.getSubscription();
      const savedOwner = localStorage.getItem(ownerKey);
      if (subscription && savedOwner !== owner()) { await subscription.unsubscribe(); subscription = null; }
      if (!subscription) {
        const base64 = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
        subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(base64), c => c.charCodeAt(0)) });
      }
      // Set the owner before the test push can arrive; a failed bind never claims connected.
      reg.active?.postMessage({ type: 'ESTUDIEMOS_PUSH_OWNER', owner: owner() });
      await bind(reg, subscription, true);
      message = 'Conectadas. Te enviamos una notificación de prueba.';
    } catch (error) { connected = false; message = error.message || 'No pudimos activar las notificaciones.'; }
    finally { busy = false; changed(); }
  }
  async function reconcile() {
    if (!handled()) return;
    if (native()) { window.EstudiemosAndroid.postMessage(JSON.stringify({ type: 'inbox-notifications-status' })); return; }
    if (!navigator.serviceWorker || !('PushManager' in window)) return;
    await window.EstudiemosAccount?.whenReady?.();
    const current = owner();
    if (current === lastOwner) return;
    lastOwner = current; connected = false; message = '';
    try {
      const reg = await navigator.serviceWorker.getRegistration(root.href);
      const subscription = await reg?.pushManager.getSubscription();
      if (localStorage.getItem(ownerKey) !== current || !current) {
        reg?.active?.postMessage({ type: 'ESTUDIEMOS_PUSH_OWNER', owner: '' });
        if (subscription) await subscription.unsubscribe();
        localStorage.removeItem(ownerKey);
      } else if (subscription && Notification.permission === 'granted') await bind(reg, subscription, false);
    } catch (_) { message = 'Revisá la conexión de las notificaciones antes de cerrar la app.'; }
    changed();
  }
  window.EstudiemosMobileNotifications = { handled, status, request };
  window.addEventListener('estudiemos-android-inbox-status', e => { nativeStatus = e.detail; changed(); });
  for (const event of ['estudiemos-android-ready', 'estudiemos:account-ready', 'estudiemos:account-change']) window.addEventListener(event, reconcile);
  loadConfig(); reconcile(); changed();
})();
