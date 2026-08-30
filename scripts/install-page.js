(function () {
  const page = document.querySelector(".install-page");
  const installButton = document.querySelector("[data-install-pc]");
  const installStatus = document.querySelector("[data-install-pc-status]");
  const manualGuide = document.querySelector("[data-install-pc-guide]");
  const widgetInstaller = document.querySelector("[data-install-windows-widgets]");
  const requestedWidgetMessage = document.querySelector("[data-requested-widget]");
  const heroScene = document.querySelector("[data-hero-scene]");
  const heroInterface = document.querySelector("[data-hero-interface]");
  const tourImage = document.querySelector("[data-tour-image]");
  const tourTabs = Array.from(document.querySelectorAll("[data-tour-target]"));
  const sectionBridges = Array.from(document.querySelectorAll("[data-section-bridge]"));
  const widgetStage = document.querySelector("[data-widget-stage]");
  const draggableWidgets = Array.from(document.querySelectorAll("[data-draggable-widget]"));
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
  prepareImmersiveScene();
  prepareSectionBridges();
  prepareDraggableWidgets();

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

  function prepareImmersiveScene() {
    if (!heroScene || !heroInterface || reduceMotion) return;

    heroScene.addEventListener("pointermove", (event) => {
      const bounds = heroScene.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      heroInterface.style.setProperty("--hero-x", x.toFixed(3));
      heroInterface.style.setProperty("--hero-y", y.toFixed(3));
    });

    heroScene.addEventListener("pointerleave", () => {
      heroInterface.style.setProperty("--hero-x", "0");
      heroInterface.style.setProperty("--hero-y", "0");
    });
  }

  function prepareSectionBridges() {
    if (sectionBridges.length === 0) return;

    let ticking = false;
    const updateBridges = () => {
      const viewportHeight = window.innerHeight || 1;
      sectionBridges.forEach((bridge) => {
        const bounds = bridge.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (viewportHeight - bounds.top) / (viewportHeight + bounds.height * 0.2)));
        bridge.style.setProperty("--bridge-progress", progress.toFixed(3));
      });
      ticking = false;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateBridges);
    };

    updateBridges();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
  }

  function prepareDraggableWidgets() {
    if (!widgetStage || draggableWidgets.length === 0) return;

    draggableWidgets.forEach((widget) => {
      widget.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || window.innerWidth <= 680) return;

        event.preventDefault();
        const stageBounds = widgetStage.getBoundingClientRect();
        const widgetBounds = widget.getBoundingClientRect();
        const offsetX = event.clientX - widgetBounds.left;
        const offsetY = event.clientY - widgetBounds.top;

        widget.classList.add("is-dragged");
        widget.style.left = `${widgetBounds.left - stageBounds.left}px`;
        widget.style.top = `${widgetBounds.top - stageBounds.top}px`;
        widget.style.right = "auto";
        widget.style.bottom = "auto";
        widget.setPointerCapture(event.pointerId);

        const moveWidget = (moveEvent) => {
          const currentStage = widgetStage.getBoundingClientRect();
          const maxLeft = Math.max(8, currentStage.width - widget.offsetWidth - 8);
          const maxTop = Math.max(8, currentStage.height - widget.offsetHeight - 8);
          const left = Math.min(maxLeft, Math.max(8, moveEvent.clientX - currentStage.left - offsetX));
          const top = Math.min(maxTop, Math.max(8, moveEvent.clientY - currentStage.top - offsetY));
          widget.style.left = `${left}px`;
          widget.style.top = `${top}px`;
        };

        const finishDrag = () => {
          widget.releasePointerCapture?.(event.pointerId);
          widget.removeEventListener("pointermove", moveWidget);
          widget.removeEventListener("pointerup", finishDrag);
          widget.removeEventListener("pointercancel", finishDrag);
        };

        widget.addEventListener("pointermove", moveWidget);
        widget.addEventListener("pointerup", finishDrag);
        widget.addEventListener("pointercancel", finishDrag);
      });
    });
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
