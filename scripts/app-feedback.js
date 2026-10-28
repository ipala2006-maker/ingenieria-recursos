(function () {
  if (window.EstudiemosFeedback) return;
  var lastPulse = 0;
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function complete(input, trusted) {
    if (!trusted || !input.checked || reduced()) return;
    var now = Date.now();
    if (now - lastPulse < 300) return;
    lastPulse = now;
    var rect = input.getBoundingClientRect();
    if (rect.width && rect.height) {
      var pulse = document.createElement('span');
      pulse.className = 'task-completion-pulse';
      pulse.setAttribute('aria-hidden', 'true');
      pulse.style.left = (rect.left + rect.width / 2) + 'px';
      pulse.style.top = (rect.top + rect.height / 2) + 'px';
      document.body.appendChild(pulse);
      setTimeout(function () { pulse.remove(); }, 320);
    }
    try {
      if (localStorage.getItem('estudiemos_haptics') !== 'false' && typeof navigator.vibrate === 'function') navigator.vibrate(8);
    } catch (error) {}
  }
  document.addEventListener('click', function (event) {
    var input = event.target.closest('input[data-agenda-done],input[data-dashboard-agenda-done]');
    if (input) complete(input, event.isTrusted);
  }, true);
  window.EstudiemosFeedback = { complete: complete };
})();
