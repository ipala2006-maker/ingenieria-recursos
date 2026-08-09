(function () {
  if (window.__estudiemosPomodoroInstalled) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  window.__estudiemosPomodoroInstalled = true;

  const STORAGE_KEY = "estudiemos_pomodoro";
  const DEFAULT_CONFIG = { blocks: 4, study: 25, break: 5 };
  let state = loadState();
  let timerId = 0;

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
    button.title = "Temporizador";
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
      <div class="pomodoro-menu__panel" role="dialog" aria-modal="false" aria-label="Temporizador de estudio">
        <header class="pomodoro-head">
          <div>
            <p class="tray-kicker">Temporizador</p>
            <h2>Sesión por bloques</h2>
          </div>
          <button class="pomodoro-icon-btn" type="button" data-pomodoro-close aria-label="Cerrar temporizador" title="Cerrar">${icon("close")}</button>
        </header>

        <div class="pomodoro-config" aria-label="Configurar sesión">
          ${numberControl("blocks", "Bloques", "")}
          ${numberControl("study", "Estudio", "min")}
          ${numberControl("break", "Descanso", "min")}
        </div>

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
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-reset aria-label="Reiniciar tramo" title="Reiniciar">${icon("reset")}</button>
          <button class="pomodoro-start-btn" type="button" data-pomodoro-toggle>${icon("play")}<span>Empezar</span></button>
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-skip aria-label="Saltar al siguiente tramo" title="Siguiente">${icon("skip")}</button>
        </div>

        <div class="pomodoro-summary">
          <span>Bloques completados hoy</span>
          <strong data-pomodoro-count>0</strong>
        </div>

        <div class="pomodoro-options">
          <label class="pomodoro-switch">
            <input type="checkbox" data-pomodoro-sound />
            <span>Sonido al terminar</span>
          </label>
          <label class="pomodoro-switch">
            <input type="checkbox" data-pomodoro-auto />
            <span>Continuar automáticamente</span>
          </label>
        </div>
      </div>
    `;
    document.body.appendChild(menu);
  }

  function numberControl(key, label, suffix) {
    return `
      <label class="pomodoro-number-control">
        <span>${label}</span>
        <span class="pomodoro-stepper">
          <button type="button" data-pomodoro-step="-1" data-pomodoro-key="${key}" aria-label="Reducir ${label.toLowerCase()}">${icon("minus")}</button>
          <input type="number" min="1" step="1" inputmode="numeric" data-pomodoro-value="${key}" aria-label="${label}" />
          <button type="button" data-pomodoro-step="1" data-pomodoro-key="${key}" aria-label="Aumentar ${label.toLowerCase()}">${icon("plus")}</button>
        </span>
        ${suffix ? `<small>${suffix}</small>` : ""}
      </label>
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

    if (closeButton) closeMenu();
    else if (stepButton) changeConfig(stepButton.dataset.pomodoroKey, Number(stepButton.dataset.pomodoroStep));
    else if (toggleButton) toggleTimer();
    else if (resetButton) resetTimer();
    else if (skipButton) advancePhase(false);
    else if (isOpen() && !menu.contains(event.target)) closeMenu();
  }

  function handleMenuChange(event) {
    const valueInput = event.target.closest("[data-pomodoro-value]");
    if (valueInput) {
      applyConfigValue(valueInput.dataset.pomodoroValue, valueInput.value);
      return;
    }

    if (event.target.matches("[data-pomodoro-sound]")) {
      state.sound = event.target.checked;
      saveState();
      return;
    }

    if (event.target.matches("[data-pomodoro-auto]")) {
      state.autoStart = event.target.checked;
      saveState();
    }
  }

  function handleNumberWheel(event) {
    const input = event.target.closest("[data-pomodoro-value]");
    if (!input || document.activeElement !== input) return;
    event.preventDefault();
    changeConfig(input.dataset.pomodoroValue, event.deltaY < 0 ? 1 : -1);
  }

  function changeConfig(key, difference) {
    if (!Object.prototype.hasOwnProperty.call(state.config, key)) return;
    applyConfigValue(key, state.config[key] + difference);
  }

  function applyConfigValue(key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.config, key)) return;
    const affectsCurrentPhase = (key === "study" && state.phase === "study") || (key === "break" && state.phase === "break");
    const elapsed = affectsCurrentPhase && state.running
      ? Math.max(0, durationSeconds(state.phase) - remainingSeconds())
      : 0;
    const next = positiveInteger(value, state.config[key]);
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

  function toggleTimer() {
    reconcileTimer(true);
    if (state.running) {
      state.remaining = remainingSeconds();
      state.running = false;
      state.endAt = 0;
      stopTicker();
    } else {
      if (state.remaining <= 0) state.remaining = durationSeconds(state.phase);
      state.running = true;
      state.endAt = safeEndTime(state.remaining);
      startTickerIfNeeded();
    }
    saveState();
    render();
  }

  function resetTimer() {
    stopTicker();
    state.running = false;
    state.endAt = 0;
    state.remaining = durationSeconds(state.phase);
    saveState();
    render();
  }

  function advancePhase(completed, shouldNotify = true) {
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
    if (completed && state.autoStart) {
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
    }, 250);
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

    const panel = document.querySelector(".pomodoro-menu__panel");
    if (panel) panel.dataset.phase = state.phase;

    const cycle = document.querySelector("[data-pomodoro-cycle]");
    const phase = document.querySelector("[data-pomodoro-phase]");
    const count = document.querySelector("[data-pomodoro-count]");
    if (cycle) cycle.textContent = `Bloque ${state.currentBlock} de ${state.config.blocks}`;
    if (phase) phase.textContent = state.phase === "study" ? "Estudio" : "Descanso";
    if (count) count.textContent = String(state.completedToday);

    const sound = document.querySelector("[data-pomodoro-sound]");
    const auto = document.querySelector("[data-pomodoro-auto]");
    if (sound) sound.checked = state.sound;
    if (auto) auto.checked = state.autoStart;

    const toggle = document.querySelector("[data-pomodoro-toggle]");
    if (toggle) toggle.innerHTML = state.running ? `${icon("pause")}<span>Pausar</span>` : `${icon("play")}<span>Empezar</span>`;

    renderTimerOnly();
  }

  function renderTimerOnly() {
    const remaining = state.running ? remainingSeconds() : state.remaining;
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
    const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
    const circle = document.querySelector(".pomodoro-ring__progress");
    if (circle) circle.style.strokeDashoffset = String(603.19 * (1 - progress));

    const topButton = document.querySelector("[data-pomodoro-open]");
    if (topButton) {
      topButton.classList.toggle("is-running", state.running);
      topButton.title = state.running ? `${compactTime(remaining)} - ${state.phase === "study" ? `Bloque ${state.currentBlock}` : "Descanso"}` : "Temporizador";
    }
  }

  function notifyCompletion(previousPhase) {
    if (state.sound) playTone();
    if ("vibrate" in navigator) navigator.vibrate([120, 80, 120]);
    const title = previousPhase === "study" ? "Bloque completado" : "Descanso terminado";
    const originalTitle = document.title;
    document.title = `${title} - Estudiemos`;
    setTimeout(() => {
      if (document.title === `${title} - Estudiemos`) document.title = originalTitle;
    }, 4000);
  }

  function playTone() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
      gain.connect(context.destination);
      [660, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(context.currentTime + index * 0.16);
        oscillator.stop(context.currentTime + 0.55 + index * 0.16);
      });
      setTimeout(() => context.close(), 1000);
    } catch (error) {}
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
      study: positiveInteger(saved.config?.study ?? saved.durations?.focus, DEFAULT_CONFIG.study),
      break: positiveInteger(saved.config?.break ?? saved.durations?.short, DEFAULT_CONFIG.break)
    };
    const fallbackRemaining = config[phase] * 60;

    return {
      config,
      phase,
      currentBlock: Math.min(config.blocks, positiveInteger(saved.currentBlock, 1)),
      remaining: nonNegativeNumber(saved.remaining, fallbackRemaining),
      running: Boolean(saved.running && Number(saved.endAt) > 0),
      endAt: Number(saved.endAt) || 0,
      sound: saved.sound !== false,
      autoStart: Boolean(saved.autoStart),
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

  function nonNegativeInteger(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function nonNegativeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
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
      minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5v-2Z"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>'
    };
    return icons[name] || "";
  }
})();
