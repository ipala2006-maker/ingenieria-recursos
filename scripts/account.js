(function () {
  if (window.EstudiemosAccount) return;

  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js";
  const SYNC_KEYS = [
    "bandeja_favoritos",
    "bandeja_guardados",
    "bandeja_materias",
    "bandeja_recientes",
    "bandeja_agenda",
    "estudiemos_pomodoro_streak",
    "estudiemos_theme"
  ];
  const LIST_KEYS = new Set(SYNC_KEYS.filter((key) => !["estudiemos_theme", "estudiemos_pomodoro_streak"].includes(key)));
  const PRIVATE_SYNC_KEYS = SYNC_KEYS.filter((key) => key !== "estudiemos_theme");
  const LINKED_USER_KEY = "estudiemos_cloud_user";
  const LOCAL_CHANGED_KEY = "estudiemos_cloud_local_changed";
  const DIRTY_KEY = "estudiemos_cloud_dirty";
  const MIN_PASSWORD_LENGTH = 8;

  let client = null;
  let session = null;
  let configAvailable = false;
  let syncTimer = 0;
  let syncing = false;
  let applyingCloud = false;
  let lastPullAt = 0;
  let recoveryMode = false;
  let readySettled = false;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  addAccountButton();
  addAccountDialog();
  bindAccountEvents();
  cleanUpdateMarker();
  initialize();

  window.EstudiemosAccount = {
    sync: () => synchronize("manual"),
    getUser: () => session?.user || null,
    getSession: () => session,
    getClient: () => client,
    whenReady: () => readyPromise,
    open: () => openDialog(),
    updateApp: () => updateApplication()
  };

  function getRootPath() {
    if (window.EstudiemosRoot) return window.EstudiemosRoot;
    const script = document.currentScript || document.querySelector('script[src*="scripts/account.js"]');
    const src = script?.getAttribute("src") || "";
    return src.replace(/scripts\/account\.js(?:\?.*)?$/, "") || "./";
  }

  function addAccountButton() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-account-open]")) return;
    let nav = topbar.querySelector(".topbar__nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "topbar__nav";
      nav.setAttribute("aria-label", "Acciones rápidas");
      topbar.appendChild(nav);
    }

    const button = document.createElement("button");
    button.className = "topbar__link topbar-icon-btn account-top-btn";
    button.type = "button";
    button.dataset.accountOpen = "true";
    button.setAttribute("aria-label", "Abrir cuenta");
    button.title = "Cuenta";
    button.innerHTML = `${userIcon()}<span class="account-top-btn__status" aria-hidden="true"></span>`;
    nav.appendChild(button);
  }

  function addAccountDialog() {
    if (document.querySelector(".account-shell")) return;
    const shell = document.createElement("section");
    shell.className = "account-shell";
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML = `
      <div class="account-panel" role="dialog" aria-modal="true" aria-labelledby="accountTitle">
        <header class="account-head">
          <div>
            <p class="tray-kicker">Estudiemos</p>
            <h2 id="accountTitle">Tu cuenta</h2>
          </div>
          <button class="tray-close" type="button" data-account-close aria-label="Cerrar">${closeIcon()}</button>
        </header>

        <div class="account-loading" data-account-loading>
          <span class="account-spinner" aria-hidden="true"></span>
          <p>Preparando tu cuenta...</p>
        </div>

        <div class="account-auth" data-account-auth hidden>
          <p class="account-intro">Usá la misma cuenta en tu computadora, tablet y celular para mantener tus datos sincronizados.</p>
          <form class="account-form" data-account-form>
            <label>
              <span>Correo electrónico</span>
              <input type="email" name="email" autocomplete="email" required placeholder="nombre@correo.com" />
            </label>
            <label>
              <span>Contraseña</span>
              <input type="password" name="password" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="current-password" required placeholder="Mínimo ${MIN_PASSWORD_LENGTH} caracteres" />
            </label>
            <button class="account-primary" type="submit" data-account-signin>Ingresar</button>
            <button class="account-secondary" type="button" data-account-signup>Crear cuenta</button>
            <button class="account-link" type="button" data-account-reset>Olvidé mi contraseña</button>
          </form>
        </div>

        <div class="account-profile" data-account-profile hidden>
          <div class="account-identity">
            <span class="account-avatar" aria-hidden="true">${userIcon()}</span>
            <div>
              <strong data-account-email></strong>
              <span data-account-sync-label>Sincronización activa</span>
            </div>
          </div>
          <div class="account-benefits">
            <p>${checkIcon()} Inbox y organización</p>
            <p>${checkIcon()} Archivos y carpetas personales</p>
            <p>${checkIcon()} Tema y preferencias</p>
          </div>
          <form class="account-password-form" data-account-password-form hidden>
            <label>
              <span>Nueva contraseña</span>
              <input type="password" name="newPassword" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" required placeholder="Mínimo ${MIN_PASSWORD_LENGTH} caracteres" />
            </label>
            <button class="account-primary" type="submit">Guardar nueva contraseña</button>
          </form>
          <button class="account-primary" type="button" data-account-sync>Sincronizar ahora</button>
          <button class="account-secondary" type="button" data-account-signout>Cerrar sesión</button>
        </div>

        <div class="account-unavailable" data-account-unavailable hidden>
          <p>La sincronización de cuentas está casi lista, pero falta conectar el almacenamiento seguro.</p>
        </div>

        <div class="account-app-actions">
          <button class="account-update" type="button" data-account-update>
            ${updateIcon()}
            <span>
              <strong data-account-update-label>Actualizar Estudiemos</strong>
              <small>Buscar y aplicar la versión más reciente</small>
            </span>
          </button>
        </div>

        <div class="account-android-widgets" data-account-android-widgets hidden>
          <strong>Widgets de Android</strong>
          <small>Elegí cuál querés agregar a la pantalla de inicio.</small>
          <div>
            <button class="account-secondary" type="button" data-account-widget="agenda">Inbox</button>
            <button class="account-secondary" type="button" data-account-widget="calendar">Calendario</button>
            <button class="account-secondary" type="button" data-account-widget="pomodoro">Pomodoro</button>
            <button class="account-secondary" type="button" data-account-widget="streak">Racha</button>
          </div>
        </div>

        <div class="account-android-widgets account-desktop-widgets" data-account-desktop-widgets hidden>
          <strong>Widgets de escritorio</strong>
          <small>Abrilos en una ventana compacta o instalalos fijos en el escritorio de Windows.</small>
          <div>
            <button class="account-secondary" type="button" data-account-desktop-widget="inbox">Inbox</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="calendar">Calendario</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="pomodoro">Pomodoro</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="streak">Racha</button>
          </div>
          <button class="account-widget-installer" type="button" data-account-install-widgets>
            ${desktopIcon()}
            <span><strong>Agregar al escritorio</strong><small>Instala los cuatro widgets fijos</small></span>
          </button>
        </div>

        <p class="account-status" data-account-status role="status" aria-live="polite"></p>
        <p class="account-privacy">Tus datos privados solo pueden ser leídos por tu propia cuenta.</p>
      </div>`;
    document.body.appendChild(shell);
    const widgetActions = shell.querySelector("[data-account-android-widgets]");
    if (widgetActions) widgetActions.hidden = !hasAndroidBridge();
    const desktopWidgetActions = shell.querySelector("[data-account-desktop-widgets]");
    if (desktopWidgetActions) desktopWidgetActions.hidden = !supportsDesktopWidgets();
  }

  function bindAccountEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-account-open]")) openDialog();
      if (event.target.closest("[data-account-close]") || event.target === document.querySelector(".account-shell")) closeDialog();
      if (event.target.closest("[data-account-signup]")) signUp();
      if (event.target.closest("[data-account-reset]")) resetPassword();
      if (event.target.closest("[data-account-signout]")) signOut();
      if (event.target.closest("[data-account-sync]")) synchronize("manual");
      if (event.target.closest("[data-account-update]")) updateApplication();
      const widgetButton = event.target.closest("[data-account-widget]");
      if (widgetButton) requestAndroidWidget(widgetButton.dataset.accountWidget);
      const desktopWidgetButton = event.target.closest("[data-account-desktop-widget]");
      if (desktopWidgetButton) openDesktopWidget(desktopWidgetButton.dataset.accountDesktopWidget);
      if (event.target.closest("[data-account-install-widgets]")) installDesktopWidgets();
    });

    document.querySelector("[data-account-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      signIn();
    });
    document.querySelector("[data-account-password-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      updatePassword();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.querySelector(".account-shell")?.hidden) closeDialog();
    });

    window.addEventListener("estudiemos:data-change", (event) => {
      const key = event.detail?.key;
      if (applyingCloud || !SYNC_KEYS.includes(key)) return;
      markLocalChange();
      scheduleSync();
    });

    window.addEventListener("focus", refreshFromCloud);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshFromCloud();
    });
  }

  async function initialize() {
    let stage = "config";
    try {
      const response = await fetch(`${getRootPath()}api/account-config`, { cache: "no-store" });
      const config = await response.json().catch(() => ({}));
      if (!response.ok || !config.enabled || !config.url || !config.publishableKey) throw new Error("not-configured");
      stage = "library";
      await loadSupabaseLibrary();
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      configAvailable = true;

      stage = "session";
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      session = result.data.session;
      if (session) prepareLocalAccountSwitch(session.user.id);
      else if (localStorage.getItem(LINKED_USER_KEY)) clearLocalAccountData();
      renderAccountState();
      finishReady(true);
      if (session) await synchronize("startup");

      client.auth.onAuthStateChange((event, nextSession) => {
        window.setTimeout(async () => {
          const previousUser = session?.user?.id || "";
          session = nextSession;
          if (event === "PASSWORD_RECOVERY") {
            recoveryMode = true;
            openDialog();
            setStatus("Escribí una contraseña nueva para recuperar tu cuenta.", "info");
          }
          if (session) prepareLocalAccountSwitch(session.user.id);
          renderAccountState();
          if (session && session.user.id !== previousUser) {
            await synchronize("signin");
          } else if (!session && previousUser) {
            clearLocalAccountData();
          }
        }, 0);
      });
    } catch (error) {
      configAvailable = false;
      const message = stage === "config"
        ? "La sincronización de cuentas está casi lista, pero falta conectar el almacenamiento seguro."
        : stage === "library"
          ? "No pudimos cargar el servicio de cuentas. Revisá tu conexión y recargá la página."
          : "No pudimos iniciar tu cuenta en este momento. Recargá la página para volver a intentar.";
      const unavailable = document.querySelector("[data-account-unavailable] p");
      if (unavailable) unavailable.textContent = message;
      renderAccountState();
      finishReady(false);
    }
  }

  function finishReady(available) {
    if (!readySettled) {
      readySettled = true;
      resolveReady({ available, client, session });
    }
    window.dispatchEvent(new CustomEvent("estudiemos:account-ready", {
      detail: { available, user: session?.user || null }
    }));
  }

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    const sameOriginClient = `${getRootPath()}api/supabase-client`;
    return loadScript(sameOriginClient).catch(() => loadScript(SUPABASE_CDN));
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.dataset.supabaseClient = "true";
      script.onload = () => window.supabase?.createClient ? resolve() : reject(new Error("invalid-client"));
      script.onerror = () => {
        script.remove();
        reject(new Error("client-load-failed"));
      };
      document.head.appendChild(script);
    });
  }

  async function signIn() {
    if (!client) return;
    const credentials = getCredentials();
    if (!credentials) return;
    setBusy(true, "Ingresando...");
    const result = await client.auth.signInWithPassword(credentials);
    setBusy(false);
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    session = result.data.session;
    prepareLocalAccountSwitch(session.user.id);
    renderAccountState();
    await synchronize("signin");
    setStatus("Cuenta conectada y datos sincronizados.", "success");
  }

  async function signUp() {
    if (!client) return;
    const credentials = getCredentials();
    if (!credentials) return;
    setBusy(true, "Creando tu cuenta...");
    const result = await client.auth.signUp({
      ...credentials,
      options: { emailRedirectTo: `${location.origin}${getRootPath()}` }
    });
    setBusy(false);
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    if (result.data.session) {
      session = result.data.session;
      prepareLocalAccountSwitch(session.user.id);
      renderAccountState();
      await synchronize("signin");
      setStatus("Cuenta creada y datos sincronizados.", "success");
      return;
    }
    setStatus("Te enviamos un correo. Abrilo para confirmar tu cuenta y después ingresá.", "success");
  }

  async function resetPassword() {
    if (!client) return;
    const email = document.querySelector('[data-account-form] input[name="email"]')?.value.trim() || "";
    if (!isValidEmail(email)) return setStatus("Escribí primero tu correo electrónico.", "error");
    setBusy(true, "Enviando correo...");
    const result = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${getRootPath()}`
    });
    setBusy(false);
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    setStatus("Te enviamos un enlace para recuperar tu contraseña.", "success");
  }

  async function updatePassword() {
    if (!client || !session) return;
    const input = document.querySelector('[data-account-password-form] input[name="newPassword"]');
    const password = input?.value || "";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setStatus(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`, "error");
    }
    setBusy(true, "Guardando la contraseña...");
    const result = await client.auth.updateUser({ password });
    setBusy(false);
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    recoveryMode = false;
    if (input) input.value = "";
    renderAccountState();
    setStatus("Contraseña actualizada correctamente.", "success");
  }

  async function signOut() {
    if (!client) return;
    setBusy(true, "Cerrando sesión...");
    if (session) await synchronize("signout");
    const result = await client.auth.signOut();
    setBusy(false);
    if (result.error) return setStatus("No se pudo cerrar la sesión. Probá nuevamente.", "error");
    session = null;
    clearLocalAccountData();
    renderAccountState();
    setStatus("Sesión cerrada. Los datos de la cuenta se retiraron de este dispositivo.", "info");
  }

  async function synchronize(reason) {
    if (!client || !session || syncing) return;
    syncing = true;
    updateSyncLabel("Sincronizando...");
    try {
      const userId = session.user.id;
      const result = await client.from("user_states")
        .select("state, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) throw result.error;

      const localState = captureLocalState();
      const linkedUser = localStorage.getItem(LINKED_USER_KEY) || "";
      const localChangedAt = Number(localStorage.getItem(LOCAL_CHANGED_KEY) || 0);
      const cloudChangedAt = result.data?.updated_at ? Date.parse(result.data.updated_at) : 0;
      const localDirty = localStorage.getItem(DIRTY_KEY) === "true";

      if (linkedUser !== userId) {
        const accountState = result.data
          ? normalizeAccountState(result.data.state)
          : createEmptyAccountState();
        applyCloudState(accountState);
        if (!result.data) await uploadState(userId, accountState);
      } else if (!result.data) {
        await uploadState(userId, localState);
      } else if (localDirty && localChangedAt > cloudChangedAt) {
        await uploadState(userId, localState);
      } else {
        applyCloudState(result.data.state || {});
        localStorage.setItem(LOCAL_CHANGED_KEY, String(cloudChangedAt || Date.now()));
        localStorage.setItem(DIRTY_KEY, "false");
      }

      localStorage.setItem(LINKED_USER_KEY, userId);
      lastPullAt = Date.now();
      updateSyncLabel("Sincronizado");
      updateAccountIndicator(true);
      if (reason === "manual") setStatus("Tus dispositivos ya tienen la misma información.", "success");
    } catch (error) {
      updateSyncLabel("Pendiente de sincronizar");
      updateAccountIndicator(false);
      if (reason === "manual") setStatus("No pudimos sincronizar ahora. Tus datos siguen guardados en este dispositivo.", "error");
    } finally {
      syncing = false;
    }
  }

  async function uploadState(userId, state) {
    const updatedAt = new Date().toISOString();
    const result = await client.from("user_states").upsert({
      user_id: userId,
      state,
      updated_at: updatedAt
    }, { onConflict: "user_id" });
    if (result.error) throw result.error;
    localStorage.setItem(LOCAL_CHANGED_KEY, String(Date.parse(updatedAt)));
    localStorage.setItem(DIRTY_KEY, "false");
  }

  function captureLocalState() {
    const values = {};
    SYNC_KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (LIST_KEYS.has(key)) {
        try { values[key] = Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw || "[]") : []; }
        catch (_) { values[key] = []; }
      } else {
        values[key] = raw || (key === "estudiemos_theme" ? "dark" : "{}");
      }
    });
    return { version: 1, values };
  }

  function applyCloudState(state) {
    const values = normalizeAccountState(state).values;
    applyingCloud = true;
    try {
      SYNC_KEYS.forEach((key) => {
        const value = LIST_KEYS.has(key) ? JSON.stringify(Array.isArray(values[key]) ? values[key] : []) : String(values[key]);
        localStorage.setItem(key, value);
      });
    } finally {
      applyingCloud = false;
    }
    window.EstudiemosTheme?.sync?.();
    window.dispatchEvent(new CustomEvent("estudiemos:cloud-restored"));
  }

  function createEmptyAccountState() {
    let theme = "dark";
    try {
      const savedTheme = localStorage.getItem("estudiemos_theme");
      if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
    } catch (_) {}

    const values = {};
    SYNC_KEYS.forEach((key) => {
      if (LIST_KEYS.has(key)) values[key] = [];
      else if (key === "estudiemos_theme") values[key] = theme;
      else values[key] = "{}";
    });
    return { version: 1, values };
  }

  function normalizeAccountState(state) {
    const empty = createEmptyAccountState();
    const source = state?.values && typeof state.values === "object" ? state.values : {};
    SYNC_KEYS.forEach((key) => {
      if (!(key in source)) return;
      if (LIST_KEYS.has(key)) {
        empty.values[key] = Array.isArray(source[key]) ? source[key] : [];
      } else if (key === "estudiemos_theme") {
        empty.values[key] = source[key] === "light" ? "light" : "dark";
      } else {
        empty.values[key] = typeof source[key] === "string"
          ? source[key]
          : JSON.stringify(source[key] || {});
      }
    });
    return empty;
  }

  function clearLocalAccountData() {
    applyingCloud = true;
    try {
      PRIVATE_SYNC_KEYS.forEach((key) => {
        localStorage.setItem(key, LIST_KEYS.has(key) ? "[]" : "{}");
      });
      localStorage.removeItem(LINKED_USER_KEY);
      localStorage.removeItem(LOCAL_CHANGED_KEY);
      localStorage.removeItem(DIRTY_KEY);
    } finally {
      applyingCloud = false;
    }
    window.dispatchEvent(new CustomEvent("estudiemos:cloud-restored"));
  }

  function prepareLocalAccountSwitch(userId) {
    const linkedUser = localStorage.getItem(LINKED_USER_KEY) || "";
    if (linkedUser !== userId) clearLocalAccountData();
  }

  function markLocalChange() {
    localStorage.setItem(LOCAL_CHANGED_KEY, String(Date.now()));
    localStorage.setItem(DIRTY_KEY, "true");
    updateSyncLabel(session ? "Guardando cambios..." : "Solo en este dispositivo");
  }

  function scheduleSync() {
    if (!session) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => synchronize("change"), 900);
  }

  function refreshFromCloud() {
    if (!session || syncing || Date.now() - lastPullAt < 15000) return;
    synchronize("focus");
  }

  function getCredentials() {
    const form = document.querySelector("[data-account-form]");
    const email = form?.elements.email.value.trim() || "";
    const password = form?.elements.password.value || "";
    if (!isValidEmail(email)) {
      setStatus("Escribí un correo electrónico válido.", "error");
      return null;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`, "error");
      return null;
    }
    return { email, password };
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function authErrorMessage(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login")) return "El correo o la contraseña no son correctos.";
    if (message.includes("already registered")) return "Ese correo ya tiene una cuenta. Probá ingresar.";
    if (message.includes("email not confirmed")) return "Primero confirmá tu cuenta desde el correo que te enviamos.";
    if (message.includes("rate limit")) return "Hubo demasiados intentos. Esperá un momento y probá nuevamente.";
    return "No pudimos completar la operación. Revisá los datos e intentá nuevamente.";
  }

  function renderAccountState() {
    const loading = document.querySelector("[data-account-loading]");
    const auth = document.querySelector("[data-account-auth]");
    const profile = document.querySelector("[data-account-profile]");
    const unavailable = document.querySelector("[data-account-unavailable]");
    const passwordForm = document.querySelector("[data-account-password-form]");
    if (loading) loading.hidden = true;
    if (unavailable) unavailable.hidden = configAvailable;
    if (auth) auth.hidden = !configAvailable || Boolean(session);
    if (profile) profile.hidden = !configAvailable || !session;
    if (passwordForm) passwordForm.hidden = !recoveryMode || !session;
    const email = document.querySelector("[data-account-email]");
    if (email) email.textContent = session?.user?.email || "";
    updateAccountIndicator(Boolean(session));
    window.dispatchEvent(new CustomEvent("estudiemos:account-change", {
      detail: { available: configAvailable, user: session?.user || null }
    }));
  }

  function updateAccountIndicator(connected) {
    document.querySelector(".account-top-btn")?.classList.toggle("is-connected", connected);
  }

  function updateSyncLabel(text) {
    const label = document.querySelector("[data-account-sync-label]");
    if (label) label.textContent = text;
  }

  function setBusy(busy, message) {
    document.querySelectorAll(".account-form button, [data-account-profile] button").forEach((button) => {
      button.disabled = busy;
    });
    if (message) setStatus(message, "info");
  }

  function setStatus(message, type) {
    const status = document.querySelector("[data-account-status]");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.type = type || "info";
  }

  function hasAndroidBridge() {
    return Boolean(window.EstudiemosAndroid && typeof window.EstudiemosAndroid.postMessage === "function");
  }

  function requestAndroidWidget(widget) {
    if (!hasAndroidBridge() || !["agenda", "calendar", "streak", "pomodoro"].includes(widget)) return;
    window.EstudiemosAndroid.postMessage(JSON.stringify({ type: "widget-pin", widget }));
    setStatus("Android abrirá la confirmación para agregar el widget.", "success");
  }

  function supportsDesktopWidgets() {
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || hasAndroidBridge()) return false;
    return true;
  }

  async function openDesktopWidget(widget) {
    const manager = window.EstudiemosDesktopWidgets;
    if (!manager?.available) {
      setStatus("Los widgets de escritorio necesitan Chrome o Edge en una computadora.", "error");
      return;
    }
    const opened = await manager.open(widget);
    setStatus(
      opened ? "Widget abierto en una ventana independiente." : "El navegador bloqueó la ventana. Permití ventanas emergentes e intentá nuevamente.",
      opened ? "success" : "error"
    );
  }

  function installDesktopWidgets() {
    const link = document.createElement("a");
    link.href = new URL(`${getRootPath()}downloads/Estudiemos-Widgets.rmskin`, location.href).href;
    link.download = "Estudiemos-Widgets.rmskin";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("Descarga lista. Si todavía no tenés Rainmeter, instalalo desde la página de instalación. Después abrí el archivo y elegí Install.", "success");
  }

  async function updateApplication() {
    const button = document.querySelector("[data-account-update]");
    const label = document.querySelector("[data-account-update-label]");
    if (!button || button.disabled) return;

    button.disabled = true;
    if (label) label.textContent = "Buscando actualización...";
    setStatus("Comprobando la versión publicada.", "info");

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update().catch(() => null)));
        registrations.forEach((registration) => {
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        });
      }

      const currentUrl = new URL(location.href);
      currentUrl.searchParams.set("actualizar", String(Date.now()));
      sessionStorage.setItem("estudiemos_app_update_pending", "true");
      if (label) label.textContent = "Actualización lista";
      setStatus("Abriendo la versión más reciente...", "success");
      window.setTimeout(() => location.replace(currentUrl.href), 280);
    } catch (_) {
      button.disabled = false;
      if (label) label.textContent = "Actualizar Estudiemos";
      setStatus("No pudimos comprobar la actualización. Revisá tu conexión e intentá nuevamente.", "error");
    }
  }

  function cleanUpdateMarker() {
    const url = new URL(location.href);
    if (!url.searchParams.has("actualizar")) return;
    url.searchParams.delete("actualizar");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (sessionStorage.getItem("estudiemos_app_update_pending") === "true") {
      sessionStorage.removeItem("estudiemos_app_update_pending");
      sessionStorage.setItem("estudiemos_app_update_complete", "true");
    }
  }

  function openDialog() {
    const shell = document.querySelector(".account-shell");
    if (!shell) return;
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    document.body.classList.add("account-open");
    if (sessionStorage.getItem("estudiemos_app_update_complete") === "true") {
      sessionStorage.removeItem("estudiemos_app_update_complete");
      setStatus("Estudiemos está actualizado.", "success");
    } else {
      setStatus("", "info");
    }
    window.setTimeout(() => shell.querySelector("input, button")?.focus(), 0);
  }

  function closeDialog() {
    const shell = document.querySelector(".account-shell");
    if (!shell) return;
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    document.body.classList.remove("account-open");
    document.querySelector("[data-account-open]")?.focus();
  }

  function userIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"/></svg>';
  }

  function closeIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>';
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.2 16.2-4.4-4.4 1.4-1.4 3 3 8.6-8.6 1.4 1.4-10 10Z"/></svg>';
  }

  function updateIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8V4l-1.6 1.6A8 8 0 1 0 20 12h-2a6 6 0 1 1-2-4.5L13.5 10H19V8Z"/></svg>';
  }

  function desktopIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H4V4Zm2 2v8h12V6H6Zm4 11h4v2h3v2H7v-2h3v-2Z"/></svg>';
  }
})();
