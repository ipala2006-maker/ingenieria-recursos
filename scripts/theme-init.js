(function () {
  var theme = "light";

  try {
    theme = localStorage.getItem("estudiemos_theme") || "light";
  } catch (error) {}

  var isDark = theme === "dark";
  document.documentElement.classList.toggle("theme-dark", isDark);
  document.documentElement.classList.toggle("theme-light", !isDark);
})();
