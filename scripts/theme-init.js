(function () {
  var STORAGE_KEY = "estudiemos_theme";
  var DEFAULT_THEME = "dark";
  var root = document.documentElement;

  function getRootPath() {
    var currentScript = document.currentScript;
    var src = currentScript ? currentScript.getAttribute("src") || "" : "";
    return src.replace(/scripts\/theme-init\.js(?:\?.*)?$/, "");
  }

  function installEarlyThemeStyles() {
    if (document.getElementById("earlyThemeStyles")) return;

    var style = document.createElement("style");
    style.id = "earlyThemeStyles";
    style.textContent = "\n" +
      "html,html body{background:#0f172a;color:#e5e7eb;}\n" +
      "html.theme-light{\n" +
      "  --bg:#edf1f5;\n" +
      "  --panel:#f7f9fb;\n" +
      "  --panel-2:#e8edf3;\n" +
      "  --border:#d2dae5;\n" +
      "  --text:#263244;\n" +
      "  --muted:#657387;\n" +
      "  --muted-2:#8795a8;\n" +
      "  --accent:#1a73e8;\n" +
      "  --accent-2:#34a853;\n" +
      "  --accent-3:#fbbc04;\n" +
      "  --danger:#d93025;\n" +
      "  --shadow:0 10px 30px rgba(15,23,42,.08);\n" +
      "  --ring:0 0 0 4px rgba(26,115,232,.14);\n" +
      "  color-scheme:light;\n" +
      "  background:#edf1f5;\n" +
      "}\n" +
      "html.theme-light body{\n" +
      "  background:radial-gradient(900px 420px at 15% -15%, rgba(26,115,232,.055), transparent 60%), radial-gradient(760px 360px at 95% -10%, rgba(52,168,83,.04), transparent 55%), var(--bg);\n" +
      "}\n" +
      "html.theme-light .topbar{\n" +
      "  background:rgba(247,249,251,.94);\n" +
      "  border-bottom-color:rgba(196,207,220,.9);\n" +
      "}\n" +
      "html.theme-dark{color-scheme:dark;background:#0f172a;}\n" +
      "html.theme-dark body{background-color:#0f172a;}\n" +
      "html.theme-syncing,html.theme-syncing *{transition:none!important;}\n" +
      "@view-transition{navigation:auto;}\n" +
      "::view-transition-old(root),::view-transition-new(root){animation-duration:.11s;animation-timing-function:ease-out;}\n";
    document.head.appendChild(style);
  }

  function loadProfessionalStyleEarly() {
    if (document.querySelector('link[href*="styles/professional.css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = getRootPath() + "styles/professional.css?v=20260824-study-metrics";
    document.head.appendChild(link);
  }

  function installSpeculationRules() {
    if (document.getElementById("estudiemosSpeculationRules")) return;
    if (!HTMLScriptElement.supports || !HTMLScriptElement.supports("speculationrules")) return;

    var script = document.createElement("script");
    script.id = "estudiemosSpeculationRules";
    script.type = "speculationrules";
    script.textContent = JSON.stringify({
      prefetch: [{
        source: "document",
        where: { href_matches: "/*" },
        eagerness: "moderate"
      }]
    });
    document.head.appendChild(script);
  }

  function readTheme() {
    var theme = DEFAULT_THEME;
    try {
      theme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (error) {}
    return theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, notify, instant) {
    var next = theme === "dark" ? "dark" : "light";
    if (instant) root.classList.add("theme-syncing");
    root.classList.toggle("theme-dark", next === "dark");
    root.classList.toggle("theme-light", next === "light");
    root.dataset.theme = next;
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", next === "dark" ? "#0f172a" : "#edf1f5");
    if (instant) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.remove("theme-syncing");
        });
      });
    }
    if (notify) {
      window.dispatchEvent(new CustomEvent("estudiemos:theme-change", { detail: { theme: next } }));
    }
  }

  function saveTheme(theme) {
    var next = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {}
    applyTheme(next, true);
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", { detail: { key: STORAGE_KEY } }));
  }

  function loadSmoothNavigation() {
    if (document.querySelector('script[src*="scripts/smooth-nav.js"]')) return;

    var rootPath = getRootPath();
    try {
      window.EstudiemosRoot = new URL(rootPath || "./", location.href).pathname;
    } catch (error) {
      window.EstudiemosRoot = rootPath || "./";
    }
    var script = document.createElement("script");
    script.src = rootPath + "scripts/smooth-nav.js?v=20260822-history-fix";
    script.defer = true;
    document.head.appendChild(script);
  }

  function registerServiceWorkerEarly() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    try {
      var rootPath = getRootPath();
      var workerUrl = new URL(rootPath + "service-worker.js", location.href);
      var scopeUrl = new URL(rootPath || "./", location.href);
      navigator.serviceWorker.register(workerUrl.href, { scope: scopeUrl.pathname }).catch(function () {});
    } catch (error) {}
  }

  function syncHomeLinks() {
    var href = window.EstudiemosRoot || "./";
    document.querySelectorAll(".brand").forEach(function (link) {
      link.setAttribute("href", href);
    });
  }

  installEarlyThemeStyles();
  applyTheme(readTheme(), false);
  loadProfessionalStyleEarly();
  installSpeculationRules();
  registerServiceWorkerEarly();
  loadSmoothNavigation();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncHomeLinks);
  } else {
    syncHomeLinks();
  }

  window.EstudiemosTheme = {
    key: STORAGE_KEY,
    get: readTheme,
    set: saveTheme,
    sync: function () {
      applyTheme(readTheme(), true, true);
    }
  };

  function syncThemeInstantly() {
    applyTheme(readTheme(), true, true);
  }

  window.addEventListener("pageshow", syncThemeInstantly);
  window.addEventListener("pageshow", syncHomeLinks);
  window.addEventListener("pagereveal", syncThemeInstantly);
  window.addEventListener("popstate", syncThemeInstantly, true);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) syncThemeInstantly();
  });

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) syncThemeInstantly();
  });
})();
