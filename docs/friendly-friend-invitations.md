# Invitaciones de amistad

- Amigos > Agregar amigos > Copiar mi invitacion copia un mensaje amistoso y el enlace.
- Compartir invitacion usa el menu nativo del dispositivo cuando esta disponible. Cancelarlo no envia ni copia nada.
- Los enlaces nuevos tienen la forma `/amistad/<token>`. Su HTML incluye el titulo, la descripcion y la imagen de Estudiemos para las vistas previas sin JavaScript.
- Abrirlos lleva directamente al flujo anterior: iniciar sesion si hace falta, enviar la solicitud automaticamente y esperar la aceptacion. Los enlaces antiguos `/#friend=<token>` siguen funcionando.
- La vista previa nunca consulta la base ni publica nombres, correos o rachas. El token solo sirve para solicitar una amistad, no da acceso a datos.
- La ruta reutiliza `api/account-config` para no agregar una funcion de Vercel. No incorpora servicios, pagos ni dependencias.
- Cada red decide si muestra una tarjeta y cuanto la conserva en cache; copiar una invitacion nueva permite usar la ruta nueva sin cambiar amigos existentes.

La imagen se mantiene en `tools/friend-invite-preview.html`. Para regenerarla en el entorno local de pruebas: `node scripts/render-friend-preview.cjs`.

Pruebas: `node --test tests/friend-invitation.test.js tests/friends.test.cjs` y `node tests/friends.smoke.cjs` (tambien `FRIENDS_BROWSER=webkit`).
