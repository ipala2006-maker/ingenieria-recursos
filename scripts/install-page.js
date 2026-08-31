(function () {
  const page = document.querySelector(".install-page");
  const installButton = document.querySelector("[data-install-pc]");
  const installStatus = document.querySelector("[data-install-pc-status]");
  const manualGuide = document.querySelector("[data-install-pc-guide]");
  const widgetInstaller = document.querySelector("[data-install-windows-widgets]");
  const requestedWidgetMessage = document.querySelector("[data-requested-widget]");
  const tourImage = document.querySelector("[data-tour-image]");
  const tourTabs = Array.from(document.querySelectorAll("[data-tour-target]"));
  const widgetCarousel = document.querySelector("[data-widget-carousel]");
  const widgetTrack = document.querySelector("[data-widget-track]");
  const widgetItems = Array.from(document.querySelectorAll(".widget-gallery__item"));
  const widgetStatus = document.querySelector("[data-widget-status]");
  const widgetPrevious = document.querySelector("[data-widget-prev]");
  const widgetPause = document.querySelector("[data-widget-pause]");
  const widgetNext = document.querySelector("[data-widget-next]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let installPrompt = null;
  let widgetIndex = 0;
  let widgetTimer = null;
  let widgetPausedByUser = false;
  let widgetPointerStart = null;

  const requestedWidget = new URLSearchParams(location.search).get("widget");
  const widgetLabel = {
    workspace: "Mi espacio",
    inbox: "Inbox",
    calendar: "Calendario",
    pomodoro: "Pomodoro",
    streak: "Racha"
  }[requestedWidget];

  if (widgetLabel && requestedWidgetMessage) {
    requestedWidgetMessage.hidden = false;
    requestedWidgetMessage.textContent = `Elegiste ${widgetLabel}. Al terminar la preparación, Estudiemos lo agregará al escritorio.`;
    document.querySelector("#pc-widgets")?.classList.add("is-requested");
  }

  prepareMotion();
  prepareProductTour();
  prepareWidgetCarousel();

  if (installButton) {
    if (isInstalled()) showInstalledState();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installPrompt = event;
      installButton.disabled = false;
      installStatus.textContent = "Lista para instalar. Se agrega como aplicación sin descargar un archivo .exe.";
    });

    window.addEventListener("appinstalled", showInstalledState);
    installButton.addEventListener("click", installApplication);
  }

  widgetInstaller?.addEventListener("click", () => {
    widgetInstaller.classList.add("is-started");
    widgetInstaller.innerHTML = "Descarga iniciada <span aria-hidden=\"true\">✓</span>";

    window.setTimeout(() => {
      const help = document.querySelector("[data-windows-download-help]");
      help?.setAttribute("open", "");
    }, 900);
  });

  function prepareMotion() {
    if (!page || reduceMotion || !("IntersectionObserver" in window)) return;

    page.classList.add("is-motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8%" });

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  }

  function prepareProductTour() {
    if (!tourImage || tourTabs.length === 0) return;

    applyTourFraming(tourTabs[0]);

    tourTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTourTab(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextTab = tourTabs[(index + direction + tourTabs.length) % tourTabs.length];
        nextTab.focus();
        activateTourTab(nextTab);
      });
    });
  }

  function activateTourTab(tab) {
    if (!tab || tab.classList.contains("is-active")) return;

    tourTabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });

    tourImage.classList.add("is-changing");
    window.setTimeout(() => {
      tourImage.src = tab.dataset.image;
      tourImage.alt = tab.dataset.alt || "";
      applyTourFraming(tab);
      requestAnimationFrame(() => tourImage.classList.remove("is-changing"));
    }, reduceMotion ? 0 : 170);

    if (window.innerWidth <= 680) {
      tab.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
    }
  }

  function applyTourFraming(tab) {
    tourImage.style.setProperty("--tour-scale", tab?.dataset.scale || "1");
    tourImage.style.setProperty("--tour-origin", tab?.dataset.origin || "50% 50%");
  }

  function prepareWidgetCarousel() {
    if (!widgetCarousel || !widgetTrack || widgetItems.length === 0) return;

    renderWidgetCarousel();
    startWidgetRotation();

    widgetPrevious?.addEventListener("click", () => moveWidgetCarousel(-1));
    widgetNext?.addEventListener("click", () => moveWidgetCarousel(1));
    widgetPause?.addEventListener("click", toggleWidgetRotation);

    widgetCarousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") moveWidgetCarousel(-1);
      if (event.key === "ArrowRight") moveWidgetCarousel(1);
    });

    widgetCarousel.addEventListener("pointerenter", stopWidgetRotation);
    widgetCarousel.addEventListener("pointerleave", startWidgetRotation);
    widgetCarousel.addEventListener("focusin", stopWidgetRotation);
    widgetCarousel.addEventListener("focusout", (event) => {
      if (!widgetCarousel.contains(event.relatedTarget)) startWidgetRotation();
    });

    const viewport = widgetCarousel.querySelector(".widget-gallery__viewport");
    viewport?.addEventListener("pointerdown", (event) => {
      widgetPointerStart = event.clientX;
    });
    viewport?.addEventListener("pointerup", (event) => {
      if (widgetPointerStart === null) return;
      const distance = event.clientX - widgetPointerStart;
      widgetPointerStart = null;
      if (Math.abs(distance) < 36) return;
      moveWidgetCarousel(distance > 0 ? -1 : 1);
    });
    viewport?.addEventListener("pointercancel", () => {
      widgetPointerStart = null;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopWidgetRotation();
      else startWidgetRotation();
    });
    window.addEventListener("resize", renderWidgetCarousel);
  }

  function moveWidgetCarousel(direction) {
    widgetIndex = (widgetIndex + direction + widgetItems.length) % widgetItems.length;
    renderWidgetCarousel();
    restartWidgetRotation();
  }

  function renderWidgetCarousel() {
    if (!widgetTrack || widgetItems.length === 0) return;

    const viewport = widgetCarousel.querySelector(".widget-gallery__viewport");
    const firstItem = widgetItems[0];
    const gap = parseFloat(getComputedStyle(widgetTrack).gap) || 0;
    const step = firstItem.getBoundingClientRect().width + gap;
    const maximumOffset = Math.max(0, widgetTrack.scrollWidth - (viewport?.clientWidth || 0));
    const offset = Math.min(widgetIndex * step, maximumOffset);

    widgetTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;
    widgetStatus.textContent = `${widgetIndex + 1} de ${widgetItems.length}`;
    widgetItems.forEach((item, index) => item.toggleAttribute("data-current", index === widgetIndex));
  }

  function startWidgetRotation() {
    if (reduceMotion || widgetPausedByUser || widgetTimer || document.hidden) return;
    widgetTimer = window.setInterval(() => {
      widgetIndex = (widgetIndex + 1) % widgetItems.length;
      renderWidgetCarousel();
    }, 4600);
  }

  function stopWidgetRotation() {
    if (!widgetTimer) return;
    window.clearInterval(widgetTimer);
    widgetTimer = null;
  }

  function restartWidgetRotation() {
    stopWidgetRotation();
    startWidgetRotation();
  }

  function toggleWidgetRotation() {
    widgetPausedByUser = !widgetPausedByUser;
    widgetPause.setAttribute("aria-pressed", String(widgetPausedByUser));
    widgetPause.setAttribute("aria-label", widgetPausedByUser ? "Reanudar movimiento" : "Pausar movimiento");
    widgetPause.textContent = widgetPausedByUser ? "▶" : "Ⅱ";
    if (widgetPausedByUser) stopWidgetRotation();
    else startWidgetRotation();
  }

  async function installApplication() {
    if (isInstalled()) {
      location.href = "https://estudiemos-app.vercel.app/";
      return;
    }

    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        showInstalledState();
      } else {
        installStatus.textContent = "La instalación se canceló. Podés intentarlo nuevamente cuando quieras.";
      }
      return;
    }

    manualGuide.hidden = false;
    manualGuide.scrollIntoView({ behavior: "smooth", block: "nearest" });
    installStatus.textContent = "Tu navegador no mostró el instalador automático. Seguí estos tres pasos.";
  }

  function showInstalledState() {
    if (!installButton || !installStatus || !manualGuide) return;
    installButton.textContent = "Abrir Estudiemos";
    installButton.disabled = false;
    installStatus.textContent = "Estudiemos ya está instalada en este dispositivo.";
    manualGuide.hidden = true;
  }

  function isInstalled() {
    return window.navigator.standalone === true
      || ["standalone", "window-controls-overlay", "fullscreen"].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
  }
})();
