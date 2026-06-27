(function () {
  var STORAGE_KEY = "estudiemos_theme";
  var DEFAULT_THEME = "light";
  var root = document.documentElement;

  function readTheme() {
    var theme = DEFAULT_THEME;
    try {
      theme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (error) {}
    return theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, notify) {
    var next = theme === "dark" ? "dark" : "light";
    root.classList.toggle("theme-dark", next === "dark");
    root.classList.toggle("theme-light", next === "light");
    root.dataset.theme = next;
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
    var script = document.createElement("script");
    script.src = rootPath + "scripts/smooth-nav.js?v=20260627-1";
    script.defer = true;
    document.head.appendChild(script);
  }

  applyTheme(readTheme(), false);
  loadSmoothNavigation();

  window.EstudiemosTheme = {
    key: STORAGE_KEY,
    get: readTheme,
    set: saveTheme,
    sync: function () {
      applyTheme(readTheme(), true);
    }
  };

  window.addEventListener("pageshow", function () {
    applyTheme(readTheme(), true);
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) applyTheme(readTheme(), true);
  });

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) applyTheme(readTheme(), true);
  });
})();