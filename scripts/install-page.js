(function () {
  const page = document.querySelector(".install-page");
  const installButton = document.querySelector("[data-install-pc]");
  const installStatus = document.querySelector("[data-install-pc-status]");
  const manualGuide = document.querySelector("[data-install-pc-guide]");
  const widgetInstaller = document.querySelector("[data-install-windows-widgets]");
  const requestedWidgetMessage = document.querySelector("[data-requested-widget]");
  const heroVideo = document.querySelector("[data-hero-video]");
  const tourImage = document.querySelector("[data-tour-image]");
  const tourTabs = Array.from(document.querySelectorAll("[data-tour-target]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let installPrompt = null;
  let tourTimer = null;
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
  manageHeroVideo();

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

  widgetInstaller?.addEventListener("click", (event) => {
    if (widgetInstaller.dataset.downloadStarted === "true") {
      event.preventDefault();
    } else {
      widgetInstaller.dataset.downloadStarted = "true";
      widgetInstaller.classList.add("is-started");
      widgetInstaller.textContent = "Descarga iniciada";
    }
    window.setTimeout(() => {
      const help = document.querySelector("[data-windows-download-help]");
      help?.setAttribute("open", "");
      help?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
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
    }, { threshold: 0.12 });

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  }

  function prepareProductTour() {
    if (!tourImage || tourTabs.length === 0) return;

    tourTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        stopTourRotation();
        activateTourTab(tab);
      });

      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        stopTourRotation();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextTab = tourTabs[(index + direction + tourTabs.length) % tourTabs.length];
        nextTab.focus();
        activateTourTab(nextTab);
      });
    });

    if (!reduceMotion) {
      tourTimer = window.setInterval(() => {
        const activeIndex = Math.max(0, tourTabs.findIndex((tab) => tab.classList.contains("is-active")));
        activateTourTab(tourTabs[(activeIndex + 1) % tourTabs.length]);
      }, 5200);
    }
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
      requestAnimationFrame(() => tourImage.classList.remove("is-changing"));
    }, reduceMotion ? 0 : 170);
  }

  function stopTourRotation() {
    if (!tourTimer) return;
    window.clearInterval(tourTimer);
    tourTimer = null;
  }

  function manageHeroVideo() {
    if (!heroVideo || reduceMotion) return;

    const cleanStart = 1.45;
    const startFromCleanFrame = () => {
      if (heroVideo.currentTime < cleanStart) heroVideo.currentTime = cleanStart;
    };

    if (heroVideo.readyState >= 1) {
      startFromCleanFrame();
    } else {
      heroVideo.addEventListener("loadedmetadata", startFromCleanFrame, { once: true });
    }

    heroVideo.addEventListener("ended", () => {
      heroVideo.currentTime = cleanStart;
      heroVideo.play().catch(() => {});
    });

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        heroVideo.play().catch(() => {});
      } else {
        heroVideo.pause();
      }
    }, { threshold: 0.08 });
    observer.observe(heroVideo);
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
