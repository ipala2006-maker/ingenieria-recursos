(function () {
  const page = document.querySelector(".install-page");
  const installButton = document.querySelector("[data-install-pc]");
  const installStatus = document.querySelector("[data-install-pc-status]");
  const manualGuide = document.querySelector("[data-install-pc-guide]");
  const widgetInstaller = document.querySelector("[data-install-windows-widgets]");
  const requestedWidgetMessage = document.querySelector("[data-requested-widget]");
  const tourImage = document.querySelector("[data-tour-image]");
  const tourTabs = Array.from(document.querySelectorAll("[data-tour-target]"));
  const tourControls = document.querySelector("[data-tour-controls]");
  const tourNumber = document.querySelector("[data-tour-number]");
  const tourTitle = document.querySelector("[data-tour-title]");
  const tourPanel = document.querySelector("#tourPanel");
  const journeyRail = document.querySelector("[data-journey-rail]");
  const journeyStages = Array.from(document.querySelectorAll("[data-journey-stage]"));
  const journeyLinks = Array.from(document.querySelectorAll("[data-journey-link]"));
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
  prepareJourney();
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

    if (!reduceMotion && "IntersectionObserver" in window) {
      const tourObserver = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) activateTourTab(visible.target);
      }, { threshold: [0.2, 0.45, 0.7], rootMargin: "-28% 0px -38%" });

      tourTabs.forEach((tab) => tourObserver.observe(tab));
    }
  }

  function activateTourTab(tab) {
    if (!tab) return;

    const activeIndex = tourTabs.indexOf(tab);
    const wasActive = tab.classList.contains("is-active");

    tourTabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
      item.tabIndex = isActive ? 0 : -1;
    });

    tourControls?.style.setProperty("--tour-progress", `${(activeIndex / Math.max(1, tourTabs.length - 1)) * 100}%`);
    if (tourNumber) tourNumber.textContent = String(activeIndex + 1).padStart(2, "0");
    if (tourTitle) tourTitle.textContent = tab.querySelector("strong")?.textContent || "";
    tourPanel?.setAttribute("aria-labelledby", tab.id);

    if (wasActive) return;

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

  function prepareJourney() {
    if (!journeyRail || journeyStages.length === 0) return;

    let frame = null;
    const updateJourney = () => {
      frame = null;
      const center = window.scrollY + window.innerHeight * 0.46;
      let activeIndex = 0;

      journeyStages.forEach((stage, index) => {
        if (stage.offsetTop <= center) activeIndex = index;
      });

      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(100, (window.scrollY / scrollable) * 100));
      journeyRail.style.setProperty("--journey-progress", `${progress}%`);
      journeyLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.journeyLink === journeyStages[activeIndex]?.id));
    };

    const requestJourneyUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateJourney);
    };

    updateJourney();
    window.addEventListener("scroll", requestJourneyUpdate, { passive: true });
    window.addEventListener("resize", requestJourneyUpdate);
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

    const compact = window.innerWidth <= 680;
    const step = compact ? Math.min(92, window.innerWidth * 0.23) : Math.min(150, window.innerWidth * 0.115);

    widgetStatus.textContent = `${widgetIndex + 1} de ${widgetItems.length}`;
    widgetItems.forEach((item, index) => {
      let offset = index - widgetIndex;
      const halfway = widgetItems.length / 2;
      if (offset > halfway) offset -= widgetItems.length;
      if (offset < -halfway) offset += widgetItems.length;

      const distance = Math.abs(offset);
      item.style.setProperty("--widget-x", `${offset * step}px`);
      item.style.setProperty("--widget-y", `${distance * (compact ? 22 : 32)}px`);
      item.style.setProperty("--widget-rotate", `${offset * -9}deg`);
      item.style.setProperty("--widget-scale", String(1 - distance * (compact ? 0.1 : 0.085)));
      item.style.setProperty("--widget-opacity", String(Math.max(0.32, 1 - distance * 0.27)));
      item.style.setProperty("--widget-z", String(10 - distance));
      item.toggleAttribute("data-current", index === widgetIndex);
    });
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
