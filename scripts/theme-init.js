(function () {
  var STORAGE_KEY = "estudiemos_theme";
  var DEFAULT_THEME = "light";
  var theme = DEFAULT_THEME;

  try {
    theme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch (error) {}

  if (theme !== "dark" && theme !== "light") {
    theme = DEFAULT_THEME;
  }

  var root = document.documentElement;
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  root.dataset.theme = theme;

  window.EstudiemosTheme = {
    key: STORAGE_KEY,
    get: function () {
      try {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
      } catch (error) {
        return DEFAULT_THEME;
      }
    },
    set: function (nextTheme) {
      var next = nextTheme === "dark" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (error) {}
      root.classList.toggle("theme-dark", next === "dark");
      root.classList.toggle("theme-light", next === "light");
      root.dataset.theme = next;
      window.dispatchEvent(new CustomEvent("estudiemos:theme-change", { detail: { theme: next } }));
    }
  };
})();