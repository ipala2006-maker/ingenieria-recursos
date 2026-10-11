(function () {
  const match = /^\/amistad\/([a-f0-9]{32})\/?$/.exec(location.pathname);
  const token = match?.[1];
  const status = document.querySelector('[data-invitation-status]');
  if (!token) {
    status.textContent = 'Este enlace no tiene una invitaci\u00f3n. Pedile a tu amigo que lo comparta de nuevo desde Estudiemos.';
    return;
  }
  const destination = new URL('/', location.href);
  destination.hash = 'friend=' + token;
  document.querySelector('[data-invitation-open]').href = destination.href;
  status.textContent = 'Abriendo tu invitaci\u00f3n en Estudiemos...';
  // Retain the existing automatic request and sign-in flow, without another step.
  location.replace(destination.href);
})();
