(function () {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const target = location.hash ? document.querySelector(location.hash) : null;
  if (target instanceof HTMLDetailsElement) target.open = true;
})();
