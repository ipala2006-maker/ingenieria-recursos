(function () {
  if (window.EstudiemosAccount) return;
  const AUTH_ONLY = document.body?.classList?.contains('teacher-workspace') === true || document.body?.classList?.contains('course-invitation-page') === true;

  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js";
  const SUPABASE_INTEGRITY = "sha256-z1Kf6JgMvm8t0+OTDs+WNS7T09cSM7Z2Dk+Sf4m5S58=";
  const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const SYNC_KEYS = [
    "bandeja_favoritos",
    "bandeja_guardados",
    "bandeja_materias",
    "bandeja_recientes",
    "bandeja_agenda",
    "bandeja_horarios",
    "bandeja_calendario_papelera",
    "estudiemos_pomodoro_streak",
    "estudiemos_pomodoro_sync",
    "estudiemos_workspace_changed",
    "estudiemos_android_devices",
    "estudiemos_theme"
  ];
  const LIST_KEYS = new Set(SYNC_KEYS.filter((key) => !["estudiemos_theme", "estudiemos_pomodoro_streak", "estudiemos_pomodoro_sync", "estudiemos_workspace_changed"].includes(key)));
  const PRIVATE_SYNC_KEYS = SYNC_KEYS.filter((key) => key !== "estudiemos_theme");
  const LINKED_USER_KEY = "estudiemos_cloud_user";
  const LOCAL_CHANGED_KEY = "estudiemos_cloud_local_changed";
  const KEY_CHANGED_KEY = "estudiemos_cloud_key_changed";
  const DIRTY_KEY = "estudiemos_cloud_dirty";
  const WINDOWS_WIDGETS_READY_KEY = "estudiemos_windows_widgets_ready";
  const WINDOWS_WIDGET_PENDING_KEY = "estudiemos_windows_widget_pending";
  const WINDOWS_WIDGET_SETUP_URL = "https://estudiemos-app.vercel.app/instalar.html#pc-widgets";
  let widgetSetup = null, widgetLaunching = false, widgetResumeSignIn = false;
  const PENDING_REFERRAL_KEY = "estudiemos_pending_referral";
  const COMMERCIAL_LAUNCH_ENABLED = false;
  const WHATSAPP_BOT_ENABLED = false;
  const MIN_PASSWORD_LENGTH = 8;
  const INSTANCE_ID = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

  let client = null;
  let session = null;
  let configAvailable = false;
  let accountConfig = null;
  let accountInitializationComplete = false;
  let pendingNativeSession = null;
  let androidPushToken = '';
  let applyingNativeSession = false;
  let syncTimer = 0;
  let syncing = false;
  let synchronizedUserId = '';
  let syncRequested = false;
  let queuedSyncReason = "queued";
  let applyingCloud = false;
  let lastPullAt = 0;
  let lastResumeCheckAt = 0;
  let cloudRevision = "", cloudRevisionUser = "";
  let cachedCloudState = null, accountGeneration = 0;
  let compactVersions = null, compactAvailable = null, syncConflicts = 0;
  let syncFailures = 0, syncRetryAt = 0;
  let realtimeConnected = false;
  let realtimeChannel = null;
  let realtimeUserId = "";
  let cloudPollTimer = 0;
  let remoteRefreshTimer = 0;
  let recoveryMode = false;
  let whatsappStatusLoaded = false;
  let whatsappBusy = false;
  let referralStatusLoaded = false;
  let referralBusy = false;
  let referralShareCode = "";
  let readySettled = false;
  let captchaToken = "";
  let captchaWidgetId = null;
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  addAccountButton();
  addAccountDialog();
  if (COMMERCIAL_LAUNCH_ENABLED) captureReferralFromUrl();
  consumeWindowsWidgetsReadyMarker();
  bindAccountEvents();
  cleanUpdateMarker();
  initialize();

  window.EstudiemosAccount = {
    sync: () => synchronize("manual"),
    refresh: (options = {}) => synchronize(options.force ? "verify" : "widget"),
    getSyncUsage: () => getSyncUsage(),
    getUser: () => session?.user || null,
    isSynchronized: () => Boolean(session?.user?.id && (AUTH_ONLY || synchronizedUserId === session.user.id)),
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
            <p class="account-referral-invite" data-account-signup-invite hidden>Invitación detectada. El descuento se aplicará al verificar tu cuenta.</p>
            <div class="account-captcha" data-account-captcha hidden aria-label="Comprobación de seguridad"></div>
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
          <a class="account-secondary" href="/mi-espacio.html" data-account-drive>Mi espacio \u00b7 Conectar Google Drive</a>
          <section class="account-referrals" data-account-referrals hidden>
            <header>
              <div><strong>Referidos</strong><small>Quien llega con tu enlace obtiene 35%. Vos obtenés 45% al sumar 3 registros verificados este mes.</small></div>
              <span class="account-referral-discount" data-account-referral-discount>Sin descuento</span>
            </header>
            <p data-account-referral-email hidden>Confirmá tu correo desde el enlace que recibiste para activar los referidos. No necesitás SMS ni un primer pago.</p>
            <div class="account-referral-share" data-account-referral-share hidden>
              <div><small>Tu enlace personal</small><strong>Invitá a tus amigos</strong></div>
              <button class="account-secondary" type="button" data-account-referral-copy>Compartir enlace</button>
            </div>
            <p class="account-referral-progress" data-account-referral-progress>0 de 3 invitados verificados.</p>
          </section>
          <section class="account-whatsapp" data-account-whatsapp hidden>
            <span class="account-whatsapp__icon" aria-hidden="true">${messageIcon()}</span>
            <div class="account-whatsapp__copy">
              <strong>Organizar desde WhatsApp</strong>
              <small data-account-whatsapp-label>Comprobando vinculación...</small>
            </div>
            <button class="account-secondary" type="button" data-account-whatsapp-connect>Vincular</button>
            <button class="account-link" type="button" data-account-whatsapp-unlink hidden>Desvincular</button>
          </section>
          <form class="account-password-form" data-account-password-form hidden>
            <label>
              <span>Nueva contraseña</span>
              <input type="password" name="newPassword" minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" required placeholder="Mínimo ${MIN_PASSWORD_LENGTH} caracteres" />
            </label>
            <button class="account-primary" type="submit">Guardar nueva contraseña</button>
          </form>
          <button class="account-primary" type="button" data-account-sync>Sincronizar ahora</button>
          <details class="account-sync-usage" data-account-usage>
            <summary>Consumo de sincronización</summary>
            <dl data-account-usage-values></dl>
            <small>Solo este navegador. Tamaños JSON sin compresión; no incluyen cabeceras, Realtime, alarmas ni otros servicios.</small>
            <button class="account-link" type="button" data-account-usage-export>Exportar medición</button>
          </details>
          <button class="account-secondary" type="button" data-account-signout>Cerrar sesión</button>
        </div>

        <div class="account-unavailable" data-account-unavailable hidden>
          <p>La sincronización de cuentas está casi lista, pero falta conectar el almacenamiento seguro.</p>
        </div>

        <div class="account-app-actions">
          <a class="account-link" href="${getRootPath()}?tutorial=1" data-onboarding-replay>Ver recorrido de bienvenida</a>
          <button class="account-update" type="button" data-account-update>
            ${updateIcon()}
            <span>
              <strong data-account-update-label>Actualizar Estudiemos</strong>
              <small>Buscar y aplicar la versión más reciente</small>
            </span>
          </button>
          <a class="account-link" data-account-update-manual hidden href="https://github.com/ipala2006-maker/ingenieria-recursos/releases/download/android-latest/Estudiemos-Android.apk" target="_self" rel="noreferrer">${updateIcon()}<span>Descarga alternativa para Android</span></a>
        </div>

        <div class="account-android-widgets" data-account-android-widgets hidden>
          <strong>Widgets de Android</strong>
          <small>Elegí cuál querés agregar a la pantalla de inicio.</small>
          <div>
            <button class="account-secondary" type="button" data-account-widget="workspace">Mi espacio</button>
            <button class="account-secondary" type="button" data-account-widget="agenda">Inbox</button>
            <button class="account-secondary" type="button" data-account-widget="calendar">Calendario</button>
            <button class="account-secondary" type="button" data-account-widget="pomodoro">Pomodoro</button>
            <button class="account-secondary" type="button" data-account-widget="streak">Racha</button>
          </div>
        </div>

        <div class="account-android-widgets account-desktop-widgets" data-account-desktop-widgets hidden>
          <strong>Widgets de escritorio</strong>
          <small>Elegí el que querés agregar. Te acompañamos sin salir de Estudiemos.</small>
          <div>
            <button class="account-secondary" type="button" data-account-desktop-widget="workspace">+ Mi espacio</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="inbox">+ Inbox</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="calendar">+ Calendario</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="pomodoro">+ Pomodoro</button>
            <button class="account-secondary" type="button" data-account-desktop-widget="streak">+ Racha</button>
          </div>
          <button class="account-widget-installer" type="button" data-account-install-widgets>
            ${desktopIcon()}
            <span><strong>Configurar widgets</strong><small>Continuar la instalación o resolver un problema</small></span>
          </button>
          <button class="account-widget-installer" type="button" data-account-setup-alarms>
            ${desktopIcon()}
            <span><strong>Alarmas con la app cerrada</strong><small>Activar o comprobar la pantalla completa en Windows</small></span>
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
    const desktopInstaller = shell.querySelector("[data-account-install-widgets]");
    if (desktopInstaller) desktopInstaller.hidden = !isWindowsDevice();
    shell.querySelector('[data-account-setup-alarms]').hidden = !isWindowsDevice();
  }

  function bindAccountEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-account-open]")) openDialog();
      if (event.target.closest("[data-account-close]") || event.target === document.querySelector(".account-shell")) closeDialog();
      if (event.target.closest("[data-account-signup]")) signUp();
      if (event.target.closest("[data-account-reset]")) resetPassword();
      if (event.target.closest("[data-account-signout]")) signOut();
      if (event.target.closest("[data-account-sync]")) synchronize("manual");
      if (event.target.closest("[data-account-usage-export]")) exportSyncUsage();
      if (event.target.closest("[data-account-update]")) updateApplication();
      if (event.target.closest("[data-account-whatsapp-connect]")) connectWhatsApp();
      if (event.target.closest("[data-account-whatsapp-unlink]")) unlinkWhatsApp();
      if (event.target.closest("[data-account-referral-copy]")) copyReferralLink();
      const widgetButton = event.target.closest("[data-account-widget]");
      if (widgetButton) requestAndroidWidget(widgetButton.dataset.accountWidget);
      const desktopWidgetButton = event.target.closest("[data-account-desktop-widget]");
      if (desktopWidgetButton) openDesktopWidget(desktopWidgetButton.dataset.accountDesktopWidget);
      if (event.target.closest("[data-account-install-widgets]")) installDesktopWidgets();
      if (event.target.closest('[data-account-setup-alarms]')) { closeDialog(); window.EstudiemosInboxAlarms?.showSetup(); }
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
      markLocalChange(key);
      if (key === "estudiemos_pomodoro_sync") synchronize("pomodoro");
      else scheduleSync();
    });

    window.addEventListener("focus", () => scheduleRemoteRefresh());
    window.addEventListener('estudiemos:resume-synced', event => {
      if(event.detail?.userId===session?.user?.id)showResumeNotice();
    });
    window.addEventListener("pageshow", () => {
      if (session) {
        connectRealtime(session.user.id);
        startCloudPolling();
      }
      scheduleRemoteRefresh();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleRemoteRefresh();
    });
    window.addEventListener("online", () => { syncRetryAt = 0; scheduleRemoteRefresh(); });
    window.addEventListener("estudiemos-android-ready", syncAccountWithAndroid);
    window.addEventListener("estudiemos-android-native-session", applyNativeSession);
    window.addEventListener("estudiemos-android-push-token", registerAndroidPushToken);
    window.addEventListener("pagehide", disconnectRealtime);
  }

  async function initialize() {
    let stage = "config";
    try {
      const response = await fetch(`${getRootPath()}api/account-config`, { cache: "no-store" });
      const config = await response.json().catch(() => ({}));
      if (!response.ok || !config.enabled || !config.url || !config.publishableKey) throw new Error("not-configured");
      accountConfig = {
        url: config.url,
        publishableKey: config.publishableKey,
        captchaSiteKey: config.captchaSiteKey || "",
        firebase: config.firebase || null
      };
      stage = "library";
      await loadSupabaseLibrary();
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      setupCaptcha();
      configAvailable = true;

      stage = "session";
      if (pendingNativeSession?.accessToken && pendingNativeSession?.refreshToken) {
        applyingNativeSession = true;
        await client.auth.setSession({
          access_token: pendingNativeSession.accessToken,
          refresh_token: pendingNativeSession.refreshToken
        });
        applyingNativeSession = false;
      }
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      session = result.data.session;
      if (session) prepareLocalAccountSwitch(session.user.id);
      else if (localStorage.getItem(LINKED_USER_KEY)) clearLocalAccountData();
      accountInitializationComplete = true;
      renderAccountState();
      finishReady(true);
      if (session) {
        connectRealtime(session.user.id);
        startCloudPolling();
        await synchronize("startup");
        if (COMMERCIAL_LAUNCH_ENABLED) window.setTimeout(() => refreshReferralStatus(true), 500);
      }

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
          if (session) {
            connectRealtime(session.user.id);
            startCloudPolling();
          } else {
            disconnectRealtime();
          }
          renderAccountState();
          if (session && session.user.id !== previousUser) {
            await synchronize("signin");
            if (COMMERCIAL_LAUNCH_ENABLED) window.setTimeout(() => refreshReferralStatus(true), 500);
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
      if (source === SUPABASE_CDN) {
        script.integrity = SUPABASE_INTEGRITY;
        script.crossOrigin = "anonymous";
      }
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
    const captcha = getCaptchaOptions();
    if (captcha === null) return;
    setBusy(true, "Ingresando...");
    const result = await client.auth.signInWithPassword({ ...credentials, options: captcha });
    setBusy(false);
    resetCaptcha();
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    session = result.data.session;
    prepareLocalAccountSwitch(session.user.id);
    connectRealtime(session.user.id);
    startCloudPolling();
    renderAccountState();
    await synchronize("signin");
    setStatus("Cuenta conectada y datos sincronizados.", "success");
  }

  async function signUp() {
    if (!client) return;
    const credentials = getCredentials();
    if (!credentials) return;
    const captcha = getCaptchaOptions();
    if (captcha === null) return;
    const baseRedirect = new URL(getRootPath(), location.href);
    const emailRedirect = window.EstudiemosCourseInvitation?.confirmationUrl?.(baseRedirect) || baseRedirect;
    const pendingReferral = COMMERCIAL_LAUNCH_ENABLED ? normalizeReferralCode(localStorage.getItem(PENDING_REFERRAL_KEY)) : "";
    if (pendingReferral) emailRedirect.searchParams.set("ref", pendingReferral);
    setBusy(true, "Creando tu cuenta...");
    const result = await client.auth.signUp({
      ...credentials,
      options: { emailRedirectTo: emailRedirect.href, ...captcha }
    });
    setBusy(false);
    resetCaptcha();
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    if (result.data.session) {
      session = result.data.session;
      prepareLocalAccountSwitch(session.user.id);
      connectRealtime(session.user.id);
      startCloudPolling();
      renderAccountState();
      await synchronize("signin");
      setStatus("Cuenta creada y datos sincronizados.", "success");
      if (COMMERCIAL_LAUNCH_ENABLED) window.setTimeout(() => refreshReferralStatus(true), 300);
      return;
    }
    setStatus("Te enviamos un correo. Abrilo para confirmar tu cuenta y después ingresá.", "success");
  }

  function captureReferralFromUrl() {
    if (!COMMERCIAL_LAUNCH_ENABLED) return;
    const code = normalizeReferralCode(new URL(location.href).searchParams.get("ref"));
    if (code.length >= 8) localStorage.setItem(PENDING_REFERRAL_KEY, code);
    const message = document.querySelector("[data-account-signup-invite]");
    if (message) message.hidden = !normalizeReferralCode(localStorage.getItem(PENDING_REFERRAL_KEY));
  }


  async function refreshReferralStatus(force = false) {
    if (!COMMERCIAL_LAUNCH_ENABLED) {
      const section = document.querySelector("[data-account-referrals]");
      if (section) section.hidden = true;
      referralStatusLoaded = true;
      return;
    }
    if (!session?.access_token || (referralStatusLoaded && !force) || referralBusy) return;
    const requestingUser = session.user?.id;
    referralBusy = true;
    setReferralButtonsBusy(true);
    let canClaim = false;
    try {
      const response = await fetch(`${getRootPath()}api/plan-status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "referrals-unavailable");
      if (!session || session.user?.id !== requestingUser) return;
      referralStatusLoaded = true;
      renderReferralStatus(result.referral || {});
      canClaim = Boolean(result.referral?.emailVerified && !result.referral?.wasReferred);
    } catch (_) {
      const section = document.querySelector("[data-account-referrals]");
      if (section) section.hidden = true;
    } finally {
      referralBusy = false;
      setReferralButtonsBusy(false);
    }
    if (canClaim && session?.user?.id === requestingUser && normalizeReferralCode(localStorage.getItem(PENDING_REFERRAL_KEY))) {
      await claimReferralCode();
    }
  }


  async function claimReferralCode(explicitCode) {
    if (!COMMERCIAL_LAUNCH_ENABLED) return;
    if (!session?.access_token || referralBusy) return;
    const code = normalizeReferralCode(explicitCode || localStorage.getItem(PENDING_REFERRAL_KEY));
    if (code.length < 8) return;
    referralBusy = true;
    setReferralButtonsBusy(true);
    try {
      const result = await referralRequest({ action: "claim-referral", code });
      localStorage.removeItem(PENDING_REFERRAL_KEY);
      referralStatusLoaded = true;
      renderReferralStatus(result);
      setStatus("Invitación verificada. Tenés 35% este mes por registrarte con una invitación.", "success");
    } catch (error) {
      referralStatusLoaded = false;
      setStatus(error.message || "No pudimos aplicar la invitación.", "error");
    } finally {
      referralBusy = false;
      setReferralButtonsBusy(false);
    }
  }

  async function referralRequest(body) {
    if (!COMMERCIAL_LAUNCH_ENABLED) throw new Error("Referidos todavía no está activo.");
    const response = await fetch(`${getRootPath()}api/plan-status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "No pudimos actualizar tus referidos.");
    return result;
  }

  function renderReferralStatus(status) {
    const section = document.querySelector("[data-account-referrals]");
    if (!COMMERCIAL_LAUNCH_ENABLED) {
      if (section) section.hidden = true;
      return;
    }
    const share = document.querySelector("[data-account-referral-share]");
    if (section) section.hidden = !session;
    const emailNotice = document.querySelector("[data-account-referral-email]");
    if (emailNotice) emailNotice.hidden = Boolean(status.emailVerified);
    if (share) share.hidden = !status.emailVerified;
    referralShareCode = status.emailVerified ? normalizeReferralCode(status.code) : "";
    if (status.wasReferred) localStorage.removeItem(PENDING_REFERRAL_KEY);
    const discount = Math.max(0, Number(status.discountPercent) || 0);
    const badge = document.querySelector("[data-account-referral-discount]");
    if (badge) badge.textContent = discount ? `${discount}% este mes` : "Sin descuento";
    const count = Math.max(0, Number(status.qualifiedDirectCount) || 0);
    const progress = document.querySelector("[data-account-referral-progress]");
    if (progress) {
      if (count >= 3) progress.textContent = "45% por invitar a 3 personas verificadas este mes.";
      else if (discount === 35) progress.textContent = `35% por registrarte con una invitación · ${count} de 3 invitados propios.`;
      else progress.textContent = `${count} de 3 invitados verificados este mes. No necesitan pagar.`;
    }
  }

  async function copyReferralLink() {
    if (!COMMERCIAL_LAUNCH_ENABLED) return;
    const code = referralShareCode;
    if (!session || !code) return;
    const link = `https://estudiemos-app.vercel.app/instalar.html?ref=${encodeURIComponent(code)}`;
    try {
      if (navigator.share) await navigator.share({ title: "Estudiemos", text: "Organizate conmigo en Estudiemos", url: link });
      else await navigator.clipboard.writeText(link);
      setStatus(navigator.share ? "Invitación lista para compartir." : "Enlace de invitación copiado.", "success");
    } catch (_) {}
  }

  function normalizeReferralCode(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }



  function setReferralButtonsBusy(busy) {
    document.querySelectorAll("[data-account-referrals] button").forEach((button) => { button.disabled = busy; });
  }

  async function resetPassword() {
    if (!client) return;
    const email = document.querySelector('[data-account-form] input[name="email"]')?.value.trim() || "";
    if (!isValidEmail(email)) return setStatus("Escribí primero tu correo electrónico.", "error");
    const captcha = getCaptchaOptions();
    if (captcha === null) return;
    setBusy(true, "Enviando correo...");
    const result = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${getRootPath()}`,
      ...captcha
    });
    setBusy(false);
    resetCaptcha();
    if (result.error) return setStatus(authErrorMessage(result.error), "error");
    setStatus("Te enviamos un enlace para recuperar tu contraseña.", "success");
  }

  function setupCaptcha() {
    const container = document.querySelector("[data-account-captcha]");
    const sitekey = accountConfig?.captchaSiteKey || "";
    if (!container || !sitekey) return;
    container.hidden = false;
    loadExternalScript(TURNSTILE_SCRIPT).then(() => {
      if (!window.turnstile || captchaWidgetId !== null) return;
      captchaWidgetId = window.turnstile.render(container, {
        sitekey,
        theme: document.documentElement.classList.contains("theme-light") ? "light" : "dark",
        size: "flexible",
        appearance: "interaction-only",
        language: "es",
        callback: (token) => { captchaToken = String(token || ""); },
        "expired-callback": () => { captchaToken = ""; },
        "error-callback": () => { captchaToken = ""; }
      });
    }).catch(() => {
      setStatus("No pudimos cargar la comprobación de seguridad. Revisá tu conexión.", "error");
    });
  }

  function loadExternalScript(source) {
    const existing = document.querySelector(`script[src="${source}"]`);
    if (existing?.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = existing || document.createElement("script");
      const loaded = () => { script.dataset.loaded = "true"; resolve(); };
      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", reject, { once: true });
      if (!existing) {
        script.src = source;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }

  function getCaptchaOptions() {
    if (!accountConfig?.captchaSiteKey) return {};
    if (captchaToken) return { captchaToken };
    setStatus("Completá la comprobación de seguridad para continuar.", "error");
    return null;
  }

  function resetCaptcha() {
    captchaToken = "";
    if (captchaWidgetId !== null && window.turnstile) window.turnstile.reset(captchaWidgetId);
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
    referralStatusLoaded = false;
    disconnectRealtime();
    clearLocalAccountData();
    renderAccountState();
    setStatus("Sesión cerrada. Los datos de la cuenta se retiraron de este dispositivo.", "info");
  }

  async function synchronize(reason) {
    if (AUTH_ONLY) { updateSyncLabel(session ? 'Conectado' : 'Sin sesión'); return Boolean(session); }
    if (!client || !session) return false;
    const background = reason === "poll" || reason === "widget";
    if (syncing) {
      if (!background) { syncRequested = true; queuedSyncReason = reason; }
      return false;
    }
    if (navigator.onLine === false) return false;
    const userId = session.user.id;
    const generation = accountGeneration;
    const dirty = localStorage.getItem(DIRTY_KEY) === "true";
    const hydrated = synchronizedUserId === userId && localStorage.getItem(LINKED_USER_KEY) === userId;
    const resuming = reason === 'resume';
    if(resuming && hydrated && !dirty && Date.now()>=lastResumeCheckAt && Date.now()-lastResumeCheckAt<2500)return true;
    if (reason !== "manual" && Date.now() < syncRetryAt) return false;
    if (background && hydrated && !dirty && Date.now() - lastPullAt < cloudCheckInterval()) return true;
    syncing = true;
    if(resuming)lastResumeCheckAt=Date.now();
    const agendaBefore=localStorage.getItem('bandeja_agenda');
    if (!background) updateSyncLabel("Sincronizando...");
    try {
      // The RPC checks the revision atomically. A fresh read before every own
      // edit is redundant; a conflict still takes the normal merge/retry path.
      if (hydrated && dirty && compactAvailable === true && compactVersions && cachedCloudState && cloudRevisionUser === userId && cloudRevision && ["change", "pomodoro"].includes(reason)) {
        const state = mergeAccountStates(captureLocalState(), normalizeAccountState(cachedCloudState, Date.parse(cloudRevision) || 0));
        applyCloudState(state);
        await uploadState(userId, state, true);
        if (session?.user?.id !== userId || accountGeneration !== generation) return false;
        finishSynchronization(reason, userId);
        return true;
      }
      // Quiet backup checks need just a timestamp, not every key fingerprint.
      // Only background reads use this probe, so user actions keep their latency.
      if ((background || resuming) && hydrated && !dirty && (resuming || compactAvailable === true && compactVersions) && cachedCloudState && cloudRevisionUser === userId && cloudRevision) {
        let check=client.from('user_states').select('updated_at').eq('user_id',userId);
        if(resuming)check=check.neq('updated_at',cloudRevision);
        const probe = await check.maybeSingle();
        if (session?.user?.id !== userId || accountGeneration !== generation) return false;
        if (probe.error) throw probe.error;
        recordSyncUsage(userId, { checks: 1, receivedBytes: syncJsonBytes(probe.data) });
        if ((resuming && !probe.data || probe.data?.updated_at === cloudRevision) && localStorage.getItem(DIRTY_KEY) !== "true") {
          recordSyncUsage(userId, { unchangedChecks: 1 });
          finishSynchronization(reason, userId, false);
          return true;
        }
      }
      let compact = await compactSync();
      let query = compact ? null : client.from("user_states")
        .select("state, updated_at")
        .eq("user_id", userId);
      // RLS still scopes the row. An unchanged revision returns no state payload.
      const conditional = hydrated && cachedCloudState && cloudRevisionUser === userId && cloudRevision && !["manual", "signout"].includes(reason);
      if (conditional && query) query = query.neq("updated_at", cloudRevision);
      const result = compact ? {data:compact.missing?null:{state:mergeCompactState(compact),updated_at:compact.updated_at}} : await query.maybeSingle();
      if (session?.user?.id !== userId || accountGeneration !== generation) return false;
      if (result.error) throw result.error;
      const compactChanged=compact&&!compact.missing&&Object.keys(compact.versions).some(key=>compactVersions?.[key]!==compact.versions[key]);
      recordSyncUsage(userId, { checks: 1, fullDownloads: compact?(!cachedCloudState&&result.data?1:0):result.data?1:0, unchangedChecks: compact?!compactChanged?1:0:conditional&&!result.data?1:0, receivedBytes: compact?compact.receivedJsonBytes:syncJsonBytes(result.data),sentBytes:compact?syncJsonBytes({p_known:compactKnown(),p_patch:null,p_expected:null}):0, ...(result.data ? {profileBytes:syncJsonBytes(result.data.state)} : {}) });
      if (compact)compactVersions=compact.versions;
      if ((compact?!compactChanged&&hydrated:conditional&&!result.data) && localStorage.getItem(DIRTY_KEY) !== "true") {
        if(compact?.updated_at)cloudRevision=compact.updated_at;
        lastPullAt = Date.now(); syncFailures = 0; syncRetryAt = 0;
        updateSyncLabel("Sincronizado"); updateAccountIndicator(true);
        return true;
      }
      const remote = result.data || (conditional ? {state:cachedCloudState, updated_at:cloudRevision} : null);
      cloudRevisionUser = userId; cloudRevision = remote?.updated_at || "";
      cachedCloudState = remote?.state || null;

      const localState = captureLocalState();
      const linkedUser = localStorage.getItem(LINKED_USER_KEY) || "";
      const cloudChangedAt = remote?.updated_at ? Date.parse(remote.updated_at) : 0;
      const localDirty = localStorage.getItem(DIRTY_KEY) === "true";
      const cloudState = remote ? normalizeAccountState(remote.state, cloudChangedAt) : null;

      if (linkedUser !== userId) {
        const accountState = cloudState || createEmptyAccountState();
        applyCloudState(accountState);
        if (!remote) await uploadState(userId, accountState);
      } else if (!remote) {
        await uploadState(userId, localState);
      } else {
        const mergedState = mergeAccountStates(localState, cloudState);
        applyCloudState(mergedState);
        if (localDirty || JSON.stringify(mergedState) !== JSON.stringify(cloudState)) {
          await uploadState(userId, mergedState);
        } else {
          localStorage.setItem(LOCAL_CHANGED_KEY, String(cloudChangedAt || Date.now()));
          localStorage.setItem(DIRTY_KEY, "false");
        }
      }

      if (session?.user?.id !== userId || accountGeneration !== generation) return false;
      finishSynchronization(reason, userId);
      if(resuming && agendaBefore!==localStorage.getItem('bandeja_agenda')){
        window.dispatchEvent(new CustomEvent('estudiemos:resume-synced',{detail:{userId}}));
      }
      return true;
    } catch (error) {
      if (session?.user?.id !== userId || accountGeneration !== generation) return false;
      if(error.code==='SYNC_CONFLICT'&&++syncConflicts<=3){syncRequested=true;queuedSyncReason='conflict';return false;}
      syncFailures = Math.min(syncFailures + 1, 5);
      syncRetryAt = Date.now() + Math.min(300000, 15000 * 2 ** syncFailures);
      recordSyncUsage(userId, { errors: 1 });
      updateSyncLabel("Pendiente de sincronizar");
      updateAccountIndicator(false);
      if (reason === "manual") setStatus("No pudimos sincronizar ahora. Tus datos siguen guardados en este dispositivo.", "error");
      return false;
    } finally {
      syncing = false;
      if (syncRequested) {
        syncRequested = false;
        const nextReason = queuedSyncReason; queuedSyncReason = "queued";
        window.setTimeout(() => synchronize(nextReason), 80);
      }
    }
  }

  function finishSynchronization(reason, userId, notify = true) {
    localStorage.setItem(LINKED_USER_KEY, userId);
    synchronizedUserId = userId;
    if (notify) window.dispatchEvent(new CustomEvent('estudiemos:account-synced', { detail: { userId } }));
    lastPullAt = Date.now();
    syncFailures = 0; syncRetryAt = 0; syncConflicts = 0;
    updateSyncLabel("Sincronizado");
    updateAccountIndicator(true);
    if (reason === "manual") setStatus("Tus dispositivos ya tienen la misma información.", "success");
  }

  async function uploadState(userId, state, requireCompact = false) {
    if (session?.user?.id !== userId) throw new Error("account-changed");
    const generation = accountGeneration;
    const before = JSON.stringify(captureLocalState());
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(cloudRevision) || 0) + 1)).toISOString();
    const row = {
      user_id: userId,
      state,
      updated_at: updatedAt
    };
    const patch={values:{},changedAt:{}};
    SYNC_KEYS.forEach(key=>{if(!cachedCloudState||JSON.stringify(state.values[key])!==JSON.stringify(cachedCloudState.values?.[key])||state.changedAt[key]!==cachedCloudState.changedAt?.[key]){patch.values[key]=state.values[key];patch.changedAt[key]=state.changedAt[key]||0;}});
    const compactArgs={p_patch:patch,p_known:compactKnown(),p_expected:cloudRevision||null};
    const compact=compactVersions?await compactSync(patch,cloudRevision):null;
    if (requireCompact && !compact) {
      const error = new Error('La sincronización cambió. Comprobando la versión actual.');
      error.code = 'SYNC_CONFLICT';
      throw error;
    }
    const result=compact?{error:null}:await client.from("user_states").upsert(row, { onConflict: "user_id" });
    if (session?.user?.id !== userId || accountGeneration !== generation) throw new Error("account-changed");
    if (result.error) throw result.error;
    if(compact?.conflict){const error=new Error('La información cambió en otro dispositivo.');error.code='SYNC_CONFLICT';throw error;}
    cloudRevisionUser = userId; cloudRevision = compact?.updated_at||updatedAt;
    if(compact)compactVersions=compact.versions;
    cachedCloudState = state;
    recordSyncUsage(userId, { uploads: 1, sentBytes: syncJsonBytes(compact?compactArgs:row), receivedBytes:compact?compact.receivedJsonBytes:0, profileBytes: syncJsonBytes(state) });
    if (JSON.stringify(captureLocalState()) === before) {
      localStorage.setItem(LOCAL_CHANGED_KEY, String(Date.parse(updatedAt)));
      localStorage.setItem(DIRTY_KEY, "false");
    } else { syncRequested = true; queuedSyncReason = "change"; }
    broadcastStateUpdate(userId, cloudRevision);
    notifyAndroidWidgets(state);
  }

  function compactKnown() { return {...compactVersions,_listDelta:1,_compactVersions:1}; }

  async function compactSync(patch=null,expected=null) {
    if(typeof client?.rpc!=='function'||compactAvailable===false)return null;
    const result=await client.rpc('sync_account_state',{p_known:compactKnown(),p_patch:patch,p_expected:expected||null});
    if(result.error){if(['PGRST202','42883'].includes(result.error.code)){compactAvailable=false;return null;}throw result.error;}
    const data=result.data;
    if(!data||typeof data.versions!=='object'||!data.missing&&!data.written&&(!data.state||typeof data.state.values!=='object'||typeof data.state.changedAt!=='object'))throw new Error('Respuesta de sincronización inválida.');
    const receivedJsonBytes=syncJsonBytes(data);
    const response={...data,versions:data.versionsPartial===true?{...compactVersions,...data.versions}:data.versions};
    Object.defineProperty(response,'receivedJsonBytes',{value:receivedJsonBytes});
    compactAvailable=true;return response;
  }

  function mergeCompactState(data){
    try {
      const state={version:2,values:{...(cachedCloudState?.values||{}),...data.state.values},changedAt:{...(cachedCloudState?.changedAt||{}),...data.state.changedAt}};
      const lists=data.state.lists||{};
      for(const [key,delta] of Object.entries(lists)) {
        if(!LIST_KEYS.has(key)||delta?.base!==compactVersions?.[key]||delta?.target!==data.versions[key]||!Array.isArray(state.values[key])||!Array.isArray(delta.put)||!Array.isArray(delta.remove))throw new Error('Cambio de lista inválido.');
        const items=new Map(state.values[key].map(item=>[item?.id,item]));
        if(items.size!==state.values[key].length||[...items.keys()].some(id=>typeof id!=='string'))throw new Error('Lista base inválida.');
        for(const id of delta.remove){if(typeof id!=='string'||!items.has(id))throw new Error('Elemento eliminado inválido.');items.delete(id);}
        for(const item of delta.put){if(!item||typeof item.id!=='string')throw new Error('Elemento modificado inválido.');items.set(item.id,item);}
        if(delta.order!==null&&(!Array.isArray(delta.order)||delta.order.length!==items.size||new Set(delta.order).size!==items.size||delta.order.some(id=>!items.has(id))))throw new Error('Orden de lista inválido.');
        state.values[key]=delta.order===null?[...items.values()]:delta.order.map(id=>items.get(id));
      }
      for(const key of SYNC_KEYS)if(compactVersions?.[key]!==data.versions[key]&&!Object.hasOwn(data.state.values,key)&&!Object.hasOwn(lists,key)){delete state.values[key];delete state.changedAt[key];}
      return state;
    } catch (error) {
      // A damaged delta must recover with a full snapshot on the next attempt.
      compactVersions=null;
      throw error;
    }
  }

  function captureLocalState() {
    const values = {};
    const changedAt = {};
    const savedChangedAt = readKeyChangedAt();
    const fallbackAt = Number(localStorage.getItem(LOCAL_CHANGED_KEY) || 0);
    SYNC_KEYS.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (LIST_KEYS.has(key)) {
        try { values[key] = Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw || "[]") : []; }
        catch (_) { values[key] = []; }
      } else {
        values[key] = raw || (key === "estudiemos_theme" ? "dark" : key === "estudiemos_workspace_changed" ? "0" : "{}");
      }
      // New private calendar lists must not inherit an unrelated change timestamp.
      changedAt[key] = Object.hasOwn(savedChangedAt,key) ? Math.max(0,Number(savedChangedAt[key])||0) : (["bandeja_horarios", "bandeja_calendario_papelera", "estudiemos_pomodoro_sync"].includes(key) ? 0 : fallbackAt) || 0;
    });
    return { version: 2, values, changedAt };
  }

  function applyCloudState(state) {
    const normalized = normalizeAccountState(state);
    const values = normalized.values;
    let changed = false;
    applyingCloud = true;
    try {
      SYNC_KEYS.forEach((key) => {
        const value = LIST_KEYS.has(key) ? JSON.stringify(Array.isArray(values[key]) ? values[key] : []) : String(values[key]);
        if (localStorage.getItem(key) !== value) {
          localStorage.setItem(key, value);
          changed = true;
        }
      });
      localStorage.setItem(KEY_CHANGED_KEY, JSON.stringify(normalized.changedAt));
    } finally {
      applyingCloud = false;
    }
    if (changed) {
      window.EstudiemosTheme?.sync?.();
      window.dispatchEvent(new CustomEvent("estudiemos:cloud-restored"));
    }
  }

  function createEmptyAccountState() {
    let theme = "dark";
    try {
      const savedTheme = localStorage.getItem("estudiemos_theme");
      if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
    } catch (_) {}

    const values = {};
    const changedAt = {};
    SYNC_KEYS.forEach((key) => {
      if (LIST_KEYS.has(key)) values[key] = [];
      else if (key === "estudiemos_theme") values[key] = theme;
      else if (key === "estudiemos_workspace_changed") values[key] = "0";
      else values[key] = "{}";
      changedAt[key] = 0;
    });
    return { version: 2, values, changedAt };
  }

  function normalizeAccountState(state, fallbackAt = 0) {
    const empty = createEmptyAccountState();
    const source = state?.values && typeof state.values === "object" ? state.values : {};
    const sourceChangedAt = state?.changedAt && typeof state.changedAt === "object" ? state.changedAt : {};
    SYNC_KEYS.forEach((key) => {
      if (!(key in source)) return;
      if (LIST_KEYS.has(key)) {
        empty.values[key] = Array.isArray(source[key]) ? source[key] : [];
      } else if (key === "estudiemos_theme") {
        empty.values[key] = source[key] === "light" ? "light" : "dark";
      } else if (key === "estudiemos_workspace_changed") {
        empty.values[key] = String(Math.max(0, Number(source[key]) || 0));
      } else {
        empty.values[key] = typeof source[key] === "string"
          ? source[key]
          : JSON.stringify(source[key] || {});
      }
      empty.changedAt[key] = Object.hasOwn(sourceChangedAt,key) ? Math.max(0,Number(sourceChangedAt[key])||0) : Math.max(0,(key === "estudiemos_pomodoro_sync" ? 0 : Number(fallbackAt))||0);
    });
    return empty;
  }

  function mergeAccountStates(localState, cloudState) {
    const local = normalizeAccountState(localState);
    const cloud = normalizeAccountState(cloudState);
    const merged = createEmptyAccountState();
    SYNC_KEYS.forEach((key) => {
      const localAt = Number(local.changedAt[key]) || 0;
      const cloudAt = Number(cloud.changedAt[key]) || 0;
      const source = localAt > cloudAt ? local : cloud;
      merged.values[key] = source.values[key];
      merged.changedAt[key] = Math.max(localAt, cloudAt);
    });

    const key = "estudiemos_pomodoro_streak";
    const timerKey = "estudiemos_pomodoro_sync";
    if (window.EstudiemosPomodoroSync) {
      const timer = window.EstudiemosPomodoroSync.choose(local.values[timerKey], cloud.values[timerKey]);
      merged.values[timerKey] = JSON.stringify(timer || {});
      merged.changedAt[timerKey] = timer?.updatedAt || 0;
    }
    const localStreak = parseObject(local.values[key]);
    const cloudStreak = parseObject(cloud.values[key]);
    const days = mergeNumericMap(localStreak.days, cloudStreak.days);
    const carrySeconds = mergeNumericMap(localStreak.carrySeconds, cloudStreak.carrySeconds, 59);
    const reminderSlots = { ...(cloudStreak.reminderSlots || {}), ...(localStreak.reminderSlots || {}) };
    Object.keys(reminderSlots).forEach((date) => {
      const left = Array.isArray(localStreak.reminderSlots?.[date]) ? localStreak.reminderSlots[date] : [];
      const right = Array.isArray(cloudStreak.reminderSlots?.[date]) ? cloudStreak.reminderSlots[date] : [];
      reminderSlots[date] = Array.from(new Set([...left, ...right]));
    });
    merged.values[key] = JSON.stringify({ version: 3, days, carrySeconds, reminderSlots, ...window.EstudiemosStudyGoal.merge(localStreak, cloudStreak) });

    const devicesKey = "estudiemos_android_devices";
    const devices = new Map();
    [...(cloud.values[devicesKey] || []), ...(local.values[devicesKey] || [])].forEach((device) => {
      const token = typeof device === "string" ? device : device?.token;
      if (!token || typeof token !== "string") return;
      const current = devices.get(token);
      const candidate = typeof device === "string"
        ? { token, platform: "android", updatedAt: 0 }
        : { token, platform: "android", updatedAt: Math.max(0, Number(device.updatedAt) || 0) };
      if (!current || candidate.updatedAt >= current.updatedAt) devices.set(token, candidate);
    });
    merged.values[devicesKey] = Array.from(devices.values()).slice(-8);
    merged.changedAt[devicesKey] = Math.max(
      Number(local.changedAt[devicesKey]) || 0,
      Number(cloud.changedAt[devicesKey]) || 0
    );
    return merged;
  }

  function mergeNumericMap(primary, secondary, maximum = Number.MAX_SAFE_INTEGER) {
    const result = {};
    const keys = new Set([
      ...Object.keys(primary && typeof primary === "object" ? primary : {}),
      ...Object.keys(secondary && typeof secondary === "object" ? secondary : {})
    ]);
    keys.forEach((key) => {
      const value = Math.min(maximum, Math.max(0, Number(primary?.[key]) || 0, Number(secondary?.[key]) || 0));
      if (value > 0) result[key] = Math.floor(value);
    });
    return result;
  }

  function parseObject(value) {
    if (value && typeof value === "object") return value;
    try {
      const parsed = JSON.parse(String(value || "{}"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function readKeyChangedAt() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY_CHANGED_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_) {
      return {};
    }
  }

  function clearLocalAccountData() {
    compactVersions=null;syncConflicts=0;
    synchronizedUserId = ""; cloudRevision = ""; cloudRevisionUser = "";
    cachedCloudState = null; accountGeneration++;
    lastPullAt = 0; lastResumeCheckAt = 0; syncFailures = 0; syncRetryAt = 0;
    applyingCloud = true;
    try {
      PRIVATE_SYNC_KEYS.forEach((key) => {
        localStorage.setItem(key, LIST_KEYS.has(key) ? "[]" : key === "estudiemos_workspace_changed" ? "0" : "{}");
      });
      localStorage.removeItem(LINKED_USER_KEY);
      localStorage.removeItem(LOCAL_CHANGED_KEY);
      localStorage.removeItem(KEY_CHANGED_KEY);
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

  function markLocalChange(key) {
    const changedAt = Date.now();
    const keyChangedAt = readKeyChangedAt();
    keyChangedAt[key] = changedAt;
    localStorage.setItem(KEY_CHANGED_KEY, JSON.stringify(keyChangedAt));
    localStorage.setItem(LOCAL_CHANGED_KEY, String(changedAt));
    localStorage.setItem(DIRTY_KEY, "true");
    updateSyncLabel(session ? "Guardando cambios..." : "Solo en este dispositivo");
  }

  function scheduleSync() {
    if (!session) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => synchronize("change"), 600);
  }

  function connectRealtime(userId) {
    if (AUTH_ONLY) return;
    if (!client || !userId || (realtimeChannel && realtimeUserId === userId)) return;
    disconnectRealtime();
    realtimeUserId = userId;
    realtimeChannel = client
      .channel(`estudiemos-state:${userId}`)
      .on("broadcast", { event: "state-updated" }, ({ payload }) => {
        if (payload?.sender === INSTANCE_ID) return;
        if (payload?.updatedAt !== cloudRevision) scheduleRemoteRefresh("realtime");
      })
      .subscribe(status => {
        if (realtimeUserId !== userId) return;
        realtimeConnected = status === "SUBSCRIBED";
        if (realtimeConnected) scheduleRemoteRefresh("realtime");
      });
  }

  function disconnectRealtime() {
    window.clearTimeout(remoteRefreshTimer);
    window.clearInterval(cloudPollTimer);
    remoteRefreshTimer = 0;
    cloudPollTimer = 0;
    if (client && realtimeChannel) client.removeChannel(realtimeChannel).catch?.(() => {});
    realtimeChannel = null;
    realtimeUserId = "";
    realtimeConnected = false;
  }

  function scheduleRemoteRefresh(reason = "resume") {
    if (AUTH_ONLY) return;
    window.clearTimeout(remoteRefreshTimer);
    remoteRefreshTimer = window.setTimeout(() => synchronize(reason), 150);
  }

  function broadcastStateUpdate(userId, updatedAt) {
    if (!realtimeChannel || realtimeUserId !== userId) return;
    Promise.resolve(realtimeChannel.send({
      type: "broadcast",
      event: "state-updated",
      payload: { sender: INSTANCE_ID, updatedAt }
    })).then(status => { if (status !== "ok") realtimeConnected = false; }).catch(() => { realtimeConnected = false; });
  }

  function cloudCheckInterval() {
    if (syncFailures) return 30000;
    return document.visibilityState === "visible" ? realtimeConnected ? 120000 : 30000 : 300000;
  }

  function startCloudPolling() {
    if (AUTH_ONLY) return;
    window.clearInterval(cloudPollTimer);
    // Spread backup checks without delaying edits, alarms or Realtime events.
    const interval = 5000 + Math.floor(Math.random() * 5001);
    cloudPollTimer = window.setInterval(() => {
      if (Date.now() - lastPullAt >= cloudCheckInterval()) synchronize("poll");
    }, interval);
  }

  function syncJsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value) || "null").length;
  }

  function readSyncUsage(userId) {
    const fields = ["checks", "fullDownloads", "unchangedChecks", "receivedBytes", "uploads", "sentBytes", "errors", "profileBytes"];
    const days = {};
    try {
      const saved = JSON.parse(localStorage.getItem("estudiemos_sync_usage:" + userId) || "{}");
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
      const today = syncUsageDay(new Date()), first = syncUsageDay(cutoff);
      for (const [day, values] of Object.entries(saved.days || {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < first || day > today) continue;
        days[day] = Object.fromEntries(fields.map(field => [field, Math.min(1e12, Math.max(0, Math.floor(Number(values?.[field]) || 0)))]));
      }
    } catch (_) {}
    return {version:1, days};
  }

  function syncUsageDay(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function recordSyncUsage(userId, delta) {
    try {
      const saved = readSyncUsage(userId), day = syncUsageDay(new Date());
      const entry = saved.days[day] || {};
      for (const [field, value] of Object.entries(delta)) entry[field] = field === "profileBytes" ? value : (entry[field] || 0) + value;
      saved.days[day] = entry;
      localStorage.setItem("estudiemos_sync_usage:" + userId, JSON.stringify(saved));
      if (document.querySelector("[data-account-usage][open]")) renderSyncUsage();
    } catch (_) { /* Local measurement must never prevent synchronization. */ }
  }

  function getSyncUsage() {
    const report = {version:1, scope:"this-browser", unit:"uncompressed-json-bytes", days:{}};
    if (!session?.user?.id) return report;
    report.days = readSyncUsage(session.user.id).days;
    return report;
  }

  function renderSyncUsage() {
    const container = document.querySelector("[data-account-usage-values]");
    if (!container) return;
    const report = getSyncUsage(), days = Object.keys(report.days).sort();
    const today = report.days[syncUsageDay(new Date())] || {};
    const total = days.reduce((sum, day) => sum + (report.days[day].receivedBytes || 0), 0);
    const profile = report.days[days.at(-1)]?.profileBytes || 0;
    const bytes = value => value < 1000 ? value + " B" : new Intl.NumberFormat("es-AR", {maximumFractionDigits:2}).format(value / (value < 1e6 ? 1000 : 1e6)) + (value < 1e6 ? " KB" : " MB");
    container.replaceChildren();
    for (const [label, value] of [["Perfil sincronizado", bytes(profile)], ["Recibido hoy", bytes(today.receivedBytes || 0)], ["Recibido en los últimos 31 días", bytes(total)], ["Comprobaciones sin cambios hoy", String(today.unchangedChecks || 0)], ["Descargas completas hoy", String(today.fullDownloads || 0)]]) {
      const term = document.createElement("dt"), description = document.createElement("dd");
      term.textContent = label; description.textContent = value; container.append(term, description);
    }
  }

  function exportSyncUsage() {
    if (!session) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(getSyncUsage(), null, 2)], {type:"application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = "estudiemos-consumo-" + syncUsageDay(new Date()) + ".json";
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  function showResumeNotice(){
    let notice=document.querySelector('[data-resume-sync-notice]');
    if(!notice){
      notice=document.createElement('div');notice.dataset.resumeSyncNotice='';notice.className='account-resume-notice';
      notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');document.body.appendChild(notice);
    }
    notice.textContent='Agenda actualizada desde otro dispositivo.';
    window.clearTimeout(notice.hideTimer);notice.hideTimer=window.setTimeout(()=>notice.remove(),4500);
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
    renderSyncUsage();
    if (session && WHATSAPP_BOT_ENABLED && !whatsappStatusLoaded) refreshWhatsAppStatus();
    if (session && COMMERCIAL_LAUNCH_ENABLED && !referralStatusLoaded) refreshReferralStatus();
    if (!session) {
      whatsappStatusLoaded = false;
      referralStatusLoaded = false;
      referralShareCode = "";
      renderWhatsAppStatus({ linked: false, configured: WHATSAPP_BOT_ENABLED });
    }
    updateAccountIndicator(Boolean(session));
    syncAccountWithAndroid();
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

  async function refreshWhatsAppStatus(force = false) {
    if (!WHATSAPP_BOT_ENABLED) {
      renderWhatsAppStatus({ configured: false, linked: false });
      whatsappStatusLoaded = true;
      return;
    }
    if (!session?.access_token || (whatsappStatusLoaded && !force) || whatsappBusy) return;
    whatsappBusy = true;
    setWhatsAppButtonsBusy(true);
    try {
      const response = await fetch(`${getRootPath()}api/whatsapp-link`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      whatsappStatusLoaded = true;
      renderWhatsAppStatus({ ...result, configured: response.ok ? true : result.configured !== false });
    } catch (_) {
      renderWhatsAppStatus({ configured: false, linked: false });
    } finally {
      whatsappBusy = false;
      setWhatsAppButtonsBusy(false);
    }
  }

  async function connectWhatsApp() {
    if (!WHATSAPP_BOT_ENABLED) return;
    if (!session?.access_token || whatsappBusy) return;
    whatsappBusy = true;
    setWhatsAppButtonsBusy(true);
    setStatus("Preparando la vinculación segura...", "info");
    try {
      const response = await fetch(`${getRootPath()}api/whatsapp-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: "{}"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.message || "link-failed");
      setStatus("Abrí WhatsApp y enviá el mensaje preparado. El código vence en 15 minutos.", "success");
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error?.message === "WhatsApp todavía no está configurado."
        ? "WhatsApp todavía necesita conectar el número oficial de Estudiemos."
        : "No pudimos iniciar la vinculación. Probá nuevamente.", "error");
    } finally {
      whatsappBusy = false;
      setWhatsAppButtonsBusy(false);
    }
  }

  async function unlinkWhatsApp() {
    if (!WHATSAPP_BOT_ENABLED) return;
    if (!session?.access_token || whatsappBusy) return;
    if (!window.confirm("¿Querés desvincular este WhatsApp de Estudiemos?")) return;
    whatsappBusy = true;
    setWhatsAppButtonsBusy(true);
    try {
      const response = await fetch(`${getRootPath()}api/whatsapp-link`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (!response.ok) throw new Error("unlink-failed");
      whatsappStatusLoaded = true;
      renderWhatsAppStatus({ configured: true, linked: false });
      setStatus("WhatsApp quedó desvinculado de tu cuenta.", "success");
    } catch (_) {
      setStatus("No pudimos desvincularlo ahora. Probá nuevamente.", "error");
    } finally {
      whatsappBusy = false;
      setWhatsAppButtonsBusy(false);
    }
  }

  function renderWhatsAppStatus(state) {
    const section = document.querySelector("[data-account-whatsapp]");
    const label = document.querySelector("[data-account-whatsapp-label]");
    const connect = document.querySelector("[data-account-whatsapp-connect]");
    const unlink = document.querySelector("[data-account-whatsapp-unlink]");
    if (section) section.hidden = !WHATSAPP_BOT_ENABLED || state.configured === false || !session;
    if (label) {
      label.textContent = state.configured === false
        ? "Falta conectar el número oficial"
        : state.linked
          ? `Vinculado ${state.phone || "correctamente"}`
          : "Enviá tareas por texto o audio";
    }
    if (connect) {
      connect.hidden = Boolean(state.linked);
      connect.disabled = state.configured === false || whatsappBusy;
    }
    if (unlink) unlink.hidden = !state.linked;
  }

  function setWhatsAppButtonsBusy(busy) {
    document.querySelectorAll("[data-account-whatsapp] button").forEach((button) => { button.disabled = busy; });
  }

  function hasAndroidBridge() {
    return Boolean(window.EstudiemosAndroid && typeof window.EstudiemosAndroid.postMessage === "function");
  }

  async function applyNativeSession(event) {
    const detail = event?.detail || {};
    if (!detail.accessToken || !detail.refreshToken) return;
    pendingNativeSession = detail;
    if (!client || applyingNativeSession) return;
    const current = (await client.auth.getSession()).data.session;
    if (current?.access_token === detail.accessToken) return;
    applyingNativeSession = true;
    try {
      await client.auth.setSession({
        access_token: detail.accessToken,
        refresh_token: detail.refreshToken
      });
    } catch (_) {
      // The web session keeps working if Android sends an obsolete session once.
    } finally {
      applyingNativeSession = false;
    }
  }

  function registerAndroidPushToken(event) {
    const token = String(event?.detail?.token || "").trim();
    if (!token) return;
    androidPushToken = token;
    const key = "estudiemos_android_devices";
    let devices = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      devices = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}
    const now = Date.now();
    const next = devices
      .filter((device) => (typeof device === "string" ? device : device?.token) !== token)
      .slice(-7);
    next.push({ token, platform: "android", updatedAt: now });
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key } }));
  }

  async function notifyAndroidWidgets(state) {
    if (!session?.access_token) return;
    // Use the committed account snapshot, not another account's local cache.
    let devices = state?.values?.estudiemos_android_devices;
    if (typeof devices === 'string') {
      try { devices = JSON.parse(devices); } catch (_) { return; }
    }
    const ownToken = hasAndroidBridge() ? androidPushToken : '';
    if (!Array.isArray(devices) || !devices.some(device => {
      const token = typeof device === 'string' ? device : device?.token;
      return typeof token === 'string' && token.trim().length > 0 && token.length <= 4096 && token !== ownToken;
    })) return;
    try {
      await fetch(`${getRootPath()}api/widget-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, ...(ownToken ? {'Content-Type':'application/json'} : {}) },
        ...(ownToken ? {body:JSON.stringify({excludeToken:ownToken})} : {}),
        keepalive: true
      });
    } catch (_) {
      // Realtime and periodic synchronization remain available as fallbacks.
    }
  }

  function syncAccountWithAndroid() {
    if (!accountInitializationComplete || !accountConfig || !hasAndroidBridge()) return;
    try {
      if (!session) {
        window.EstudiemosAndroid.postMessage(JSON.stringify({
          type: "account-native-sync",
          signedOut: true
        }));
        return;
      }
      window.EstudiemosAndroid.postMessage(JSON.stringify({
        type: "account-native-sync",
        config: accountConfig,
        session: {
          userId: session.user?.id || "",
          accessToken: session.access_token || "",
          refreshToken: session.refresh_token || "",
          expiresAt: Math.max(0, Number(session.expires_at) || 0)
        }
      }));
    } catch (_) {}
  }

  function requestAndroidWidget(widget) {
    if (widget === 'workspace' && (!window.EstudiemosRelease?.enabled('driveWorkspace')||window.EstudiemosAndroidDriveWidget!==true)) return setStatus('Actualizá Estudiemos para agregar el widget de Google Drive.', 'success');
    if (!hasAndroidBridge() || !["agenda", "calendar", "streak", "pomodoro", "workspace"].includes(widget)) return;
    window.EstudiemosAndroid.postMessage(JSON.stringify({ type: "widget-pin", widget }));
    setStatus("Android abrirá la confirmación para agregar el widget.", "success");
  }

  function supportsDesktopWidgets() {
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || hasAndroidBridge()) return false;
    return true;
  }

  function isWindowsDevice() {
    return /Windows/i.test(navigator.userAgent || navigator.platform || "");
  }

  async function openDesktopWidget(widget) {
    if (widget === 'workspace' && !window.EstudiemosRelease?.enabled('workspace')) return setStatus('Mi espacio: próximamente.', 'success');
    const validWidgets = ["workspace", "inbox", "calendar", "pomodoro", "streak"];
    if (isWindowsDevice() && validWidgets.includes(widget)) {
      showWidgetSetup(widget);
      if(localStorage.getItem(WINDOWS_WIDGETS_READY_KEY)==='true')launchWindowsWidget(widget);
      return;
    }
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

  async function launchWindowsWidget(widget) {
    if (widget === 'workspace' && !window.EstudiemosRelease?.enabled('workspace')) return setStatus('Mi espacio: próximamente.', 'success');
    if (widgetLaunching) return;
    if (!session?.access_token) { widgetResumeSignIn=true; widgetSetup?.close(); openDialog(); setStatus('Iniciá sesión para conectar el widget a tu cuenta.', 'success'); return; }
    widgetLaunching=true;
    localStorage.setItem(WINDOWS_WIDGET_PENDING_KEY, widget);
    setDesktopWidgetBusy(widget, true);
    widgetSetup?.querySelector('[data-widget-open]')?.setAttribute('disabled','');
    widgetSetupMessage('Conectando tu cuenta…');
    const userId=session.user?.id;
    try {
      const accountLink = await createWindowsWidgetLink(widget);
      if (!session?.access_token || session.user?.id!==userId) throw new Error('La cuenta cambió. Volvé a intentar con tu sesión actual.');
      const query = new URLSearchParams({ widget, callback: '1', link: accountLink });
      const launcher = document.createElement('a');
      launcher.href = `estudiemos-widgets://add?${query.toString()}`;
      document.body.appendChild(launcher); launcher.click(); launcher.remove();
      widgetSetupMessage('Aceptá «Abrir» si el navegador lo pide. Después minimizá Estudiemos para ver el escritorio. Todavía no confirmamos que el widget apareció.');
      if(widgetSetup) { widgetSetup.querySelector('[data-widget-confirm]').hidden=false; widgetSetup.querySelector('[data-widget-help]').hidden=false; }
    } catch(error) { widgetSetupMessage(error.message); }
    finally {
      widgetLaunching=false;
      setDesktopWidgetBusy(widget, false);
      widgetSetup?.querySelector('[data-widget-open]')?.removeAttribute('disabled');
    }
  }

  async function createWindowsWidgetLink(widget) {
    if (!session?.access_token) throw new Error('Iniciá sesión para conectar el widget.');
    try {
      const response = await fetch(`${getRootPath()}api/widget-link`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ widget }),
        signal: AbortSignal.timeout(12000)
      });
      const data = await response.json().catch(() => ({}));
      if(!response.ok || !data.token) throw new Error('No pudimos conectar tu cuenta. Reintentá sin descargar ni instalar otra vez.');
      return data.token;
    } catch (_) {
      throw new Error('No pudimos conectar tu cuenta. Revisá Internet y volvé a intentar; no hace falta reinstalar.');
    }
  }

  function installDesktopWidgets(widget) {
    showWidgetSetup(widget || localStorage.getItem(WINDOWS_WIDGET_PENDING_KEY) || 'inbox', true);
  }

  function widgetSetupMessage(message) {
    if(widgetSetup) widgetSetup.querySelector('[data-widget-status]').textContent=message;
    else setStatus(message,'success');
  }
  function showWidgetSetup(widget, repair=false) {
    if(widgetLaunching)return;
    const labels={inbox:'Inbox',calendar:'Calendario',pomodoro:'Pomodoro',streak:'Racha'};
    if(!Object.hasOwn(labels,widget))return;
    localStorage.setItem(WINDOWS_WIDGET_PENDING_KEY,widget);
    if(!widgetSetup){
      const css=document.createElement('link');css.rel='stylesheet';css.href=`${getRootPath()}styles/windows-setup.css?v=20260929`;document.head.appendChild(css);
      widgetSetup=document.createElement('dialog');widgetSetup.className='windows-setup';widgetSetup.setAttribute('aria-labelledby','widgetSetupTitle');
      widgetSetup.innerHTML=`<header><div><small>ESCRITORIO DE WINDOWS</small><h2 id="widgetSetupTitle"></h2></div><button type="button" data-widget-close aria-label="Cerrar">×</button></header>
        <section data-widget-install><p>Una sola instalación prepara los widgets. Después agregás únicamente los que elijas.</p><a class="windows-setup__primary" href="https://estudiemos-app.vercel.app/downloads/Estudiemos-Widgets-para-Windows.exe" download data-widget-download>Descargar complemento</a><p data-widget-download-note hidden>Abrí <strong>Estudiemos-Widgets-para-Windows.exe</strong> desde Descargas y completá la instalación. Al terminar volvés a Estudiemos con tu elección guardada.</p><button type="button" data-widget-installed>Ya lo instalé · Continuar</button></section>
        <section data-widget-launch hidden><p>El widget se conecta con tu sesión de Estudiemos. No necesitás volver a iniciar sesión dentro de él.</p><button class="windows-setup__primary" type="button" data-widget-open>Agregar al escritorio</button><button type="button" data-widget-confirm hidden>Ya lo veo en mi escritorio</button></section>
        <p data-widget-status role="status" aria-live="polite"></p>
        <details data-widget-help><summary>¿No apareció o se bloqueó?</summary><p>Si no se abrió el aviso del navegador, probá «Agregar al escritorio» otra vez. Si Windows no encuentra el complemento, instalalo una vez y volvé aquí.</p><button type="button" data-widget-repair>Instalar o reparar complemento</button><a href="${WINDOWS_WIDGET_SETUP_URL}" target="_blank" rel="noopener">Ayuda con la descarga de Windows</a></details>`;
      document.body.appendChild(widgetSetup);
      widgetSetup.addEventListener('click',e=>{
        if(e.target.closest('[data-widget-close]'))widgetSetup.close();
        if(e.target.closest('[data-widget-download]'))widgetSetup.querySelector('[data-widget-download-note]').hidden=false;
        if(e.target.closest('[data-widget-installed]'))widgetSetupStage(false);
        if(e.target.closest('[data-widget-repair]'))widgetSetupStage(true);
        if(e.target.closest('[data-widget-open]'))launchWindowsWidget(widgetSetup.dataset.widget);
        if(e.target.closest('[data-widget-confirm]')){
          localStorage.setItem(WINDOWS_WIDGETS_READY_KEY,'true');localStorage.removeItem(WINDOWS_WIDGET_PENDING_KEY);widgetSetup.close();
          openDialog();setStatus('Listo. Podés agregar otro widget cuando quieras.','success');
        }
      });
      window.addEventListener('estudiemos:account-change',()=>{if(widgetResumeSignIn&&session?.access_token){widgetResumeSignIn=false;showWidgetSetup(localStorage.getItem(WINDOWS_WIDGET_PENDING_KEY),false);widgetSetupStage(false);}});
    }
    widgetSetup.dataset.widget=widget;
    widgetSetup.querySelector('h2').textContent=`Agregar ${labels[widget]}`;
    widgetSetup.querySelector('[data-widget-confirm]').hidden=true;
    widgetSetup.querySelector('[data-widget-help]').open=false;
    widgetSetupStage(repair||(localStorage.getItem(WINDOWS_WIDGETS_READY_KEY)!=='true'&&sessionStorage.getItem('estudiemos_widget_setup_stage')!=='connect'));
    closeDialog();if(!widgetSetup.open)widgetSetup.showModal();
  }
  function widgetSetupStage(install) {
    sessionStorage.setItem('estudiemos_widget_setup_stage',install?'install':'connect');
    widgetSetup.querySelector('[data-widget-install]').hidden=!install;
    widgetSetup.querySelector('[data-widget-launch]').hidden=install;
    widgetSetupMessage('');
    if(widgetSetup.open)widgetSetup.querySelector(install?'[data-widget-download]':'[data-widget-open]').focus();
  }

  function consumeWindowsWidgetsReadyMarker() {
    const url = new URL(location.href);
    // Installer hint only: never treat this as proof of account/alarm connection.
    if (url.searchParams.get('windows-bundle') === '1') {
      localStorage.setItem(WINDOWS_WIDGETS_READY_KEY, 'true');
      localStorage.setItem('estudiemos_windows_bundle_installed', 'true');
      if (url.searchParams.get('windows-app-links') === '1') localStorage.setItem('estudiemos_windows_app_links', 'true');
      url.searchParams.delete('windows-app-links');
      url.searchParams.delete('windows-bundle');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const ready = url.searchParams.get("windows-widgets-ready") === "1";
    const returnedWidget = url.searchParams.get("windows-widget-added") || "";
    const addedWidget = ['inbox','calendar','pomodoro','streak'].includes(returnedWidget)?returnedWidget:'';
    const requestedWidget=url.searchParams.get('setup-widget');
    if(requestedWidget){url.searchParams.delete('setup-widget');history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);window.setTimeout(()=>showWidgetSetup(requestedWidget),0);}
    if (!ready && !addedWidget) return;
    const pendingWidget = localStorage.getItem(WINDOWS_WIDGET_PENDING_KEY);
    localStorage.setItem(WINDOWS_WIDGETS_READY_KEY, "true");
    if (addedWidget) {
      localStorage.removeItem(WINDOWS_WIDGET_PENDING_KEY);
    }
    url.searchParams.delete("windows-widgets-ready");
    url.searchParams.delete("windows-widget-added");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    window.setTimeout(() => {
      openDialog();
      const widgetLabel = {
        workspace: "Mi espacio",
        inbox: "Inbox",
        calendar: "Calendario",
        pomodoro: "Pomodoro",
        streak: "Racha"
      }[addedWidget || pendingWidget];
      if (ready && pendingWidget && !addedWidget) {
        readyPromise.finally(() => {showWidgetSetup(pendingWidget);launchWindowsWidget(pendingWidget);});
        return;
      }
      setStatus(
        widgetLabel
          ? `Windows recibió ${widgetLabel}. Minimizá Estudiemos para verlo en el escritorio.`
          : "Windows está preparado. Ahora cada botón + agrega únicamente el widget elegido.",
        "success"
      );
    }, 0);
  }

  function setDesktopWidgetBusy(widget, busy) {
    if (!widget) return;
    const button = document.querySelector(`[data-account-desktop-widget="${widget}"]`);
    if (!button) return;
    if (busy && !button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    button.textContent = busy ? "Agregando..." : (button.dataset.idleLabel || button.textContent);
    button.disabled = Boolean(busy);
    button.classList.toggle("is-busy", Boolean(busy));
    button.setAttribute("aria-busy", String(Boolean(busy)));
  }

  async function updateApplication() {
    const button = document.querySelector("[data-account-update]");
    const label = document.querySelector("[data-account-update-label]");
    if (!button || button.disabled) return;

    if (window.EstudiemosAndroid) {
      button.disabled = true;
      const fallback = document.querySelector("[data-account-update-manual]");
      if (fallback) fallback.hidden = false;
      if (label) label.textContent = "Preparando actualización...";
      setStatus("Preparando la actualización dentro de Estudiemos...", "success");
      let timer;
      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener("estudiemos-android-update-started", started);
        window.removeEventListener("estudiemos-android-update-status", status);
        button.disabled = false;
        if (label) label.textContent = "Actualizar Estudiemos";
      };
      const watch = (delay=45000) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          cleanup();
          setStatus("La actualización está tardando. Podés reintentar o usar la descarga alternativa que aparece debajo.", "error");
        }, delay);
      };
      const started = () => {
        setStatus("Android recibió el pedido. Esperando la descarga o el permiso de instalación...", "info");
        watch(window.EstudiemosAndroidUpdater ? 45000 : 15000);
      };
      const status = event => {
        const {state, percent} = event.detail || {};
        const messages = {
          permission: "Permití a Estudiemos instalar actualizaciones en la pantalla de Android y volvé a la app.",
          downloading: "Descargando la actualización dentro de Estudiemos" + (Number.isInteger(percent)&&percent>=0&&percent<=100 ? ": "+percent+"%." : "..."),
          waiting: "Android está esperando conexión para continuar la descarga. También podés usar la alternativa.",
          installer: "Confirmá «Actualizar» en el instalador de Android. No hace falta desinstalar.",
          error: "No se pudo continuar dentro de la app. Reintentá o usá la descarga alternativa.",
          denied: "Android no autorizó la instalación. Podés habilitarla al reintentar o usar la descarga alternativa."
        };
        if (!messages[state]) return;
        setStatus(messages[state], ["error","denied"].includes(state) ? "error" : "info");
        if (["installer","error","denied"].includes(state)) cleanup();
        else {
          if (label) label.textContent = state === "downloading" && Number.isInteger(percent) && percent >= 0 && percent <= 100 ? "Descargando · "+percent+"%" : state === "permission" ? "Esperando permiso..." : "Descargando actualización...";
          watch(state === "permission" ? 120000 : 45000);
        }
      };
      window.addEventListener("estudiemos-android-update-started", started);
      window.addEventListener("estudiemos-android-update-status", status);
      watch();
      try {
        window.EstudiemosAndroid.postMessage(JSON.stringify({ type: "app-update" }));
      } catch (_) {
        cleanup();
        setStatus("No pudimos iniciar la actualización. Usá la descarga alternativa que aparece debajo.", "error");
      }
      return;
    }

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

  function openDialog(options = {}) {
    const shell = document.querySelector(".account-shell");
    if (!shell) return;
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    document.body.classList.add("account-open");
    const invitation = !session && window.EstudiemosCourseInvitation?.pending();
    const accountTitle = shell.querySelector('#accountTitle'), accountIntro = shell.querySelector('.account-intro');
    if (accountTitle) accountTitle.textContent = invitation ? 'Unirte a la cátedra' : 'Tu cuenta';
    if (accountIntro) accountIntro.textContent = invitation
      ? (invitation.preview?.title ? 'Vas a unirte a ' + invitation.preview.title + '. Ingresá o creá tu cuenta para continuar.' : 'Ingresá o creá tu cuenta. Tu invitación está guardada para continuar en la cátedra.')
      : 'Usá la misma cuenta en tu computadora, tablet y celular para mantener tus datos sincronizados.';
    renderSyncUsage();
    if (session && COMMERCIAL_LAUNCH_ENABLED && options.refreshReferrals !== false) refreshReferralStatus(true);
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

  function messageIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.9-1.1A8.5 8.5 0 1 0 12 3Zm0 2a6.5 6.5 0 1 1-3.2 12.1l-.3-.2-2.2.5.5-2.1-.2-.3A6.5 6.5 0 0 1 12 5Zm-3 4h6v2H9V9Zm0 4h4v2H9v-2Z"/></svg>';
  }
})();
