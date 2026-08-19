(function () {
  if (window.__estudiemosPomodoroInstalled) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  window.__estudiemosPomodoroInstalled = true;

  const SCRIPT_URL = document.currentScript?.src || new URL("scripts/pomodoro.js", location.href).href;
  const STORAGE_KEY = "estudiemos_pomodoro";
  const MOBILE_FLOATING_KEY = "estudiemos_pomodoro_mobile_floating";
  const DEFAULT_CONFIG = { blocks: 4, study: 25, break: 5 };
  const MAX_MINUTES = 59;
  const MINUTE_VALUES = MAX_MINUTES + 1;
  let state = loadState();
  let timerId = 0;
  let audioContext = null;
  let alarmInterval = 0;
  let alarmActive = false;
  let ambientGain = null;
  let ambientNodes = [];
  let ambientIntervals = [];
  let ambientPlaying = false;
  let wheelTouch = null;
  let dragState = null;
  let draggedPosition = null;
  let pipWindow = null;
  let videoPip = null;
  let videoPipDrawTimer = 0;
  let videoPipOpening = false;
  let wakeLock = null;
  let wakeLockRequest = null;
  let serviceWorkerRegistration = null;

  addButton();
  addMenu();
  bindEvents();
  registerDeviceSupport();
  reconcileTimer(false);
  render();
  startTickerIfNeeded();
  restoreMobileFloating();
  if (state.running) requestWakeLock();

  function addButton() {
    let nav = topbar.querySelector(".topbar__nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "topbar__nav";
      nav.setAttribute("aria-label", "Acciones rápidas");
      topbar.appendChild(nav);
    }

    if (nav.querySelector("[data-pomodoro-open]")) return;

    const button = document.createElement("button");
    button.className = "topbar__link topbar-icon-btn pomodoro-top-btn";
    button.type = "button";
    button.dataset.pomodoroOpen = "true";
    button.setAttribute("aria-label", "Abrir temporizador por bloques");
    button.setAttribute("aria-expanded", "false");
    button.title = "Temporizador Pomodoro";
    button.innerHTML = icon("timer");

    const agendaButton = nav.querySelector(".agenda-top-btn");
    if (agendaButton) agendaButton.insertAdjacentElement("afterend", button);
    else nav.prepend(button);
  }

  function addMenu() {
    if (document.querySelector(".pomodoro-menu")) return;

    const menu = document.createElement("section");
    menu.className = "pomodoro-menu";
    menu.setAttribute("aria-hidden", "true");
    menu.innerHTML = `
      <div class="pomodoro-menu__panel" role="dialog" aria-modal="false" aria-label="Temporizador Pomodoro">
        <header class="pomodoro-head">
          <div>
            <p class="tray-kicker">Temporizador Pomodoro</p>
            <h2>Sesión por bloques</h2>
          </div>
          <div class="pomodoro-head__actions">
            <button class="pomodoro-icon-btn" type="button" data-pomodoro-popout aria-label="Abrir temporizador flotante" title="Abrir fuera de la página">${icon("popout")}</button>
            <button class="pomodoro-icon-btn" type="button" data-pomodoro-close aria-label="Cerrar temporizador" title="Cerrar">${icon("close")}</button>
          </div>
        </header>

        <div class="pomodoro-cycle-status">
          <span data-pomodoro-cycle>Bloque 1 de 4</span>
          <strong data-pomodoro-phase>Estudio</strong>
        </div>

        <p class="pomodoro-platform-note" data-pomodoro-platform-note hidden></p>

        <div class="pomodoro-timer">
          <svg class="pomodoro-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="pomodoro-ring__track" cx="110" cy="110" r="96"></circle>
            <circle class="pomodoro-ring__progress" cx="110" cy="110" r="96"></circle>
          </svg>
          <div class="pomodoro-time">
            <strong data-pomodoro-time role="timer">25:00</strong>
            <span data-pomodoro-label>Estudio</span>
          </div>
        </div>

        <div class="pomodoro-controls">
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-reset aria-label="Reiniciar bloque actual" title="Reiniciar bloque">${icon("reset")}</button>
          <button class="pomodoro-start-btn" type="button" data-pomodoro-toggle>${icon("play")}<span>Empezar</span></button>
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-skip aria-label="Pasar al siguiente bloque" title="Siguiente bloque">${icon("skip")}</button>
        </div>

        <button class="pomodoro-settings-toggle" type="button" data-pomodoro-config-toggle aria-expanded="false">
          ${icon("settings")}<span>Configuración del temporizador</span>${icon("chevronDown")}
        </button>
        <section class="pomodoro-settings-panel" data-pomodoro-config-panel hidden>
          <div class="pomodoro-config" aria-label="Configurar sesión">
            ${numberControl("blocks", "Bloques", "")}
            ${numberControl("study", "Estudio", "min")}
            ${numberControl("break", "Descanso", "min")}
          </div>

          <div class="pomodoro-summary">
            <span>Bloques completados hoy</span>
            <strong data-pomodoro-count>0</strong>
          </div>

          <div class="pomodoro-options pomodoro-options--single">
            <label class="pomodoro-switch">
              <input type="checkbox" data-pomodoro-auto />
              <span>Continuar automáticamente</span>
            </label>
            <div class="pomodoro-device-alerts" data-pomodoro-device-alerts-row>
              <span>${icon("bell")}<span>Avisos del dispositivo</span></span>
              <button type="button" data-pomodoro-device-alerts>Activar</button>
            </div>
          </div>

          <button class="pomodoro-sound-toggle" type="button" data-pomodoro-sound-settings aria-expanded="false">
            ${icon("music")}<span>Sonidos para estudiar</span>${icon("chevronDown")}
          </button>
          <section class="pomodoro-sound-panel" data-pomodoro-sound-panel hidden>
            <div class="pomodoro-sound-row">
              <label>
                Ambiente
                <select data-pomodoro-ambient-mode>
                  <option value="jazz">Jazz suave</option>
                  <option value="jazzCafe">Jazz de café</option>
                  <option value="jazzNight">Jazz nocturno</option>
                  <option value="rain">Lluvia suave</option>
                  <option value="brown">Ruido marrón</option>
                  <option value="spotify">Spotify · Smooth Jazz Beats</option>
                  <option value="random">Aleatorio</option>
                </select>
              </label>
              <button class="pomodoro-ambient-btn" type="button" data-pomodoro-ambient-toggle>${icon("play")}<span>Reproducir</span></button>
            </div>
            <div class="pomodoro-sound-row">
              <label>
                Alarma
                <select data-pomodoro-alarm-mode>
                  <option value="digital">Digital</option>
                  <option value="bell">Campana</option>
                  <option value="chime">Carrillón</option>
                  <option value="pulse">Pulso</option>
                </select>
              </label>
            </div>
            <label class="pomodoro-volume" data-pomodoro-ambient-volume-row>
              <span>Volumen ambiente</span>
              <input type="range" min="0" max="2" step="0.05" data-pomodoro-ambient-volume />
            </label>
            <label class="pomodoro-volume">
              <span>Volumen de alarma</span>
              <input type="range" min="0.15" max="2" step="0.05" data-pomodoro-alarm-volume />
            </label>
            <p class="pomodoro-now-playing" data-pomodoro-now-playing></p>
            <div class="pomodoro-spotify-player" data-pomodoro-spotify-player hidden>
              <iframe
                title="Smooth Jazz Beats en Spotify"
                data-src="https://open.spotify.com/embed/playlist/37i9dQZF1DX06817kK7cRP?utm_source=generator&theme=0"
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                referrerpolicy="strict-origin-when-cross-origin"
              ></iframe>
            </div>
          </section>
        </section>
      </div>
    `;
    document.body.appendChild(menu);
    const popoutButton = menu.querySelector("[data-pomodoro-popout]");
    if (popoutButton) {
      popoutButton.hidden = !("documentPictureInPicture" in window) && !supportsMobileFloating();
      if (supportsMobileFloating()) {
        popoutButton.setAttribute("aria-label", "Minimizar temporizador");
        popoutButton.title = "Usar como ventana flotante";
      }
    }
  }

  function numberControl(key, label, suffix) {
    const minimum = key === "blocks" ? 1 : 0;
    const maximum = key === "blocks" ? "" : ` max="${MAX_MINUTES}"`;
    return `
      <div class="pomodoro-number-control">
        <span>${label}</span>
        <span class="pomodoro-wheel-control" data-pomodoro-wheel="${key}">
          <button type="button" data-pomodoro-step="1" data-pomodoro-key="${key}" aria-label="Aumentar ${label.toLowerCase()}">${icon("chevronUp")}</button>
          <small data-pomodoro-preview="next" data-pomodoro-key="${key}"></small>
          <input type="number" min="${minimum}"${maximum} step="1" inputmode="numeric" data-pomodoro-value="${key}" aria-label="${label}" />
          <small data-pomodoro-preview="previous" data-pomodoro-key="${key}"></small>
          <button type="button" data-pomodoro-step="-1" data-pomodoro-key="${key}" aria-label="Reducir ${label.toLowerCase()}">${icon("chevronDown")}</button>
        </span>
        ${suffix ? `<small>${suffix}</small>` : ""}
      </div>
    `;
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) closeMenu();
    });
    window.addEventListener("resize", () => {
      if (isOpen()) placeMenu();
    }, { passive: true });
    window.visualViewport?.addEventListener("resize", () => {
      if (isMobileFloating()) placeMenu();
    }, { passive: true });
    window.visualViewport?.addEventListener("scroll", () => {
      if (isMobileFloating()) placeMenu();
    }, { passive: true });
    window.addEventListener("pointermove", handleDragMove, { passive: false });
    window.addEventListener("pointerup", stopDragging, { passive: true });
    window.addEventListener("pointercancel", stopDragging, { passive: true });
    window.addEventListener("estudiemos:theme-change", renderPipControls);
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      reconcileTimer(false);
      render();
      startTickerIfNeeded();
    });
    document.addEventListener("visibilitychange", () => {
      if (videoPip) syncVideoPipPlayback();
      if (document.visibilityState !== "visible") return;
      reconcileTimer(true);
      render();
      syncWakeLock();
    });
    document.addEventListener("estudiemos:navigation", () => {
      if (isOpen()) placeMenu();
      render();
    });

    const menu = document.querySelector(".pomodoro-menu");
    menu?.querySelector(".pomodoro-head")?.addEventListener("pointerdown", handleDragStart);
    menu?.addEventListener("change", handleMenuChange);
    menu?.addEventListener("wheel", handleNumberWheel, { passive: false });
    menu?.addEventListener("touchstart", handleWheelTouchStart, { passive: true });
    menu?.addEventListener("touchmove", handleWheelTouchMove, { passive: false });
    menu?.addEventListener("touchend", () => { wheelTouch = null; });
  }

  function handleDocumentClick(event) {
    const openButton = event.target.closest("[data-pomodoro-open]");
    const menu = document.querySelector(".pomodoro-menu");

    if (openButton) {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen()) closeMenu();
      else openMenu();
      return;
    }

    if (event.target.closest("[data-agenda-open]")) {
      closeMenu();
      return;
    }

    if (!menu) return;
    const closeButton = event.target.closest("[data-pomodoro-close]");
    const popoutButton = event.target.closest("[data-pomodoro-popout]");
    const stepButton = event.target.closest("[data-pomodoro-step]");
    const toggleButton = event.target.closest("[data-pomodoro-toggle]");
    const resetButton = event.target.closest("[data-pomodoro-reset]");
    const skipButton = event.target.closest("[data-pomodoro-skip]");
    const configButton = event.target.closest("[data-pomodoro-config-toggle]");
    const soundSettingsButton = event.target.closest("[data-pomodoro-sound-settings]");
    const ambientButton = event.target.closest("[data-pomodoro-ambient-toggle]");
    const deviceAlertsButton = event.target.closest("[data-pomodoro-device-alerts]");

    if (closeButton) closeMenu();
    else if (popoutButton) openFloatingTimer();
    else if (stepButton) changeConfig(stepButton.dataset.pomodoroKey, Number(stepButton.dataset.pomodoroStep));
    else if (toggleButton) toggleTimer();
    else if (resetButton) resetTimer();
    else if (skipButton) advancePhase(false);
    else if (configButton) toggleConfigPanel(configButton);
    else if (soundSettingsButton) toggleSoundPanel(soundSettingsButton);
    else if (ambientButton) toggleAmbient();
    else if (deviceAlertsButton) requestDeviceAlerts();
    else if (isOpen() && !isMobileFloating() && !menu.contains(event.target)) closeMenu();
  }

  function handleMenuChange(event) {
    const valueInput = event.target.closest("[data-pomodoro-value]");
    if (valueInput) {
      const key = valueInput.dataset.pomodoroValue;
      applyConfigValue(key, valueInput.value);
      valueInput.value = String(state.config[key]);
      return;
    }

    if (event.target.matches("[data-pomodoro-ambient-mode]")) {
      setAmbientMode(event.target.value);
      return;
    }

    if (event.target.matches("[data-pomodoro-alarm-mode]")) {
      state.alarmMode = event.target.value;
      saveState();
      renderPipControls();
      return;
    }

    if (event.target.matches("[data-pomodoro-ambient-volume]")) {
      setAmbientVolume(event.target.value);
      return;
    }

    if (event.target.matches("[data-pomodoro-alarm-volume]")) {
      state.alarmVolume = Math.max(0.15, volumeNumber(event.target.value, state.alarmVolume, 2));
      saveState();
      renderPipControls();
      return;
    }

    if (event.target.matches("[data-pomodoro-auto]")) {
      state.autoStart = event.target.checked;
      saveState();
    }
  }

  function handleNumberWheel(event) {
    const wheel = event.target.closest("[data-pomodoro-wheel]");
    if (!wheel) return;
    event.preventDefault();
    changeConfig(wheel.dataset.pomodoroWheel, event.deltaY < 0 ? 1 : -1);
  }

  function handleWheelTouchStart(event) {
    const wheel = event.target.closest("[data-pomodoro-wheel]");
    if (!wheel || event.target.closest("input, button")) return;
    wheelTouch = { key: wheel.dataset.pomodoroWheel, y: event.touches[0].clientY };
  }

  function handleWheelTouchMove(event) {
    if (!wheelTouch) return;
    const y = event.touches[0].clientY;
    const distance = wheelTouch.y - y;
    if (Math.abs(distance) < 24) return;
    event.preventDefault();
    changeConfig(wheelTouch.key, distance > 0 ? 1 : -1);
    wheelTouch.y = y;
  }

  function changeConfig(key, difference) {
    if (!Object.prototype.hasOwnProperty.call(state.config, key)) return;
    const next = key === "blocks"
      ? state.config[key] + difference
      : wrapMinute(state.config[key] + difference);
    applyConfigValue(key, next);
    const input = document.querySelector(`[data-pomodoro-value="${key}"]`);
    if (input) input.value = String(state.config[key]);
    animateWheel(key, difference);
  }

  function animateWheel(key, difference) {
    const wheel = document.querySelector(`[data-pomodoro-wheel="${key}"]`);
    if (!wheel) return;
    const className = difference > 0 ? "is-rolling-up" : "is-rolling-down";
    wheel.classList.remove("is-rolling-up", "is-rolling-down");
    void wheel.offsetWidth;
    wheel.classList.add(className);
    window.setTimeout(() => wheel.classList.remove(className), 140);
  }

  function applyConfigValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.config, key)) return;
    const affectsCurrentPhase = (key === "study" && state.phase === "study") || (key === "break" && state.phase === "break");
    const elapsed = affectsCurrentPhase && state.running
      ? Math.max(0, durationSeconds(state.phase) - remainingSeconds())
      : 0;
    const next = configInteger(key, value, state.config[key]);
    state.config[key] = next;

    if (key === "blocks" && state.currentBlock > next) state.currentBlock = next;
    if (affectsCurrentPhase) {
      state.remaining = state.running
        ? Math.max(1, durationSeconds(state.phase) - elapsed)
        : durationSeconds(state.phase);
      if (state.running) state.endAt = safeEndTime(state.remaining);
    }

    saveState();
    render();
  }

  function openMenu() {
    prepareAudio();
    document.body.classList.remove("agenda-open");
    document.querySelector(".agenda-board")?.setAttribute("aria-hidden", "true");
    document.body.classList.add("pomodoro-open");
    document.querySelector(".pomodoro-menu")?.setAttribute("aria-hidden", "false");
    document.querySelector("[data-pomodoro-open]")?.setAttribute("aria-expanded", "true");
    placeMenu();
    render();
  }

  function closeMenu() {
    setMobileFloating(false);
    document.body.classList.remove("pomodoro-open");
    document.querySelector(".pomodoro-menu")?.setAttribute("aria-hidden", "true");
    document.querySelector("[data-pomodoro-open]")?.setAttribute("aria-expanded", "false");
  }

  function isOpen() {
    return document.body.classList.contains("pomodoro-open");
  }

  function supportsMobileFloating() {
    return window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  }

  function isMobileFloating() {
    return document.querySelector(".pomodoro-menu")?.classList.contains("is-mobile-floating") || false;
  }

  function toggleMobileFloating() {
    setMobileFloating(!isMobileFloating());
    if (!isOpen()) openMenu();
    else placeMenu();
  }

  function setMobileFloating(enabled) {
    const active = Boolean(enabled && supportsMobileFloating());
    const menu = document.querySelector(".pomodoro-menu");
    const button = document.querySelector("[data-pomodoro-popout]");
    menu?.classList.toggle("is-mobile-floating", active);
    document.body.classList.toggle("pomodoro-mobile-floating", active);
    button?.classList.toggle("is-active", active);
    if (button && !("documentPictureInPicture" in window)) {
      button.setAttribute("aria-label", active ? "Expandir temporizador" : "Minimizar temporizador");
      button.title = active ? "Volver al temporizador completo" : "Usar como ventana flotante";
    }
    if (active) closeConfigPanel();
    try { localStorage.setItem(MOBILE_FLOATING_KEY, active ? "true" : "false"); } catch (error) {}
  }

  function restoreMobileFloating() {
    let saved = false;
    try { saved = localStorage.getItem(MOBILE_FLOATING_KEY) === "true"; } catch (error) {}
    if (!saved || !state.running || !supportsMobileFloating()) return;
    setMobileFloating(true);
    document.body.classList.add("pomodoro-open");
    document.querySelector(".pomodoro-menu")?.setAttribute("aria-hidden", "false");
    document.querySelector("[data-pomodoro-open]")?.setAttribute("aria-expanded", "true");
    placeMenu();
  }

  function placeMenu() {
    const button = document.querySelector("[data-pomodoro-open]");
    const menu = document.querySelector(".pomodoro-menu");
    if (!button || !menu) return;

    if (isMobileFloating()) {
      draggedPosition = null;
      const viewport = window.visualViewport;
      const visibleLeft = viewport?.offsetLeft || 0;
      const visibleTop = viewport?.offsetTop || 0;
      const visibleWidth = viewport?.width || window.innerWidth;
      const visibleHeight = viewport?.height || window.innerHeight;
      const left = Math.max(8, visibleLeft + visibleWidth - menu.offsetWidth - 12);
      const top = Math.max(8, visibleTop + visibleHeight - menu.offsetHeight - 12);
      menu.style.left = `${Math.round(left)}px`;
      menu.style.right = "auto";
      menu.style.top = `${Math.round(top)}px`;
      menu.style.bottom = "auto";
      return;
    }

    if (window.innerWidth <= 760) {
      draggedPosition = null;
      menu.style.removeProperty("left");
      menu.style.removeProperty("right");
      menu.style.removeProperty("top");
      menu.style.setProperty("--pomodoro-top", "10px");
      menu.style.setProperty("--pomodoro-right", "10px");
      return;
    } else if (draggedPosition) {
      applyDraggedPosition(menu, draggedPosition.left, draggedPosition.top);
      return;
    }

    const rect = button.getBoundingClientRect();
    const top = Math.min(rect.bottom + 10, window.innerHeight - 90);
    const right = Math.max(10, window.innerWidth - rect.right);
    menu.style.setProperty("--pomodoro-top", `${Math.round(top)}px`);
    menu.style.setProperty("--pomodoro-right", `${Math.round(right)}px`);
  }

  function handleDragStart(event) {
    if (event.button !== 0 || window.innerWidth <= 760) return;
    if (event.target.closest("button, input, select, textarea, a, [role='button']")) return;

    const menu = document.querySelector(".pomodoro-menu");
    if (!menu || !isOpen()) return;
    const rect = menu.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    menu.classList.add("is-dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleDragMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const menu = document.querySelector(".pomodoro-menu");
    if (!menu) return;
    event.preventDefault();
    applyDraggedPosition(menu, event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  }

  function applyDraggedPosition(menu, left, top) {
    const margin = 8;
    const maximumLeft = Math.max(margin, window.innerWidth - menu.offsetWidth - margin);
    const maximumTop = Math.max(margin, window.innerHeight - Math.min(menu.offsetHeight, window.innerHeight - margin * 2) - margin);
    const nextLeft = Math.min(maximumLeft, Math.max(margin, left));
    const nextTop = Math.min(maximumTop, Math.max(margin, top));
    draggedPosition = { left: nextLeft, top: nextTop };
    menu.style.left = `${Math.round(nextLeft)}px`;
    menu.style.right = "auto";
    menu.style.top = `${Math.round(nextTop)}px`;
  }

  function stopDragging(event) {
    if (!dragState || (event.pointerId != null && event.pointerId !== dragState.pointerId)) return;
    dragState = null;
    document.querySelector(".pomodoro-menu")?.classList.remove("is-dragging");
  }

  async function openFloatingTimer() {
    if (supportsMobileFloating()) {
      if (isMobileFloating()) {
        setMobileFloating(false);
        placeMenu();
        return;
      }

      const opened = await openVideoPictureInPicture();
      if (opened) {
        setPlatformNote("");
        closeMenu();
        return;
      }

      setPlatformNote(isIOS()
        ? "iPhone no permite mostrar una app web instalada en la isla dinámica ni en Picture-in-Picture. Se mantiene el modo compacto dentro de Estudiemos."
        : "Este navegador no habilitó Picture-in-Picture. Se mantiene el modo compacto dentro de Estudiemos.");
      setMobileFloating(true);
      placeMenu();
      return;
    }
    if (!("documentPictureInPicture" in window)) return;
    if (pipWindow && !pipWindow.closed) {
      pipWindow.focus();
      return;
    }

    try {
      prepareAudio();
      pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 450,
        disallowReturnToOpener: false
      });
      buildFloatingTimer(pipWindow);
      pipWindow.addEventListener("pagehide", () => {
        pipWindow = null;
      }, { once: true });
      closeMenu();
      render();
    } catch (error) {
      pipWindow = null;
    }
  }

  function buildFloatingTimer(targetWindow) {
    const doc = targetWindow.document;
    doc.documentElement.lang = "es";
    doc.head.innerHTML = `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">`;
    doc.title = "Temporizador Pomodoro - Estudiemos";
    const style = doc.createElement("style");
    style.textContent = floatingTimerStyles();
    doc.head.appendChild(style);
    doc.body.innerHTML = `
      <main class="floating-timer" data-pip-root>
        <header>
          <div><small>TEMPORIZADOR POMODORO</small><strong data-pip-cycle></strong></div>
          <button type="button" data-pip-close aria-label="Cerrar ventana flotante" title="Cerrar">${icon("close")}</button>
        </header>
        <section class="floating-core">
          <div class="floating-phase" data-pip-phase></div>
          <div class="floating-clock">
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <circle class="track" cx="110" cy="110" r="96"></circle>
              <circle class="progress" data-pip-progress cx="110" cy="110" r="96"></circle>
            </svg>
            <div><strong data-pip-time>25:00</strong><span data-pip-label>Bloque 1</span></div>
          </div>
          <div class="floating-controls">
            <button type="button" data-pip-reset aria-label="Reiniciar bloque" title="Reiniciar">${icon("reset")}</button>
            <button class="primary" type="button" data-pip-toggle>${icon("play")}<span>Empezar</span></button>
            <button type="button" data-pip-skip aria-label="Siguiente bloque" title="Siguiente">${icon("skip")}</button>
          </div>
        </section>
        <button class="floating-disclosure" type="button" data-pip-settings-toggle aria-expanded="false">
          ${icon("settings")}<span>Configuración del temporizador</span>${icon("chevronDown")}
        </button>
        <section class="floating-settings" data-pip-settings-panel hidden>
          <div class="floating-config">
            ${floatingNumberControl("blocks", "Bloques", "")}
            ${floatingNumberControl("study", "Estudio", "min")}
            ${floatingNumberControl("break", "Descanso", "min")}
          </div>
          <div class="floating-summary"><span>Bloques completados hoy</span><strong data-pip-count>0</strong></div>
          <label class="floating-auto"><input type="checkbox" data-pip-auto><span>Continuar automáticamente</span></label>
          <button class="floating-disclosure" type="button" data-pip-sound-toggle aria-expanded="false">
            ${icon("music")}<span>Sonidos para estudiar</span>${icon("chevronDown")}
          </button>
          <section class="floating-sounds" data-pip-sound-panel hidden>
            <label>Ambiente
              <select data-pip-ambient-mode>
                <option value="jazz">Jazz suave</option><option value="jazzCafe">Jazz de café</option>
                <option value="jazzNight">Jazz nocturno</option><option value="rain">Lluvia suave</option>
                <option value="brown">Ruido marrón</option><option value="spotify">Spotify · Smooth Jazz Beats</option>
                <option value="random">Aleatorio</option>
              </select>
            </label>
            <button class="floating-play" type="button" data-pip-ambient-toggle>${icon("play")}<span>Reproducir</span></button>
            <label>Alarma
              <select data-pip-alarm-mode>
                <option value="digital">Digital</option><option value="bell">Campana</option>
                <option value="chime">Carrillón</option><option value="pulse">Pulso</option>
              </select>
            </label>
            <label class="floating-volume" data-pip-ambient-volume-row>Volumen ambiente<input type="range" min="0" max="2" step="0.05" data-pip-ambient-volume></label>
            <label class="floating-volume">Volumen de alarma<input type="range" min="0.15" max="2" step="0.05" data-pip-alarm-volume></label>
            <div class="floating-spotify" data-pip-spotify hidden>
              <iframe title="Smooth Jazz Beats en Spotify" data-src="https://open.spotify.com/embed/playlist/37i9dQZF1DX06817kK7cRP?utm_source=generator&theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
            </div>
          </section>
        </section>
      </main>
    `;

    doc.addEventListener("click", (event) => {
      if (event.target.closest("[data-pip-close]")) targetWindow.close();
      else if (event.target.closest("[data-pip-reset]")) resetTimer();
      else if (event.target.closest("[data-pip-toggle]")) toggleTimer();
      else if (event.target.closest("[data-pip-skip]")) advancePhase(false);
      else if (event.target.closest("[data-pip-step]")) {
        const button = event.target.closest("[data-pip-step]");
        changeConfig(button.dataset.pipKey, Number(button.dataset.pipStep));
      } else if (event.target.closest("[data-pip-settings-toggle]")) {
        toggleFloatingSection(targetWindow, "settings");
      } else if (event.target.closest("[data-pip-sound-toggle]")) {
        toggleFloatingSection(targetWindow, "sound");
      } else if (event.target.closest("[data-pip-ambient-toggle]")) {
        toggleAmbient();
      }
    });
    doc.addEventListener("change", handleFloatingChange);
    doc.addEventListener("wheel", (event) => {
      const wheel = event.target.closest("[data-pip-wheel]");
      if (!wheel) return;
      event.preventDefault();
      changeConfig(wheel.dataset.pipWheel, event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
  }

  function floatingNumberControl(key, label, suffix) {
    return `
      <div class="floating-number">
        <span>${label}</span>
        <div data-pip-wheel="${key}">
          <button type="button" data-pip-step="1" data-pip-key="${key}" aria-label="Aumentar ${label.toLowerCase()}">${icon("chevronUp")}</button>
          <small data-pip-preview="next" data-pip-key="${key}"></small>
          <input type="number" min="${key === "blocks" ? 1 : 0}" ${key === "blocks" ? "" : `max="${MAX_MINUTES}"`} data-pip-value="${key}" aria-label="${label}">
          <small data-pip-preview="previous" data-pip-key="${key}"></small>
          <button type="button" data-pip-step="-1" data-pip-key="${key}" aria-label="Reducir ${label.toLowerCase()}">${icon("chevronDown")}</button>
        </div>
        ${suffix ? `<small>${suffix}</small>` : ""}
      </div>`;
  }

  function toggleFloatingSection(targetWindow, section) {
    const doc = targetWindow.document;
    const settings = section === "settings";
    const button = doc.querySelector(settings ? "[data-pip-settings-toggle]" : "[data-pip-sound-toggle]");
    const panel = doc.querySelector(settings ? "[data-pip-settings-panel]" : "[data-pip-sound-panel]");
    if (!button || !panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    const root = doc.querySelector("[data-pip-root]");
    root?.classList.toggle(settings ? "settings-open" : "sound-open", open);
    if (!settings && open) root?.classList.add("settings-open");
    if (settings && !open) {
      const soundButton = doc.querySelector("[data-pip-sound-toggle]");
      const soundPanel = doc.querySelector("[data-pip-sound-panel]");
      if (soundButton && soundPanel) {
        soundPanel.hidden = true;
        soundButton.classList.remove("is-open");
        soundButton.setAttribute("aria-expanded", "false");
      }
      root?.classList.remove("sound-open");
    }
    try {
      const settingsOpen = !doc.querySelector("[data-pip-settings-panel]")?.hidden;
      const soundOpen = !doc.querySelector("[data-pip-sound-panel]")?.hidden;
      targetWindow.resizeTo(settingsOpen ? 390 : 360, soundOpen ? 720 : settingsOpen ? 625 : 450);
    } catch (error) {}
    renderPipControls();
  }

  function handleFloatingChange(event) {
    const valueInput = event.target.closest("[data-pip-value]");
    if (valueInput) {
      applyConfigValue(valueInput.dataset.pipValue, valueInput.value);
      return;
    }
    if (event.target.matches("[data-pip-auto]")) {
      state.autoStart = event.target.checked;
      saveState();
      render();
      return;
    }
    if (event.target.matches("[data-pip-ambient-mode]")) {
      setAmbientMode(event.target.value);
      return;
    }
    if (event.target.matches("[data-pip-alarm-mode]")) {
      state.alarmMode = event.target.value;
      saveState();
      render();
      return;
    }
    if (event.target.matches("[data-pip-ambient-volume]")) {
      setAmbientVolume(event.target.value);
      return;
    }
    if (event.target.matches("[data-pip-alarm-volume]")) {
      state.alarmVolume = Math.max(0.15, volumeNumber(event.target.value, state.alarmVolume, 2));
      saveState();
      render();
    }
  }

  function floatingTimerStyles() {
    return `
      :root{color-scheme:dark;--bg:#0b1020;--panel:#111827;--border:#273248;--text:#f3f6fb;--muted:#9ba8bd;--accent:#8ab4f8;--phase:#8ab4f8;font-family:"Space Grotesk",Inter,system-ui,sans-serif}
      :root[data-theme="light"]{color-scheme:light;--bg:#edf1f5;--panel:#f7f9fb;--border:#d2dae5;--text:#263244;--muted:#657387;--accent:#1a73e8;--phase:#1a73e8}
      *{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;height:100vh;overflow:hidden;background:var(--bg);color:var(--text)}
      button,select,input{font:inherit}.floating-timer{container-type:size;width:100%;height:100vh;overflow:hidden;padding:13px;display:flex;flex-direction:column;background:var(--panel)}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px}header div{display:grid;gap:3px}header small{color:var(--muted);font-size:10px;font-weight:800}header strong{font-size:15px}
      header button,.floating-controls>button{display:grid;place-items:center;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);cursor:pointer}header button{width:34px;height:34px}
      button svg{width:17px;height:17px;fill:currentColor}.floating-core{flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;align-items:center}.floating-phase{margin-top:10px;padding:7px 10px;border:1px solid var(--border);border-radius:10px;color:var(--phase);font-size:11px;font-weight:800;text-align:center}
      .floating-clock{position:relative;width:190px;width:min(190px,54cqw,46cqh);height:auto;aspect-ratio:1;margin:10px auto;align-self:center;transition:width .16s ease,margin .16s ease}.floating-clock svg{display:block;width:100%;height:100%;transform:rotate(-90deg)}.floating-clock circle{fill:none;stroke-width:9}.track{stroke:var(--border)}.progress{stroke:var(--phase);stroke-linecap:round;stroke-dasharray:603.19;stroke-dashoffset:603.19;transition:stroke-dashoffset .12s linear}
      .floating-clock>div{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.floating-clock strong{font-size:clamp(28px,11cqw,42px);line-height:1}.floating-clock span{margin-top:7px;color:var(--muted);font-size:12px;font-weight:700}
      .floating-controls{width:min(100%,320px);margin:0 auto;display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:center;gap:10px}.floating-controls>button{height:42px}.floating-controls .primary{display:flex;justify-content:center;gap:8px;border-radius:11px;border-color:transparent;background:var(--accent);color:#08101f;font-weight:800}.floating-controls .primary.is-alarm{background:#ff7185;color:#25070d}
      .floating-disclosure{width:100%;min-height:36px;display:grid;grid-template-columns:17px minmax(0,1fr) 16px;align-items:center;gap:8px;margin-top:8px;padding:6px 9px;border:1px solid var(--border);border-radius:10px;background:transparent;color:var(--muted);font-size:11px;font-weight:800;text-align:left;cursor:pointer}.floating-disclosure svg:last-child{transition:transform .16s ease}.floating-disclosure.is-open svg:last-child{transform:rotate(180deg)}
      .floating-settings{margin-top:5px;padding:7px;border:1px solid var(--border);border-radius:11px;background:color-mix(in srgb,var(--panel) 84%,var(--bg))}.floating-config{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.floating-number{min-width:0;display:grid;gap:2px;color:var(--muted);font-size:10px;font-weight:800;text-align:center}.floating-number>div{display:grid;grid-template-rows:15px 9px 25px 9px 15px;overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--bg)}.floating-number button{height:15px;display:grid;place-items:center;border:0;background:transparent;color:var(--muted);cursor:pointer}.floating-number button svg{width:11px;height:11px}.floating-number button:disabled{opacity:.2}.floating-number small{font-size:9px;line-height:9px;color:var(--muted)}.floating-number input{width:100%;height:25px;border:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);outline:0;background:color-mix(in srgb,var(--accent) 8%,transparent);color:var(--text);font-weight:900;text-align:center;appearance:textfield}.floating-number input::-webkit-inner-spin-button{appearance:none}
      .floating-summary{min-height:28px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding:5px 7px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;font-weight:750}.floating-summary strong{min-width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--text)}.floating-auto{min-height:29px;display:flex;align-items:center;gap:7px;margin-top:5px;padding:5px 7px;border:1px solid var(--border);border-radius:9px;color:var(--muted);font-size:10px;font-weight:750}.floating-auto input{accent-color:var(--accent)}
      .floating-sounds{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin-top:5px;padding:7px;border:1px solid var(--border);border-radius:9px}.floating-sounds>label{min-width:0;display:grid;grid-template-columns:52px minmax(0,1fr);align-items:center;gap:6px;color:var(--muted);font-size:9px;font-weight:750}.floating-sounds select{min-width:0;height:29px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);padding:4px 7px;font-size:10px;font-weight:700}.floating-play{min-height:29px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text);font-size:10px;font-weight:800;cursor:pointer}.floating-volume{grid-column:1/-1}.floating-volume input{width:100%;accent-color:var(--accent)}.floating-spotify{grid-column:1/-1}.floating-spotify iframe{display:block;width:100%;height:80px;border:0;border-radius:8px}
      .settings-open .floating-core{flex:0 0 auto}.settings-open .floating-clock{width:118px;margin:6px auto 5px}.settings-open .floating-clock strong{font-size:30px}.settings-open .floating-clock span{margin-top:4px;font-size:10px}.settings-open .floating-phase{margin-top:6px;padding:5px}.settings-open .floating-controls{grid-template-columns:36px minmax(0,1fr) 36px;gap:7px}.settings-open .floating-controls>button{height:36px}.settings-open header button{width:30px;height:30px}.settings-open header strong{font-size:13px}.sound-open .floating-clock{width:94px}.sound-open .floating-clock strong{font-size:25px}
      @media(max-height:560px){.floating-timer{padding:9px}.floating-clock{width:min(154px,54cqw,46cqh);margin:8px auto}.floating-disclosure{margin-top:5px}.settings-open .floating-clock{width:92px}.floating-settings{padding:5px}.floating-sounds{padding:5px}}
      @media(max-width:290px),(max-height:350px){.floating-timer{padding:9px}.floating-core{grid-template-rows:minmax(0,1fr) auto}.floating-phase,.floating-disclosure,.floating-settings{display:none!important}.floating-clock{grid-row:1;width:min(170px,68cqw,58cqh);margin:auto}.floating-clock strong{font-size:clamp(27px,15cqw,40px)}.floating-clock span{margin-top:5px;font-size:10px}.floating-controls,.settings-open .floating-controls,.sound-open .floating-controls{grid-row:2;width:min(100%,190px);grid-template-columns:minmax(120px,190px);justify-content:center;gap:0}.floating-controls>button:not(.primary){display:none}.floating-controls .primary{width:100%;height:42px}.settings-open .floating-core{flex:1}.settings-open .floating-clock,.sound-open .floating-clock{width:min(170px,68cqw,58cqh)}}
      @media(max-height:240px){header{display:none}.floating-timer{padding:6px}.floating-clock{width:min(140px,62cqh)}.floating-controls .primary{height:36px}}
    `;
  }

  function toggleSoundPanel(button) {
    const panel = document.querySelector("[data-pomodoro-sound-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    document.querySelector(".pomodoro-menu__panel")?.classList.toggle("is-sound-open", open);
    if (open) renderSoundControls();
  }

  function toggleConfigPanel(button) {
    const panel = document.querySelector("[data-pomodoro-config-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    document.querySelector(".pomodoro-menu__panel")?.classList.toggle("is-config-open", open);
  }

  function closeConfigPanel() {
    const button = document.querySelector("[data-pomodoro-config-toggle]");
    const panel = document.querySelector("[data-pomodoro-config-panel]");
    if (!button || !panel) return;
    panel.hidden = true;
    button.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    document.querySelector(".pomodoro-menu__panel")?.classList.remove("is-config-open", "is-sound-open");
    const soundButton = document.querySelector("[data-pomodoro-sound-settings]");
    const soundPanel = document.querySelector("[data-pomodoro-sound-panel]");
    if (soundButton && soundPanel) {
      soundPanel.hidden = true;
      soundButton.classList.remove("is-open");
      soundButton.setAttribute("aria-expanded", "false");
    }
  }

  function toggleTimer() {
    if (alarmActive) {
      stopAlarm();
      syncWakeLock();
      render();
      return;
    }

    prepareAudio();
    reconcileTimer(true);
    if (state.running) {
      state.remaining = remainingSeconds();
      state.running = false;
      state.endAt = 0;
      stopTicker();
    } else {
      if (state.remaining <= 0) state.remaining = durationSeconds(state.phase);
      if (state.remaining <= 0) {
        advancePhase(false);
        return;
      }
      closeConfigPanel();
      state.running = true;
      state.endAt = safeEndTime(state.remaining);
      startTickerIfNeeded();
    }
    saveState();
    syncWakeLock();
    render();
  }

  function resetTimer() {
    stopAlarm();
    stopTicker();
    state.running = false;
    state.endAt = 0;
    state.remaining = durationSeconds(state.phase);
    saveState();
    syncWakeLock();
    render();
  }

  function advancePhase(completed, shouldNotify = true) {
    if (!completed) stopAlarm();
    const previousPhase = state.phase;
    stopTicker();

    if (completed && previousPhase === "study") {
      normalizeDailyCount();
      state.completedToday += 1;
    }

    if (previousPhase === "study") {
      state.phase = "break";
    } else {
      state.phase = "study";
      state.currentBlock = state.currentBlock >= state.config.blocks ? 1 : state.currentBlock + 1;
    }

    state.running = false;
    state.endAt = 0;
    state.remaining = durationSeconds(state.phase);

    if (completed && shouldNotify) notifyCompletion(previousPhase);
    if (completed && state.autoStart && state.remaining > 0) {
      state.running = true;
      state.endAt = safeEndTime(state.remaining);
      startTickerIfNeeded();
    }

    saveState();
    syncWakeLock();
    render();
  }

  function reconcileTimer(shouldNotify) {
    normalizeDailyCount();
    if (!state.running) return;

    state.remaining = remainingSeconds();
    if (state.remaining > 0) return;
    advancePhase(true, shouldNotify);
  }

  function startTickerIfNeeded() {
    if (!state.running || timerId) return;
    timerId = window.setInterval(() => {
      const remaining = remainingSeconds();
      if (remaining <= 0) {
        state.remaining = 0;
        advancePhase(true);
        return;
      }
      state.remaining = remaining;
      renderTimerOnly();
    }, 100);
  }

  function stopTicker() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = 0;
  }

  function remainingSeconds() {
    if (!state.running || !state.endAt) return Math.max(0, Math.ceil(state.remaining));
    return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  }

  function preciseRemainingSeconds() {
    if (!state.running || !state.endAt) return Math.max(0, Number(state.remaining));
    return Math.max(0, (state.endAt - Date.now()) / 1000);
  }

  function durationSeconds(phase) {
    return state.config[phase === "break" ? "break" : "study"] * 60;
  }

  function safeEndTime(seconds) {
    const maximumSeconds = Math.floor((Number.MAX_SAFE_INTEGER - Date.now()) / 1000);
    return Date.now() + Math.min(seconds, maximumSeconds) * 1000;
  }

  function render() {
    normalizeDailyCount();
    document.querySelectorAll("[data-pomodoro-value]").forEach((input) => {
      const key = input.dataset.pomodoroValue;
      if (document.activeElement !== input) input.value = String(state.config[key]);
    });
    document.querySelectorAll("[data-pomodoro-preview]").forEach((preview) => {
      const key = preview.dataset.pomodoroKey;
      const value = state.config[key];
      const difference = preview.dataset.pomodoroPreview === "next" ? 1 : -1;
      const candidate = value + difference;
      preview.textContent = key === "blocks"
        ? String(Math.max(1, candidate))
        : String(wrapMinute(candidate));
    });
    document.querySelectorAll("[data-pomodoro-step]").forEach((button) => {
      const key = button.dataset.pomodoroKey;
      const candidate = state.config[key] + Number(button.dataset.pomodoroStep);
      button.disabled = key === "blocks" && candidate < 1;
    });

    const panel = document.querySelector(".pomodoro-menu__panel");
    if (panel) panel.dataset.phase = state.phase;

    const cycle = document.querySelector("[data-pomodoro-cycle]");
    const phase = document.querySelector("[data-pomodoro-phase]");
    const count = document.querySelector("[data-pomodoro-count]");
    if (cycle) cycle.textContent = `Bloque ${state.currentBlock} de ${state.config.blocks}`;
    if (phase) phase.textContent = state.phase === "study" ? "Estudio" : "Descanso";
    if (count) count.textContent = String(state.completedToday);

    const auto = document.querySelector("[data-pomodoro-auto]");
    if (auto) auto.checked = state.autoStart;

    const ambientMode = document.querySelector("[data-pomodoro-ambient-mode]");
    const alarmMode = document.querySelector("[data-pomodoro-alarm-mode]");
    const ambientVolume = document.querySelector("[data-pomodoro-ambient-volume]");
    const alarmVolume = document.querySelector("[data-pomodoro-alarm-volume]");
    if (ambientMode) ambientMode.value = state.ambientMode;
    if (alarmMode) alarmMode.value = state.alarmMode;
    if (ambientVolume) ambientVolume.value = String(state.ambientVolume);
    if (alarmVolume) alarmVolume.value = String(state.alarmVolume);
    renderSoundControls();
    renderPipControls();
    renderDeviceAlerts();

    const toggle = document.querySelector("[data-pomodoro-toggle]");
    if (toggle) {
      const toggleState = alarmActive ? "alarm" : state.running ? "pause" : "start";
      toggle.classList.toggle("is-alarm", alarmActive);
      if (toggle.dataset.pomodoroState !== toggleState) {
        toggle.dataset.pomodoroState = toggleState;
        toggle.innerHTML = alarmActive
          ? `${icon("bellOff")}<span>Silenciar</span>`
          : state.running
            ? `${icon("pause")}<span>Pausar</span>`
            : `${icon("play")}<span>Empezar</span>`;
      }
    }

    renderTimerOnly();
  }

  function renderTimerOnly() {
    const preciseRemaining = state.running ? preciseRemainingSeconds() : state.remaining;
    const remaining = Math.ceil(preciseRemaining);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const time = document.querySelector("[data-pomodoro-time]");
    const label = document.querySelector("[data-pomodoro-label]");
    const timeText = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (time) {
      time.textContent = timeText;
      time.classList.toggle("is-long", timeText.length > 6);
      time.classList.toggle("is-very-long", timeText.length > 9);
    }
    if (label) label.textContent = state.phase === "study" ? `Bloque ${state.currentBlock}` : "Descanso";

    const total = durationSeconds(state.phase);
    const progress = total > 0 ? Math.min(1, Math.max(0, 1 - preciseRemaining / total)) : 0;
    const circle = document.querySelector(".pomodoro-ring__progress");
    if (circle) circle.style.strokeDashoffset = String(603.19 * (1 - progress));

    const topButton = document.querySelector("[data-pomodoro-open]");
    if (topButton) {
      topButton.classList.toggle("is-running", state.running);
      topButton.title = state.running ? `${compactTime(remaining)} - ${state.phase === "study" ? `Bloque ${state.currentBlock}` : "Descanso"}` : "Temporizador Pomodoro";
    }
    syncVideoPipControlState();
    renderPipTimer(timeText, progress);
  }

  function renderPipControls() {
    const doc = getPipDocument();
    if (!doc) return;
    const dark = document.documentElement.classList.contains("theme-dark");
    doc.documentElement.dataset.theme = dark ? "dark" : "light";
    doc.documentElement.style.setProperty("--phase", state.phase === "study" ? (dark ? "#8ab4f8" : "#1a73e8") : "#fbbc04");

    const cycle = doc.querySelector("[data-pip-cycle]");
    const phase = doc.querySelector("[data-pip-phase]");
    const toggle = doc.querySelector("[data-pip-toggle]");
    if (cycle) cycle.textContent = `Bloque ${state.currentBlock} de ${state.config.blocks}`;
    if (phase) phase.textContent = state.phase === "study" ? "ESTUDIO" : "DESCANSO";
    if (toggle) {
      toggle.classList.toggle("is-alarm", alarmActive);
      toggle.innerHTML = alarmActive
        ? `${icon("bellOff")}<span>Silenciar</span>`
        : state.running
          ? `${icon("pause")}<span>Pausar</span>`
          : `${icon("play")}<span>Empezar</span>`;
    }

    doc.querySelectorAll("[data-pip-value]").forEach((input) => {
      const key = input.dataset.pipValue;
      if (doc.activeElement !== input) input.value = String(state.config[key]);
    });
    doc.querySelectorAll("[data-pip-preview]").forEach((preview) => {
      const key = preview.dataset.pipKey;
      const difference = preview.dataset.pipPreview === "next" ? 1 : -1;
      const candidate = state.config[key] + difference;
      preview.textContent = key === "blocks" ? String(Math.max(1, candidate)) : String(wrapMinute(candidate));
    });
    doc.querySelectorAll("[data-pip-step]").forEach((button) => {
      const candidate = state.config[button.dataset.pipKey] + Number(button.dataset.pipStep);
      button.disabled = button.dataset.pipKey === "blocks" && candidate < 1;
    });

    const count = doc.querySelector("[data-pip-count]");
    const auto = doc.querySelector("[data-pip-auto]");
    const ambientMode = doc.querySelector("[data-pip-ambient-mode]");
    const alarmMode = doc.querySelector("[data-pip-alarm-mode]");
    const ambientVolume = doc.querySelector("[data-pip-ambient-volume]");
    const alarmVolume = doc.querySelector("[data-pip-alarm-volume]");
    if (count) count.textContent = String(state.completedToday);
    if (auto) auto.checked = state.autoStart;
    if (ambientMode) ambientMode.value = state.ambientMode;
    if (alarmMode) alarmMode.value = state.alarmMode;
    if (ambientVolume) ambientVolume.value = String(state.ambientVolume);
    if (alarmVolume) alarmVolume.value = String(state.alarmVolume);

    const spotifySelected = state.ambientMode === "spotify";
    const ambientButton = doc.querySelector("[data-pip-ambient-toggle]");
    const ambientVolumeRow = doc.querySelector("[data-pip-ambient-volume-row]");
    const spotifyPlayer = doc.querySelector("[data-pip-spotify]");
    if (ambientButton) {
      ambientButton.hidden = spotifySelected;
      ambientButton.innerHTML = ambientPlaying
        ? `${icon("pause")}<span>Pausar</span>`
        : `${icon("play")}<span>Reproducir</span>`;
    }
    if (ambientVolumeRow) ambientVolumeRow.hidden = spotifySelected;
    if (spotifyPlayer) {
      spotifyPlayer.hidden = !spotifySelected;
      const soundPanel = doc.querySelector("[data-pip-sound-panel]");
      const iframe = spotifyPlayer.querySelector("iframe");
      if (spotifySelected && soundPanel && !soundPanel.hidden && iframe && !iframe.getAttribute("src")) iframe.src = iframe.dataset.src;
    }
  }

  function renderPipTimer(timeText, progress) {
    const doc = getPipDocument();
    if (!doc) return;
    const time = doc.querySelector("[data-pip-time]");
    const label = doc.querySelector("[data-pip-label]");
    const circle = doc.querySelector("[data-pip-progress]");
    if (time) {
      time.textContent = timeText;
      time.style.fontSize = timeText.length > 9 ? "27px" : timeText.length > 6 ? "34px" : "42px";
    }
    if (label) label.textContent = state.phase === "study" ? `Bloque ${state.currentBlock}` : "Descanso";
    if (circle) circle.style.strokeDashoffset = String(603.19 * (1 - progress));
  }

  function getPipDocument() {
    try {
      return pipWindow && !pipWindow.closed ? pipWindow.document : null;
    } catch (error) {
      return null;
    }
  }

  function notifyCompletion(previousPhase) {
    startAlarm();
    if ("vibrate" in navigator && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
      navigator.vibrate([120, 80, 120]);
    }
    const title = previousPhase === "study" ? "Bloque completado" : "Descanso terminado";
    const message = previousPhase === "study" ? "Es momento de descansar." : "Es momento de volver al estudio.";
    showDeviceNotification(title, message);
    const originalTitle = document.title;
    document.title = `${title} - Estudiemos`;
    setTimeout(() => {
      if (document.title === `${title} - Estudiemos`) document.title = originalTitle;
    }, 4000);
  }

  async function registerDeviceSupport() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    try {
      const serviceWorkerUrl = new URL("../service-worker.js", SCRIPT_URL);
      const scopeUrl = new URL("../", SCRIPT_URL);
      serviceWorkerRegistration = await navigator.serviceWorker.register(serviceWorkerUrl, { scope: scopeUrl.pathname });
    } catch (error) {
      serviceWorkerRegistration = null;
    }
  }

  function supportsVideoPictureInPicture() {
    return Boolean(
      document.pictureInPictureEnabled
      && window.HTMLCanvasElement?.prototype?.captureStream
      && window.HTMLVideoElement?.prototype?.requestPictureInPicture
    );
  }

  async function openVideoPictureInPicture() {
    if (!supportsVideoPictureInPicture() || videoPipOpening) return false;
    if (videoPip?.video && document.pictureInPictureElement === videoPip.video) return true;

    videoPipOpening = true;
    try {
      const session = createVideoPipSession();
      drawVideoPipFrame();
      await session.video.play();
      await waitForVideoDimensions(session.video);
      await session.video.requestPictureInPicture();
      session.controlsReady = true;
      startVideoPipRenderer();
      configureVideoPipControls(true);
      return true;
    } catch (error) {
      destroyVideoPipSession();
      return false;
    } finally {
      videoPipOpening = false;
    }
  }

  function createVideoPipSession() {
    if (videoPip) return videoPip;

    const canvas = document.createElement("canvas");
    canvas.className = "pomodoro-pip-canvas";
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const stream = canvas.captureStream(8);
    const video = document.createElement("video");
    video.className = "pomodoro-pip-video";
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.disableRemotePlayback = true;
    video.width = 1920;
    video.height = 1080;
    video.style.aspectRatio = "16 / 9";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.srcObject = stream;
    video.addEventListener("leavepictureinpicture", destroyVideoPipSession, { once: true });
    video.addEventListener("pause", handleVideoPipPause);
    document.body.append(canvas, video);
    videoPip = { canvas, context, stream, video, controlsReady: false };
    return videoPip;
  }

  function waitForVideoDimensions(video) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", finish);
        video.removeEventListener("resize", finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 300);
      video.addEventListener("loadedmetadata", finish, { once: true });
      video.addEventListener("resize", finish, { once: true });
    });
  }

  function syncVideoPipPlayback() {
    if (!videoPip?.controlsReady || document.pictureInPictureElement !== videoPip.video) return;
    const shouldPlay = state.running || alarmActive;
    if (shouldPlay && videoPip.video.paused) {
      videoPip.video.play().catch(() => {});
    } else if (!shouldPlay && !videoPip.video.paused) {
      videoPip.video.pause();
    }
  }

  function handleVideoPipPause() {
    window.setTimeout(() => {
      if (videoPip?.controlsReady && (state.running || alarmActive)) syncVideoPipPlayback();
    }, 180);
  }

  function startVideoPipRenderer() {
    stopVideoPipRenderer();
    drawVideoPipFrame();
    videoPipDrawTimer = window.setInterval(drawVideoPipFrame, 250);
  }

  function stopVideoPipRenderer() {
    if (!videoPipDrawTimer) return;
    clearInterval(videoPipDrawTimer);
    videoPipDrawTimer = 0;
  }

  function destroyVideoPipSession() {
    stopVideoPipRenderer();
    configureVideoPipControls(false);
    if (!videoPip) return;
    const session = videoPip;
    session.controlsReady = false;
    videoPip = null;
    session.video.removeEventListener("pause", handleVideoPipPause);
    session.video.pause();
    session.video.srcObject = null;
    session.stream.getTracks().forEach((track) => track.stop());
    session.canvas.remove();
    session.video.remove();
  }

  function drawVideoPipFrame() {
    if (!videoPip?.context) return;
    const { canvas, context: ctx } = videoPip;
    const width = 1280;
    const height = 720;
    const renderScale = canvas.width / width;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    const dark = document.documentElement.classList.contains("theme-dark");
    const background = dark ? "#080d18" : "#e9eef4";
    const panel = dark ? "#111827" : "#f8fafc";
    const panelRaised = dark ? "#172033" : "#ffffff";
    const text = dark ? "#f3f6fb" : "#263244";
    const muted = dark ? "#9ba8bd" : "#657387";
    const track = dark ? "#2b364b" : "#d4dce7";
    const phaseColor = state.phase === "study" ? (dark ? "#8ab4f8" : "#1a73e8") : "#fbbc04";
    const preciseRemaining = state.running ? preciseRemainingSeconds() : state.remaining;
    const remaining = Math.max(0, Math.ceil(preciseRemaining));
    const timeText = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    const total = durationSeconds(state.phase);
    const progress = total > 0 ? Math.min(1, Math.max(0, 1 - preciseRemaining / total)) : 0;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = panel;
    roundedRect(ctx, 24, 24, width - 48, height - 48, 42);
    ctx.fill();

    ctx.fillStyle = panelRaised;
    roundedRect(ctx, 58, 54, 74, 74, 20);
    ctx.fill();
    ctx.fillStyle = phaseColor;
    ctx.font = '700 48px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Σ", 95, 92);

    ctx.fillStyle = text;
    ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("Estudiemos", 154, 78);
    ctx.fillStyle = muted;
    ctx.font = '600 20px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText("Temporizador Pomodoro", 154, 111);

    ctx.fillStyle = dark ? "#1d2a42" : "#e8f0fe";
    roundedRect(ctx, width - 262, 63, 190, 52, 26);
    ctx.fill();
    ctx.fillStyle = phaseColor;
    ctx.font = '700 20px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(state.phase === "study" ? "ESTUDIO" : "DESCANSO", width - 167, 90);

    const centerX = width / 2;
    ctx.fillStyle = text;
    ctx.font = `700 ${timeText.length > 6 ? 144 : 174}px "Space Grotesk", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(timeText, centerX, 326);
    ctx.fillStyle = muted;
    ctx.font = '700 31px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(state.phase === "study" ? `Bloque ${state.currentBlock} de ${state.config.blocks}` : "Descanso", centerX, 426);

    const progressX = 92;
    const progressY = 498;
    const progressWidth = width - 184;
    const progressHeight = 18;
    ctx.fillStyle = track;
    roundedRect(ctx, progressX, progressY, progressWidth, progressHeight, 9);
    ctx.fill();
    if (progress > 0) {
      ctx.fillStyle = phaseColor;
      roundedRect(ctx, progressX, progressY, Math.max(progressHeight, progressWidth * progress), progressHeight, 9);
      ctx.fill();
    }

    ctx.fillStyle = state.running ? phaseColor : muted;
    ctx.font = '700 22px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(state.running ? "EN CURSO" : alarmActive ? "ALARMA" : "PAUSADO", progressX, 568);
    ctx.fillStyle = muted;
    ctx.font = '600 20px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = "right";
    ctx.fillText("Tocá para pausar, reiniciar o avanzar", width - progressX, 568);

  }

  function roundedRect(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function configureVideoPipControls(active) {
    if (!("mediaSession" in navigator)) return;
    const setHandler = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (error) {}
    };

    if (!active) {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Temporizador Pomodoro",
        artist: "Estudiemos",
        album: "Sesión de estudio"
      });
    } catch (error) {}

    setHandler("play", () => {
      if (!state.running && !alarmActive) toggleTimer();
      syncVideoPipPlayback();
    });
    setHandler("pause", () => {
      if (state.running || alarmActive) toggleTimer();
      syncVideoPipPlayback();
    });
    setHandler("previoustrack", resetTimer);
    setHandler("nexttrack", () => advancePhase(false));
    syncVideoPipControlState();
  }

  function syncVideoPipControlState() {
    if (!videoPip || !("mediaSession" in navigator)) return;
    const shouldPlay = state.running || alarmActive;
    try { navigator.mediaSession.playbackState = shouldPlay ? "playing" : "paused"; } catch (error) {}
    syncVideoPipPlayback();
  }

  function setPlatformNote(message) {
    const note = document.querySelector("[data-pomodoro-platform-note]");
    if (!note) return;
    note.textContent = message;
    note.hidden = !message;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  async function requestDeviceAlerts() {
    if (!("Notification" in window)) {
      renderDeviceAlerts();
      return;
    }
    try {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (!serviceWorkerRegistration && "serviceWorker" in navigator) {
        serviceWorkerRegistration = await navigator.serviceWorker.ready;
      }
    } catch (error) {}
    renderDeviceAlerts();
  }

  function renderDeviceAlerts() {
    const row = document.querySelector("[data-pomodoro-device-alerts-row]");
    const button = document.querySelector("[data-pomodoro-device-alerts]");
    if (!row || !button) return;
    const supported = "Notification" in window && "serviceWorker" in navigator;
    const permission = supported ? Notification.permission : "unsupported";
    button.disabled = permission === "granted" || permission === "denied" || !supported;
    button.textContent = permission === "granted"
      ? "Activos"
      : permission === "denied"
        ? "Bloqueados"
        : supported ? "Activar" : "Instalá la app";
    row.dataset.status = permission;
    row.title = supported
      ? "Permite mostrar el final del bloque como aviso del dispositivo."
      : "En iPhone, agregá Estudiemos a la pantalla de inicio para activar avisos.";
  }

  async function showDeviceNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options = {
      body,
      icon: new URL("../assets/icon-192.png", SCRIPT_URL).href,
      badge: new URL("../assets/icon-192.png", SCRIPT_URL).href,
      tag: "estudiemos-pomodoro",
      renotify: true,
      requireInteraction: true,
      vibrate: [180, 90, 180, 90, 260],
      data: { url: location.href }
    };
    try {
      const registration = serviceWorkerRegistration || await navigator.serviceWorker?.ready;
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
    } catch (error) {
      try { new Notification(title, options); } catch (notificationError) {}
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock || wakeLockRequest) return;
    try {
      wakeLockRequest = navigator.wakeLock.request("screen");
      wakeLock = await wakeLockRequest;
      wakeLock.addEventListener("release", () => { wakeLock = null; }, { once: true });
    } catch (error) {
      wakeLock = null;
    } finally {
      wakeLockRequest = null;
    }
  }

  async function releaseWakeLock() {
    const current = wakeLock;
    wakeLock = null;
    if (!current) return;
    try { await current.release(); } catch (error) {}
  }

  function syncWakeLock() {
    if (state.running || alarmActive) requestWakeLock();
    else releaseWakeLock();
  }

  function prepareAudio() {
    try {
      const context = getAudioContext();
      if (!context) return;
      if (context.state === "suspended") context.resume().catch(() => {});
    } catch (error) {}
  }

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
    return audioContext;
  }

  function startAlarm() {
    stopAlarm();
    prepareAudio();
    if (!getAudioContext()) return;
    alarmActive = true;
    playAlarmPattern();
    alarmInterval = window.setInterval(playAlarmPattern, alarmPattern().repeat);
    render();
  }

  function stopAlarm() {
    if (alarmInterval) clearInterval(alarmInterval);
    alarmInterval = 0;
    alarmActive = false;
  }

  function playAlarmPattern() {
    const context = getAudioContext();
    if (!context) return;
    const pattern = alarmPattern();
    const now = context.currentTime;
    const master = context.createGain();
    const limiter = createAudioLimiter(context);
    master.gain.setValueAtTime(Math.max(0.15, state.alarmVolume) * 0.8, now);
    master.connect(limiter);
    limiter.connect(context.destination);

    pattern.notes.forEach((frequency, index) => {
      const start = now + index * pattern.spacing;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = pattern.wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(1, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pattern.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + pattern.duration + 0.03);
    });

    setTimeout(() => {
      master.disconnect();
      limiter.disconnect();
    }, pattern.repeat - 100);
  }

  function alarmPattern() {
    const patterns = {
      digital: { notes: [740, 880, 740], wave: "sine", spacing: 0.28, duration: 0.23, repeat: 1900 },
      bell: { notes: [659.25, 987.77], wave: "triangle", spacing: 0.42, duration: 0.65, repeat: 2400 },
      chime: { notes: [523.25, 659.25, 783.99, 1046.5], wave: "sine", spacing: 0.22, duration: 0.42, repeat: 2300 },
      pulse: { notes: [880, 880, 1046.5, 1046.5], wave: "square", spacing: 0.2, duration: 0.13, repeat: 1750 }
    };
    return patterns[state.alarmMode] || patterns.digital;
  }

  function toggleAmbient() {
    prepareAudio();
    if (ambientPlaying) stopAmbient();
    else startAmbient();
    render();
  }

  function startAmbient() {
    stopAmbient(false);
    const selected = state.ambientMode === "random" ? randomAmbientMode() : state.ambientMode;
    state.currentAmbient = selected;
    if (selected === "spotify") {
      saveState();
      renderSoundControls();
      return;
    }

    const context = getAudioContext();
    if (!context) return;

    ambientGain = context.createGain();
    const limiter = createAudioLimiter(context);
    ambientGain.gain.value = ambientOutputGain(state.ambientVolume);
    ambientGain.connect(limiter);
    limiter.connect(context.destination);
    ambientNodes.push(limiter);

    if (selected === "rain") startNoiseAmbient("rain", context, ambientGain);
    else if (selected === "brown") startNoiseAmbient("brown", context, ambientGain);
    else startJazzAmbient(context, ambientGain, selected);

    ambientPlaying = true;
    if (state.ambientMode === "random") {
      ambientIntervals.push(window.setInterval(startAmbient, 180000));
    }
    saveState();
    renderSoundControls();
  }

  function stopAmbient(renderAfter = true) {
    ambientIntervals.forEach(clearInterval);
    ambientIntervals = [];
    ambientNodes.forEach((node) => {
      try { node.stop?.(); } catch (error) {}
      try { node.disconnect?.(); } catch (error) {}
    });
    ambientNodes = [];
    if (ambientGain) {
      try { ambientGain.disconnect(); } catch (error) {}
    }
    ambientGain = null;
    ambientPlaying = false;
    if (renderAfter) renderSoundControls();
  }

  function startNoiseAmbient(kind, context, destination) {
    const seconds = 3;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        channel[index] = brown * 3.2;
      } else {
        channel[index] = white * 0.34;
      }
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    filter.type = kind === "brown" ? "lowpass" : "bandpass";
    filter.frequency.value = kind === "brown" ? 620 : 2400;
    filter.Q.value = kind === "brown" ? 0.5 : 0.7;
    source.connect(filter);
    filter.connect(destination);
    source.start();
    ambientNodes.push(source, filter);
  }

  function startJazzAmbient(context, destination, mode) {
    const arrangements = {
      jazz: {
        chords: [
          [261.63, 329.63, 392, 493.88, 587.33],
          [220, 261.63, 329.63, 392, 493.88],
          [174.61, 220, 261.63, 329.63, 392],
          [196, 246.94, 293.66, 369.99, 440],
          [220, 277.18, 329.63, 415.3, 493.88],
          [146.83, 185, 220, 277.18, 329.63],
          [164.81, 207.65, 246.94, 311.13, 369.99],
          [196, 246.94, 293.66, 349.23, 440]
        ],
        melody: [659.25, 587.33, 493.88, 523.25, 554.37, 493.88, 440, 493.88],
        interval: 3200
      },
      jazzCafe: {
        chords: [
          [220, 277.18, 329.63, 415.3, 493.88],
          [246.94, 293.66, 369.99, 440, 554.37],
          [196, 246.94, 311.13, 369.99, 466.16],
          [220, 261.63, 329.63, 392, 493.88],
          [174.61, 220, 277.18, 329.63, 415.3],
          [185, 233.08, 277.18, 349.23, 415.3],
          [196, 246.94, 293.66, 369.99, 440],
          [164.81, 207.65, 261.63, 311.13, 392]
        ],
        melody: [554.37, 659.25, 587.33, 493.88, 523.25, 466.16, 440, 523.25],
        interval: 2850
      },
      jazzNight: {
        chords: [
          [164.81, 196, 246.94, 293.66, 369.99],
          [146.83, 185, 220, 277.18, 329.63],
          [174.61, 207.65, 261.63, 311.13, 392],
          [130.81, 164.81, 196, 246.94, 293.66],
          [138.59, 174.61, 207.65, 261.63, 311.13],
          [155.56, 196, 233.08, 293.66, 349.23],
          [146.83, 185, 220, 261.63, 329.63],
          [164.81, 207.65, 246.94, 293.66, 369.99]
        ],
        melody: [493.88, 440, 392, 369.99, 415.3, 392, 349.23, 440],
        interval: 3600
      }
    };
    const arrangement = arrangements[mode] || arrangements.jazz;
    let chordIndex = 0;

    const playChord = () => {
      const now = context.currentTime;
      const indexInSequence = chordIndex % arrangement.chords.length;
      const notes = arrangement.chords[indexInSequence];
      const melodyNote = arrangement.melody[indexInSequence];
      chordIndex += 1;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index % 2 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 2;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.12 + index * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + arrangement.interval / 1000 - 0.12);
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start(now);
        oscillator.stop(now + arrangement.interval / 1000);
      });

      const bass = context.createOscillator();
      const bassGain = context.createGain();
      bass.type = "sine";
      bass.frequency.value = notes[0] / 2;
      bassGain.gain.setValueAtTime(0.0001, now);
      bassGain.gain.exponentialRampToValueAtTime(0.07, now + 0.04);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
      bass.connect(bassGain);
      bassGain.connect(destination);
      bass.start(now);
      bass.stop(now + 1.5);

      [0.45, 1.35, 2.05].forEach((offset, melodyIndex) => {
        const lead = context.createOscillator();
        const leadGain = context.createGain();
        lead.type = "sine";
        lead.frequency.value = melodyNote * (melodyIndex === 1 ? 1.12246 : melodyIndex === 2 ? 0.8909 : 1);
        leadGain.gain.setValueAtTime(0.0001, now + offset);
        leadGain.gain.exponentialRampToValueAtTime(0.025, now + offset + 0.04);
        leadGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.48);
        lead.connect(leadGain);
        leadGain.connect(destination);
        lead.start(now + offset);
        lead.stop(now + offset + 0.5);
      });
    };

    playChord();
    ambientIntervals.push(window.setInterval(playChord, arrangement.interval));
  }

  function randomAmbientMode() {
    const modes = ["jazz", "jazzCafe", "jazzNight", "rain", "brown"];
    return modes[Math.floor(Math.random() * modes.length)];
  }

  function renderSoundControls() {
    const button = document.querySelector("[data-pomodoro-ambient-toggle]");
    const nowPlaying = document.querySelector("[data-pomodoro-now-playing]");
    const spotifyPlayer = document.querySelector("[data-pomodoro-spotify-player]");
    const soundPanel = document.querySelector("[data-pomodoro-sound-panel]");
    const ambientVolumeRow = document.querySelector("[data-pomodoro-ambient-volume-row]");
    const spotifySelected = state.ambientMode === "spotify";
    if (button) {
      button.hidden = spotifySelected;
      button.classList.toggle("is-playing", ambientPlaying);
      button.innerHTML = ambientPlaying
        ? `${icon("pause")}<span>Pausar</span>`
        : `${icon("play")}<span>Reproducir</span>`;
    }
    if (nowPlaying) {
      nowPlaying.textContent = spotifySelected
        ? "Reproducción mediante Spotify"
        : ambientPlaying ? `Sonando: ${ambientLabel(state.currentAmbient)}` : "";
    }
    if (spotifyPlayer) {
      spotifyPlayer.hidden = !spotifySelected;
      if (spotifySelected && isOpen() && soundPanel && !soundPanel.hidden) loadSpotifyPlayer();
    }
    if (ambientVolumeRow) ambientVolumeRow.hidden = spotifySelected;
  }

  function setAmbientMode(value) {
    const previousMode = state.ambientMode;
    state.ambientMode = value;
    saveState();
    if (ambientPlaying) startAmbient();
    if (previousMode === "spotify" && state.ambientMode !== "spotify") resetSpotifyPlayer();
    render();
  }

  function setAmbientVolume(value) {
    state.ambientVolume = volumeNumber(value, state.ambientVolume, 2);
    if (ambientGain) {
      const context = getAudioContext();
      if (context) ambientGain.gain.setTargetAtTime(ambientOutputGain(state.ambientVolume), context.currentTime, 0.04);
    }
    saveState();
    render();
  }

  function resetSpotifyPlayer() {
    document.querySelector("[data-pomodoro-spotify-player] iframe")?.removeAttribute("src");
    getPipDocument()?.querySelector("[data-pip-spotify] iframe")?.removeAttribute("src");
  }

  function loadSpotifyPlayer() {
    const iframe = document.querySelector("[data-pomodoro-spotify-player] iframe");
    if (!iframe || iframe.getAttribute("src")) return;
    iframe.src = iframe.dataset.src;
  }

  function ambientLabel(mode) {
    if (mode === "jazzCafe") return "Jazz de café";
    if (mode === "jazzNight") return "Jazz nocturno";
    if (mode === "rain") return "Lluvia suave";
    if (mode === "brown") return "Ruido marrón";
    return "Jazz suave";
  }

  function ambientOutputGain(value) {
    return volumeNumber(value, 0.28, 2) * 2.2;
  }

  function createAudioLimiter(context) {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.22;
    return limiter;
  }

  function loadState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {}

    const legacyMode = saved.mode ? (saved.mode === "focus" ? "study" : "break") : "study";
    const phase = saved.phase === "study" || saved.phase === "break" ? saved.phase : legacyMode;
    const config = {
      blocks: positiveInteger(saved.config?.blocks ?? saved.totalBlocks, DEFAULT_CONFIG.blocks),
      study: configInteger("study", saved.config?.study ?? saved.durations?.focus, DEFAULT_CONFIG.study),
      break: configInteger("break", saved.config?.break ?? saved.durations?.short, DEFAULT_CONFIG.break)
    };
    const fallbackRemaining = config[phase] * 60;

    return {
      config,
      phase,
      currentBlock: Math.min(config.blocks, positiveInteger(saved.currentBlock, 1)),
      remaining: nonNegativeNumber(saved.remaining, fallbackRemaining),
      running: Boolean(saved.running && Number(saved.endAt) > 0),
      endAt: Number(saved.endAt) || 0,
      autoStart: Boolean(saved.autoStart),
      ambientMode: ["jazz", "jazzCafe", "jazzNight", "rain", "brown", "spotify", "random"].includes(saved.ambientMode) ? saved.ambientMode : "jazz",
      currentAmbient: ["jazz", "jazzCafe", "jazzNight", "rain", "brown", "spotify"].includes(saved.currentAmbient) ? saved.currentAmbient : "jazz",
      alarmMode: ["digital", "bell", "chime", "pulse"].includes(saved.alarmMode) ? saved.alarmMode : "digital",
      ambientVolume: volumeNumber(saved.ambientVolume, 0.28, 2),
      alarmVolume: Math.max(0.15, volumeNumber(saved.alarmVolume, 0.65, 2)),
      completedDate: saved.completedDate || todayKey(),
      completedToday: nonNegativeInteger(saved.completedToday, 0)
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {}
  }

  function normalizeDailyCount() {
    const today = todayKey();
    if (state.completedDate === today) return;
    state.completedDate = today;
    state.completedToday = 0;
    saveState();
  }

  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function positiveInteger(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 1 ? Math.min(number, Number.MAX_SAFE_INTEGER) : fallback;
  }

  function configInteger(key, value, fallback) {
    if (key === "blocks") return positiveInteger(value, fallback);
    const number = Math.floor(Number(value));
    return Number.isFinite(number) ? Math.min(MAX_MINUTES, Math.max(0, number)) : fallback;
  }

  function wrapMinute(value) {
    return ((Math.floor(Number(value)) % MINUTE_VALUES) + MINUTE_VALUES) % MINUTE_VALUES;
  }

  function nonNegativeInteger(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function nonNegativeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function volumeNumber(value, fallback, maximum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(0, number)) : fallback;
  }

  function compactTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function icon(name) {
    const icons = {
      timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v2H9V2Zm3 4a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2a6 6 0 1 0 6 6 6 6 0 0 0-6-6Zm-1 2h2v4.4l2.8 1.7-1 1.7-3.8-2.3V10Zm6.7-4.1 1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4Z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>',
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/></svg>',
      reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 5.6A9 9 0 1 1 3 12h2a7 7 0 1 0 2-4.9L10 10H3V3l2.6 2.6Z"/></svg>',
      skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5 15 12 5 18.5v-13ZM17 5h2v14h-2V5Z"/></svg>',
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 0 1 2 2v.4a7 7 0 0 1 5 6.7V17h2v2H3v-2h2v-5.9a7 7 0 0 1 5-6.7V4a2 2 0 0 1 2-2Zm0 4a5 5 0 0 0-5 5.1V17h10v-5.9A5 5 0 0 0 12 6Zm-2 15h4a2 2 0 0 1-4 0Z"/></svg>',
      bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.3 3 16.7 16.7-1.3 1.3-2.4-2.4H5v-2h2v-5.1c0-1.3.4-2.5 1.1-3.5L3 4.3 4.3 3Zm5.3 6.4c-.4.6-.6 1.3-.6 2.1v5.1h6.3L9.6 9.4ZM12 2a2 2 0 0 1 2 2v.4a7 7 0 0 1 5 6.7v3.2l-2-2v-1.2a5 5 0 0 0-5-5c-.5 0-1 .1-1.5.2L8.9 4.7c.4-.1.7-.2 1.1-.3V4a2 2 0 0 1 2-2Zm-2 18h4a2 2 0 0 1-4 0Z"/></svg>',
      music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3v12.2A3.5 3.5 0 1 1 17 12V6.1l-8 1.8v9.3A3.5 3.5 0 1 1 7 14V6.3L19 3ZM5.5 16A1.5 1.5 0 1 0 7 17.5V16H5.5Zm10 0a1.5 1.5 0 1 0 1.5 1.5V16h-1.5Z"/></svg>',
      popout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.7 4.1a2.3 2.3 0 0 1 4.6 0 2.3 2.3 0 0 0 3.3 1.9 2.3 2.3 0 0 1 2.3 4 2.3 2.3 0 0 0 0 3.8 2.3 2.3 0 0 1-2.3 4 2.3 2.3 0 0 0-3.3 1.9 2.3 2.3 0 0 1-4.6 0 2.3 2.3 0 0 0-3.3-1.9 2.3 2.3 0 0 1-2.3-4 2.3 2.3 0 0 0 0-3.8 2.3 2.3 0 0 1 2.3-4 2.3 2.3 0 0 0 3.3-1.9ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
      chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.4 14.8 1.4 1.4 5.2-5.2 5.2 5.2 1.4-1.4L12 8.2l-6.6 6.6Z"/></svg>',
      chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.4 9.2 1.4-1.4 5.2 5.2 5.2-5.2 1.4 1.4L12 15.8 5.4 9.2Z"/></svg>'
    };
    return icons[name] || "";
  }
})();
