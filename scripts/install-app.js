(function () {
  if (window.__estudiemosInstallGuideInstalled) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar || isStandalone() || isNativeAndroidApp()) return;

  let nav = topbar.querySelector(".topbar__nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "topbar__nav";
    nav.setAttribute("aria-label", "Herramientas");
    topbar.appendChild(nav);
  }

  window.__estudiemosInstallGuideInstalled = true;

  const SCRIPT_URL = document.currentScript?.src || location.href;
  const ANDROID_APK_URL = "https://github.com/ipala2006-maker/ingenieria-recursos/releases/download/android-latest/Estudiemos-Android.apk";
  let installPrompt = null;
  const ios = isIOS();
  const android = isAndroid();
  const button = document.createElement("button");
  button.className = "topbar__link topbar-icon-btn app-install-btn";
  button.type = "button";
  button.dataset.appInstall = "true";
  button.setAttribute("aria-label", android ? "Descargar Estudiemos para Android" : "Instalar Estudiemos");
  button.title = android ? "Descargar Estudiemos para Android" : "Instalar Estudiemos";
  button.innerHTML = icon("install");
  nav.prepend(button);

  const sheet = document.createElement("section");
  sheet.className = "app-install-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML = `
    <button class="app-install-sheet__backdrop" type="button" data-install-close aria-label="Cerrar"></button>
    <div class="app-install-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="installTitle">
      <header>
        <div class="app-install-sheet__identity">
          <img src="${rootUrl("assets/icon-180.png")}" alt="" width="48" height="48" />
          <div><small>ESTUDIEMOS</small><h2 id="installTitle">Instalar como aplicación</h2></div>
        </div>
        <button class="app-install-sheet__close" type="button" data-install-close aria-label="Cerrar">${icon("close")}</button>
      </header>
      <div data-install-content></div>
    </div>
  `;
  document.body.appendChild(sheet);

  button.addEventListener("click", handleInstall);
  sheet.addEventListener("click", handleSheetClick);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("appinstalled", finishInstallation);
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", (event) => {
    if (event.matches) finishInstallation();
  });

  async function handleInstall() {
    if (android) {
      location.href = ANDROID_APK_URL;
      return;
    }
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") finishInstallation();
      return;
    }
    openGuide();
  }

  function openGuide() {
    const content = sheet.querySelector("[data-install-content]");
    content.innerHTML = ios ? iosGuide() : browserGuide();
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-install-open");
  }

  function closeGuide() {
    sheet.hidden = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("app-install-open");
  }

  function handleSheetClick(event) {
    if (event.target.closest("[data-install-close]")) closeGuide();
  }

  function finishInstallation() {
    closeGuide();
    button.remove();
  }

  function iosGuide() {
    return `
      <p class="app-install-sheet__lead">En iPhone no se descarga desde App Store. Safari la agrega directamente a tu pantalla de inicio.</p>
      <ol class="app-install-steps">
        <li><span>1</span><p>Tocá <strong>Compartir</strong> en Safari.</p>${icon("share")}</li>
        <li><span>2</span><p>Elegí <strong>Agregar a pantalla de inicio</strong>.</p>${icon("phonePlus")}</li>
        <li><span>3</span><p>Dejá activo <strong>Abrir como app web</strong> y tocá Agregar.</p>${icon("check")}</li>
      </ol>
      <p class="app-install-sheet__note">Si no aparece esa opción: bajá hasta el final, tocá <strong>Editar acciones</strong> y agregala. Si abriste el enlace dentro de otra app, abrilo primero en Safari.</p>
      <button class="app-install-sheet__primary" type="button" data-install-close><span>Entendido</span></button>
    `;
  }

  function browserGuide() {
    return `
      <p class="app-install-sheet__lead">El navegador todavía no mostró el instalador automático.</p>
      <ol class="app-install-steps">
        <li><span>1</span><p>Abrí el menú del navegador.</p>${icon("menu")}</li>
        <li><span>2</span><p>Elegí <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</p>${icon("phonePlus")}</li>
      </ol>
      <button class="app-install-sheet__primary" type="button" data-install-close><span>Entendido</span></button>
    `;
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isNativeAndroidApp() {
    return Boolean(window.EstudiemosAndroid && typeof window.EstudiemosAndroid.postMessage === "function");
  }

  function rootUrl(path) {
    return new URL(`../${path}`, SCRIPT_URL).href;
  }

  function icon(name) {
    const icons = {
      install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v8.2l2.6-2.6L17 10l-5 5-5-5 1.4-1.4 2.6 2.6V3ZM5 17h14v3H5v-3Z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>',
      share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3.8 7.7 7.1 6.3 5.7 12 0l5.7 5.7-1.4 1.4L13 3.8V15h-2V3.8ZM5 9h4v2H7v10h10V11h-2V9h4v14H5V9Z"/></svg>',
      phonePlus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h10V4H7Zm4 3h2v3h3v2h-3v3h-2v-3H8v-2h3V7Z"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.6 4.6 12l1.4-1.4 3.2 3.2 8.8-8.8 1.4 1.4-10.2 10.2Z"/></svg>',
      menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z"/></svg>'
    };
    return icons[name] || "";
  }
})();
