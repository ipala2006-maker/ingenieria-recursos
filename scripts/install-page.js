(function () {
  const installButton = document.querySelector("[data-install-pc]");
  const installStatus = document.querySelector("[data-install-pc-status]");
  const manualGuide = document.querySelector("[data-install-pc-guide]");
  const widgetInstaller = document.querySelector("[data-install-windows-widgets]");
  const requestedWidgetMessage = document.querySelector("[data-requested-widget]");
  if (!installButton) return;

  let installPrompt = null;
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

  if (isInstalled()) showInstalledState();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.disabled = false;
    installStatus.textContent = "Lista para instalar. Se agrega como aplicación sin descargar un archivo .exe.";
  });

  window.addEventListener("appinstalled", showInstalledState);
  installButton.addEventListener("click", installApplication);
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
