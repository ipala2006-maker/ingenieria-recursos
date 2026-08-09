(function () {
  if (window.__estudiemosPomodoroInstalled) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  window.__estudiemosPomodoroInstalled = true;

  const STORAGE_KEY = "estudiemos_pomodoro";
  const MODES = {
    focus: { label: "Concentración", shortLabel: "Enfoque", durationKey: "focus" },
    short: { label: "Descanso corto", shortLabel: "Corto", durationKey: "short" },
    long: { label: "Descanso largo", shortLabel: "Largo", durationKey: "long" }
  };
  const DEFAULT_DURATIONS = { focus: 25, short: 5, long: 15 };
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
    button.setAttribute("aria-label", "Abrir temporizador Pomodoro");
    button.setAttribute("aria-expanded", "false");
    button.title = "Pomodoro";
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
            <p class="tray-kicker">Pomodoro</p>
            <h2>Tiempo de estudio</h2>
          </div>
          <div class="pomodoro-head__actions">
            <button class="pomodoro-icon-btn" type="button" data-pomodoro-settings aria-label="Ajustar tiempos" aria-expanded="false" title="Ajustar tiempos">${icon("settings")}</button>
            <button class="pomodoro-icon-btn" type="button" data-pomodoro-close aria-label="Cerrar temporizador" title="Cerrar">${icon("close")}</button>
          </div>
        </header>

        <div class="pomodoro-modes" role="tablist" aria-label="Tipo de sesión">
          ${Object.entries(MODES).map(([key, mode]) => `
            <button class="pomodoro-mode" type="button" role="tab" data-pomodoro-mode="${key}">${mode.shortLabel}</button>
          `).join("")}
        </div>

        <div class="pomodoro-timer" data-pomodoro-ring>
          <svg class="pomodoro-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="pomodoro-ring__track" cx="110" cy="110" r="96"></circle>
            <circle class="pomodoro-ring__progress" cx="110" cy="110" r="96"></circle>
          </svg>
          <div class="pomodoro-time">
            <strong data-pomodoro-time>25:00</strong>
            <span data-pomodoro-label>Concentración</span>
          </div>
        </div>

        <label class="pomodoro-task">
          <span>En qué vas a enfocarte</span>
          <input type="text" maxlength="80" data-pomodoro-task placeholder="Ej: Guía de integrales" autocomplete="off" />
        </label>

        <div class="pomodoro-controls">
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-reset aria-label="Reiniciar sesión" title="Reiniciar">${icon("reset")}</button>
          <button class="pomodoro-start-btn" type="button" data-pomodoro-toggle>${icon("play")}<span>Empezar</span></button>
          <button class="pomodoro-secondary-btn" type="button" data-pomodoro-skip aria-label="Saltar sesión" title="Saltar">${icon("skip")}</button>
        </div>

        <div class="pomodoro-summary">
          <span>Sesiones de hoy</span>
          <strong data-pomodoro-count>0</strong>
        </div>

        <div class="pomodoro-settings" data-pomodoro-settings-panel hidden>
          <div class="pomodoro-settings__grid">
            ${durationField("focus", "Enfoque", DEFAULT_DURATIONS.focus)}
            ${durationField("short", "Descanso corto", DEFAULT_DURATIONS.short)}
            ${durationField("long", "Descanso largo", DEFAULT_DURATIONS.long)}
          </div>
          <label class="pomodoro-switch">
            <input type="checkbox" data-pomodoro-sound />
            <span>Sonido al terminar</span>
          </label>
          <label class="pomodoro-switch">
            <input type="checkbox" data-pomodoro-auto />
            <span>Iniciar siguiente sesión automáticamente</span>
          </label>
        </div>
      </div>
    `;
    document.body.appendChild(menu);
  }

  function durationField(key, label, fallback) {
    return `
      <label class="pomodoro-duration">
        <span>${label}</span>
        <span class="pomodoro-duration__input"><input type="number" min="1" max="120" step="1" value="${fallback}" data-pomodoro-duration="${key}" /><small>min</small></span>
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
    menu?.addEventListener("input", (event) => {
      if (event.target.matches("[data-pomodoro-task]")) {
        state.task = event.target.value;
        saveState();
      }
    });
    menu?.addEventListener("change", handleMenuChange);
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
    const settingsButton = event.target.closest("[data-pomodoro-settings]");
    const modeButton = event.target.closest("[data-pomodoro-mode]");
    const toggleButton = event.target.closest("[data-pomodoro-toggle]");
    const resetButton = event.target.closest("[data-pomodoro-reset]");
    const skipButton = event.target.closest("[data-pomodoro-skip]");

    if (closeButton) closeMenu();
    else if (settingsButton) toggleSettings(settingsButton);
    else if (modeButton) selectMode(modeButton.dataset.pomodoroMode);
    else if (toggleButton) toggleTimer();
    else if (resetButton) resetTimer();
    else if (skipButton) advanceSession(false);
    else if (isOpen() && !menu.contains(event.target)) closeMenu();
  }

  function handleMenuChange(event) {
    const duration = event.target.closest("[data-pomodoro-duration]");
    if (duration) {
      const key = duration.dataset.pomodoroDuration;
      const value = clampNumber(duration.value, 1, 120, DEFAULT_DURATIONS[key]);
      duration.value = String(value);
      state.durations[key] = value;
      if (state.mode === key && !state.running) state.remaining = value * 60;
      saveState();
      render();
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

  function toggleSettings(button) {
    const panel = document.querySelector("[data-pomodoro-settings-panel]");
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("is-active", open);
  }

  function selectMode(mode) {
    if (!MODES[mode] || mode === state.mode) return;
    stopTicker();
    state.mode = mode;
    state.running = false;
    state.endAt = 0;
    state.remaining = getDurationSeconds(mode);
    saveState();
    render();
  }

  function toggleTimer() {
    reconcileTimer(true);
    if (state.running) {
      state.remaining = getRemainingSeconds();
      state.running = false;
      state.endAt = 0;
      stopTicker();
    } else {
      if (state.remaining <= 0) state.remaining = getDurationSeconds(state.mode);
      state.running = true;
      state.endAt = Date.now() + state.remaining * 1000;
      startTickerIfNeeded();
    }
    saveState();
    render();
  }

  function resetTimer() {
    stopTicker();
    state.running = false;
    state.endAt = 0;
    state.remaining = getDurationSeconds(state.mode);
    saveState();
    render();
  }

  function advanceSession(completed, shouldNotify = true) {
    const previousMode = state.mode;
    stopTicker();

    if (completed && previousMode === "focus") {
      normalizeDailyCount();
      state.completedToday += 1;
    }

    if (previousMode === "focus") {
      state.mode = state.completedToday > 0 && state.completedToday % 4 === 0 ? "long" : "short";
    } else {
      state.mode = "focus";
    }

    state.running = false;
    state.endAt = 0;
    state.remaining = getDurationSeconds(state.mode);

    if (completed && shouldNotify) notifyCompletion(previousMode);
    if (completed && state.autoStart) {
      state.running = true;
      state.endAt = Date.now() + state.remaining * 1000;
      startTickerIfNeeded();
    }

    saveState();
    render();
  }

  function reconcileTimer(shouldNotify) {
    normalizeDailyCount();
    if (!state.running) return;

    state.remaining = getRemainingSeconds();
    if (state.remaining > 0) return;

    advanceSession(true, shouldNotify);
  }

  function startTickerIfNeeded() {
    if (!state.running || timerId) return;
    timerId = window.setInterval(() => {
      const remaining = getRemainingSeconds();
      if (remaining <= 0) {
        state.remaining = 0;
        advanceSession(true);
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

  function getRemainingSeconds() {
    if (!state.running || !state.endAt) return Math.max(0, Math.ceil(state.remaining));
    return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  }

  function getDurationSeconds(mode) {
    return state.durations[MODES[mode]?.durationKey || "focus"] * 60;
  }

  function render() {
    normalizeDailyCount();
    document.querySelectorAll("[data-pomodoro-mode]").forEach((button) => {
      const active = button.dataset.pomodoroMode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const panel = document.querySelector(".pomodoro-menu__panel");
    if (panel) panel.dataset.mode = state.mode;

    const task = document.querySelector("[data-pomodoro-task]");
    if (task && task.value !== state.task) task.value = state.task;

    Object.keys(DEFAULT_DURATIONS).forEach((key) => {
      const input = document.querySelector(`[data-pomodoro-duration="${key}"]`);
      if (input) input.value = String(state.durations[key]);
    });

    const sound = document.querySelector("[data-pomodoro-sound]");
    const auto = document.querySelector("[data-pomodoro-auto]");
    if (sound) sound.checked = state.sound;
    if (auto) auto.checked = state.autoStart;

    const count = document.querySelector("[data-pomodoro-count]");
    if (count) count.textContent = String(state.completedToday);

    const toggle = document.querySelector("[data-pomodoro-toggle]");
    if (toggle) toggle.innerHTML = state.running ? `${icon("pause")}<span>Pausar</span>` : `${icon("play")}<span>Empezar</span>`;

    renderTimerOnly();
  }

  function renderTimerOnly() {
    const remaining = state.running ? getRemainingSeconds() : state.remaining;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const time = document.querySelector("[data-pomodoro-time]");
    const label = document.querySelector("[data-pomodoro-label]");
    if (time) time.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (label) label.textContent = MODES[state.mode].label;

    const total = getDurationSeconds(state.mode);
    const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
    const circle = document.querySelector(".pomodoro-ring__progress");
    if (circle) circle.style.strokeDashoffset = String(603.19 * (1 - progress));

    const topButton = document.querySelector("[data-pomodoro-open]");
    if (topButton) {
      topButton.classList.toggle("is-running", state.running);
      topButton.title = state.running ? `${formatCompactTime(remaining)} - ${MODES[state.mode].label}` : "Pomodoro";
    }
  }

  function notifyCompletion(previousMode) {
    if (state.sound) playTone();
    if ("vibrate" in navigator) navigator.vibrate([120, 80, 120]);
    const title = previousMode === "focus" ? "Sesión completada" : "Descanso terminado";
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

    const mode = MODES[saved.mode] ? saved.mode : "focus";
    const durations = {
      focus: clampNumber(saved.durations?.focus, 1, 120, DEFAULT_DURATIONS.focus),
      short: clampNumber(saved.durations?.short, 1, 120, DEFAULT_DURATIONS.short),
      long: clampNumber(saved.durations?.long, 1, 120, DEFAULT_DURATIONS.long)
    };
    const fallbackRemaining = durations[MODES[mode].durationKey] * 60;

    return {
      mode,
      durations,
      remaining: clampNumber(saved.remaining, 0, 7200, fallbackRemaining),
      running: Boolean(saved.running && Number(saved.endAt) > 0),
      endAt: Number(saved.endAt) || 0,
      task: String(saved.task || "").slice(0, 80),
      sound: saved.sound !== false,
      autoStart: Boolean(saved.autoStart),
      completedDate: saved.completedDate || todayKey(),
      completedToday: clampNumber(saved.completedToday, 0, 999, 0)
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

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function formatCompactTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function icon(name) {
    const icons = {
      timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v2H9V2Zm3 4a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 2a6 6 0 1 0 6 6 6 6 0 0 0-6-6Zm-1 2h2v4.4l2.8 1.7-1 1.7-3.8-2.3V10Zm6.7-4.1 1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4Z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.9 2h2.2l.5 2.1c.5.2 1 .4 1.4.8l2-.7 1.6 1.6-.7 2c.3.4.6.9.8 1.4l2.1.5v2.2l-2.1.5c-.2.5-.4 1-.8 1.4l.7 2-1.6 1.6-2-.7c-.4.3-.9.6-1.4.8l-.5 2.1h-2.2l-.5-2.1c-.5-.2-1-.4-1.4-.8l-2 .7-1.6-1.6.7-2c-.3-.4-.6-.9-.8-1.4l-2.1-.5V9.7l2.1-.5c.2-.5.4-1 .8-1.4l-.7-2L7 4.2l2 .7c.4-.3.9-.6 1.4-.8l.5-2.1ZM12 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>',
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/></svg>',
      reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 5.6A9 9 0 1 1 3 12h2a7 7 0 1 0 2-4.9L10 10H3V3l2.6 2.6Z"/></svg>',
      skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5 15 12 5 18.5v-13ZM17 5h2v14h-2V5Z"/></svg>'
    };
    return icons[name] || "";
  }
})();
