(function () {
  if (window.__estudiemosPomodoroInstalled) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  window.__estudiemosPomodoroInstalled = true;

  const STORAGE_KEY = "estudiemos_pomodoro";
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

  addButton();
  addMenu();
  bindEvents();
  reconcileTimer(false);
  render();
  startTickerIfNeeded();

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
          <button class="pomodoro-icon-btn" type="button" data-pomodoro-close aria-label="Cerrar temporizador" title="Cerrar">${icon("close")}</button>
        </header>

        <div class="pomodoro-cycle-status">
          <span data-pomodoro-cycle>Bloque 1 de 4</span>
          <strong data-pomodoro-phase>Estudio</strong>
        </div>

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
                  <option value="rain">Lluvia suave</option>
                  <option value="brown">Ruido marrón</option>
                  <option value="random">Aleatorio</option>
                </select>
              </label>
              <button class="pomodoro-ambient-btn" type="button" data-pomodoro-ambient-toggle>${icon("play")}<span>Reproducir</span></button>
            </div>
            <label class="pomodoro-volume">
              <span>Volumen ambiente</span>
              <input type="range" min="0" max="1" step="0.05" data-pomodoro-ambient-volume />
            </label>
            <label class="pomodoro-volume">
              <span>Volumen de alarma</span>
              <input type="range" min="0.15" max="1" step="0.05" data-pomodoro-alarm-volume />
            </label>
            <p class="pomodoro-now-playing" data-pomodoro-now-playing></p>
          </section>
        </section>
      </div>
    `;
    document.body.appendChild(menu);
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
    document.addEventListener("pointerdown", prepareAudio, { capture: true });
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) closeMenu();
    });
    window.addEventListener("resize", () => {
      if (isOpen()) placeMenu();
    }, { passive: true });
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      state = loadState();
      reconcileTimer(false);
      render();
      startTickerIfNeeded();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      reconcileTimer(true);
      render();
    });
    document.addEventListener("estudiemos:navigation", () => {
      if (isOpen()) placeMenu();
      render();
    });

    const menu = document.querySelector(".pomodoro-menu");
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
    const stepButton = event.target.closest("[data-pomodoro-step]");
    const toggleButton = event.target.closest("[data-pomodoro-toggle]");
    const resetButton = event.target.closest("[data-pomodoro-reset]");
    const skipButton = event.target.closest("[data-pomodoro-skip]");
    const configButton = event.target.closest("[data-pomodoro-config-toggle]");
    const soundSettingsButton = event.target.closest("[data-pomodoro-sound-settings]");
    const ambientButton = event.target.closest("[data-pomodoro-ambient-toggle]");

    if (closeButton) closeMenu();
    else if (stepButton) changeConfig(stepButton.dataset.pomodoroKey, Number(stepButton.dataset.pomodoroStep));
    else if (toggleButton) toggleTimer();
    else if (resetButton) resetTimer();
    else if (skipButton) advancePhase(false);
    else if (configButton) toggleConfigPanel(configButton);
    else if (soundSettingsButton) toggleSoundPanel(soundSettingsButton);
    else if (ambientButton) toggleAmbient();
    else if (isOpen() && !menu.contains(event.target)) closeMenu();
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
      state.ambientMode = event.target.value;
      saveState();
      if (ambientPlaying) startAmbient();
      return;
    }

    if (event.target.matches("[data-pomodoro-ambient-volume]")) {
      state.ambientVolume = unitNumber(event.target.value, state.ambientVolume);
      if (ambientGain) ambientGain.gain.setTargetAtTime(state.ambientVolume, getAudioContext().currentTime, 0.04);
      saveState();
      return;
    }

    if (event.target.matches("[data-pomodoro-alarm-volume]")) {
      state.alarmVolume = Math.max(0.15, unitNumber(event.target.value, state.alarmVolume));
      saveState();
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
    document.body.classList.remove("pomodoro-open");
    document.querySelector(".pomodoro-menu")?.setAttribute("aria-hidden", "true");
    document.querySelector("[data-pomodoro-open]")?.setAttribute("aria-expanded", "false");
  }

  function isOpen() {
    return document.body.classList.contains("pomodoro-open");
  }

  function placeMenu() {
    const button = document.querySelector("[data-pomodoro-open]");
    const menu = document.querySelector(".pomodoro-menu");
    if (!button || !menu) return;

    const rect = button.getBoundingClientRect();
    const top = Math.min(rect.bottom + 10, window.innerHeight - 90);
    const right = Math.max(10, window.innerWidth - rect.right);
    menu.style.setProperty("--pomodoro-top", `${Math.round(top)}px`);
    menu.style.setProperty("--pomodoro-right", `${Math.round(right)}px`);
  }

  function toggleSoundPanel(button) {
    const panel = document.querySelector("[data-pomodoro-sound-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  function toggleConfigPanel(button) {
    const panel = document.querySelector("[data-pomodoro-config-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  function closeConfigPanel() {
    const button = document.querySelector("[data-pomodoro-config-toggle]");
    const panel = document.querySelector("[data-pomodoro-config-panel]");
    if (!button || !panel) return;
    panel.hidden = true;
    button.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  }

  function toggleTimer() {
    if (alarmActive) {
      stopAlarm();
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
    render();
  }

  function resetTimer() {
    stopAlarm();
    stopTicker();
    state.running = false;
    state.endAt = 0;
    state.remaining = durationSeconds(state.phase);
    saveState();
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
    const ambientVolume = document.querySelector("[data-pomodoro-ambient-volume]");
    const alarmVolume = document.querySelector("[data-pomodoro-alarm-volume]");
    if (ambientMode) ambientMode.value = state.ambientMode;
    if (ambientVolume) ambientVolume.value = String(state.ambientVolume);
    if (alarmVolume) alarmVolume.value = String(state.alarmVolume);
    renderSoundControls();

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
  }

  function notifyCompletion(previousPhase) {
    startAlarm();
    if ("vibrate" in navigator && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
      navigator.vibrate([120, 80, 120]);
    }
    const title = previousPhase === "study" ? "Bloque completado" : "Descanso terminado";
    const originalTitle = document.title;
    document.title = `${title} - Estudiemos`;
    setTimeout(() => {
      if (document.title === `${title} - Estudiemos`) document.title = originalTitle;
    }, 4000);
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
    alarmInterval = window.setInterval(playAlarmPattern, 1900);
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
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(Math.max(0.15, state.alarmVolume) * 0.2, now);
    master.connect(context.destination);

    [740, 880, 740].forEach((frequency, index) => {
      const start = now + index * 0.28;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(1, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });

    setTimeout(() => master.disconnect(), 1200);
  }

  function toggleAmbient() {
    prepareAudio();
    if (ambientPlaying) stopAmbient();
    else startAmbient();
    renderSoundControls();
  }

  function startAmbient() {
    stopAmbient(false);
    const context = getAudioContext();
    if (!context) return;

    ambientGain = context.createGain();
    ambientGain.gain.value = state.ambientVolume;
    ambientGain.connect(context.destination);
    const selected = state.ambientMode === "random" ? randomAmbientMode() : state.ambientMode;
    state.currentAmbient = selected;

    if (selected === "rain") startNoiseAmbient("rain", context, ambientGain);
    else if (selected === "brown") startNoiseAmbient("brown", context, ambientGain);
    else startJazzAmbient(context, ambientGain);

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

  function startJazzAmbient(context, destination) {
    const chords = [
      [261.63, 329.63, 392.00, 493.88],
      [220.00, 261.63, 329.63, 392.00],
      [174.61, 220.00, 261.63, 329.63],
      [196.00, 246.94, 293.66, 369.99]
    ];
    let chordIndex = 0;

    const playChord = () => {
      const now = context.currentTime;
      const notes = chords[chordIndex % chords.length];
      chordIndex += 1;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index % 2 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 2;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.045, now + 0.12 + index * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.35);
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start(now);
        oscillator.stop(now + 2.4);
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
    };

    playChord();
    ambientIntervals.push(window.setInterval(playChord, 2400));
  }

  function randomAmbientMode() {
    const modes = ["jazz", "rain", "brown"];
    return modes[Math.floor(Math.random() * modes.length)];
  }

  function renderSoundControls() {
    const button = document.querySelector("[data-pomodoro-ambient-toggle]");
    const nowPlaying = document.querySelector("[data-pomodoro-now-playing]");
    if (button) {
      button.classList.toggle("is-playing", ambientPlaying);
      button.innerHTML = ambientPlaying
        ? `${icon("pause")}<span>Pausar</span>`
        : `${icon("play")}<span>Reproducir</span>`;
    }
    if (nowPlaying) {
      nowPlaying.textContent = ambientPlaying ? `Sonando: ${ambientLabel(state.currentAmbient)}` : "";
    }
  }

  function ambientLabel(mode) {
    if (mode === "rain") return "Lluvia suave";
    if (mode === "brown") return "Ruido marrón";
    return "Jazz suave";
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
      ambientMode: ["jazz", "rain", "brown", "random"].includes(saved.ambientMode) ? saved.ambientMode : "jazz",
      currentAmbient: ["jazz", "rain", "brown"].includes(saved.currentAmbient) ? saved.currentAmbient : "jazz",
      ambientVolume: unitNumber(saved.ambientVolume, 0.28),
      alarmVolume: Math.max(0.15, unitNumber(saved.alarmVolume, 0.65)),
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

  function unitNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
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
      bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.3 3 16.7 16.7-1.3 1.3-2.4-2.4H5v-2h2v-5.1c0-1.3.4-2.5 1.1-3.5L3 4.3 4.3 3Zm5.3 6.4c-.4.6-.6 1.3-.6 2.1v5.1h6.3L9.6 9.4ZM12 2a2 2 0 0 1 2 2v.4a7 7 0 0 1 5 6.7v3.2l-2-2v-1.2a5 5 0 0 0-5-5c-.5 0-1 .1-1.5.2L8.9 4.7c.4-.1.7-.2 1.1-.3V4a2 2 0 0 1 2-2Zm-2 18h4a2 2 0 0 1-4 0Z"/></svg>',
      music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3v12.2A3.5 3.5 0 1 1 17 12V6.1l-8 1.8v9.3A3.5 3.5 0 1 1 7 14V6.3L19 3ZM5.5 16A1.5 1.5 0 1 0 7 17.5V16H5.5Zm10 0a1.5 1.5 0 1 0 1.5 1.5V16h-1.5Z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.7 4.1a2.3 2.3 0 0 1 4.6 0 2.3 2.3 0 0 0 3.3 1.9 2.3 2.3 0 0 1 2.3 4 2.3 2.3 0 0 0 0 3.8 2.3 2.3 0 0 1-2.3 4 2.3 2.3 0 0 0-3.3 1.9 2.3 2.3 0 0 1-4.6 0 2.3 2.3 0 0 0-3.3-1.9 2.3 2.3 0 0 1-2.3-4 2.3 2.3 0 0 0 0-3.8 2.3 2.3 0 0 1 2.3-4 2.3 2.3 0 0 0 3.3-1.9ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
      chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.4 14.8 1.4 1.4 5.2-5.2 5.2 5.2 1.4-1.4L12 8.2l-6.6 6.6Z"/></svg>',
      chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5.4 9.2 1.4-1.4 5.2 5.2 5.2-5.2 1.4 1.4L12 15.8 5.4 9.2Z"/></svg>'
    };
    return icons[name] || "";
  }
})();
