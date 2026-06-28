(function () {
  var STORAGE_KEY = "estudiemos_theme";
  var TRAY_OPEN_KEY = "bandeja_abierta";
  var DEFAULT_THEME = "light";
  var root = document.documentElement;

  function installEarlyThemeStyles() {
    if (document.getElementById("earlyThemeStyles")) return;

    var style = document.createElement("style");
    style.id = "earlyThemeStyles";
    style.textContent = "\n" +
      "html.theme-light{\n" +
      "  --bg:#f8fafc;\n" +
      "  --panel:#ffffff;\n" +
      "  --panel-2:#f1f5f9;\n" +
      "  --border:#dfe5ef;\n" +
      "  --text:#1f2937;\n" +
      "  --muted:#64748b;\n" +
      "  --muted-2:#94a3b8;\n" +
      "  --accent:#1a73e8;\n" +
      "  --accent-2:#34a853;\n" +
      "  --accent-3:#fbbc04;\n" +
      "  --danger:#d93025;\n" +
      "  --shadow:0 10px 30px rgba(15,23,42,.08);\n" +
      "  --ring:0 0 0 4px rgba(26,115,232,.14);\n" +
      "  color-scheme:light;\n" +
      "}\n" +
      "html.theme-light body{\n" +
      "  background:radial-gradient(900px 420px at 15% -15%, rgba(26,115,232,.10), transparent 60%), radial-gradient(760px 360px at 95% -10%, rgba(52,168,83,.08), transparent 55%), var(--bg);\n" +
      "}\n" +
      "html.theme-light .topbar{\n" +
      "  background:rgba(255,255,255,.86);\n" +
      "  border-bottom-color:rgba(203,213,225,.9);\n" +
      "}\n" +
      "html.theme-dark{color-scheme:dark;}\n" +
      "html.theme-syncing,html.theme-syncing *{transition:none!important;}\n";
    document.head.appendChild(style);
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

  function applyEarlyTrayState() {
    try {
      root.classList.toggle("tray-preopen", localStorage.getItem(TRAY_OPEN_KEY) === "true");
    } catch (error) {}
  }

  function applyTheme(theme, notify, instant) {
    var next = theme === "dark" ? "dark" : "light";
    if (instant) root.classList.add("theme-syncing");
    root.classList.toggle("theme-dark", next === "dark");
    root.classList.toggle("theme-light", next === "light");
    root.dataset.theme = next;
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
  }

  function loadSmoothNavigation() {
    if (document.querySelector('script[src*="scripts/smooth-nav.js"]')) return;

    var currentScript = document.currentScript;
    var src = currentScript ? currentScript.getAttribute("src") || "" : "";
    var rootPath = src.replace(/scripts\/theme-init\.js(?:\?.*)?$/, "");
    try {
      window.EstudiemosRoot = new URL(rootPath || "./", location.href).pathname;
    } catch (error) {
      window.EstudiemosRoot = rootPath || "./";
    }
    var script = document.createElement("script");
    script.src = rootPath + "scripts/smooth-nav.js?v=20260628-root-history";
    script.defer = true;
    document.head.appendChild(script);
  }

  function syncHomeLinks() {
    var href = window.EstudiemosRoot || "./";
    document.querySelectorAll(".brand").forEach(function (link) {
      link.setAttribute("href", href);
    });
  }

  installEarlyThemeStyles();
  applyEarlyTrayState();
  applyTheme(readTheme(), false);
  installSpeculationRules();
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
