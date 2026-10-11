# Invitaciones de amistad

- Amigos > Agregar amigos > Copiar mi invitacion copia un mensaje amistoso y el enlace.
- Compartir invitacion usa el menu nativo del dispositivo cuando esta disponible. Cancelarlo no envia ni copia nada.
- Los enlaces nuevos tienen la forma `/amistad/<token>`. Su HTML incluye el titulo, la descripcion y la imagen de Estudiemos para las vistas previas sin JavaScript.
- Abrirlos e iniciar sesion (o registrarse) acepta la invitacion del dueno del enlace. Ambos quedan como amigos directamente: compartir el enlace ya expresa la voluntad del invitador y abrirlo la del invitado. No queda otra solicitud para aceptar. Los enlaces antiguos `/#friend=<token>` siguen funcionando.
- Por usuario o correo es distinto: se envia una solicitud pendiente. El que la envia solo puede cancelarla; el destinatario puede aceptarla, rechazarla o bloquear. Volver a enviarla no duplica ni acepta la solicitud.
- Despues de completar una amistad nueva desde un enlace, la web ofrece Instalar Estudiemos o Ahora no. Nunca se descarga nada al abrir el enlace ni se exige instalar para conectar con el amigo.
- Instalar reutiliza la accion existente de cada plataforma (paquete completo Windows, Android o guia iPhone); si no esta disponible, abre la pagina de instalacion. La amistad ya esta guardada en ambas cuentas antes de salir.
- Ahora no oculta la sugerencia para esa cuenta y ese navegador/dispositivo, sin sincronizar esa preferencia a los demas dispositivos. En modo app instalada no se muestra. No se ofrece por invitaciones invalidas, propias o ya procesadas.
- Llegar desde WhatsApp u otra app de Android no se confunde con tener Estudiemos instalada: solo su propio paquete nativo y el modo app cuentan como instalacion.
- La vista previa nunca consulta la base ni publica nombres, correos o rachas. Solo el usuario autenticado que abre el enlace puede aceptarlo; una vista previa no crea amistades. El token no permite leer datos privados ni elegir otra cuenta receptora. La racha sigue siendo privada salvo que cada amigo decida compartirla.
- La ruta reutiliza `api/account-config` para no agregar una funcion de Vercel. No incorpora servicios, pagos ni dependencias.
- Cada red decide si muestra una tarjeta y cuanto la conserva en cache; copiar una invitacion nueva permite usar la ruta nueva sin cambiar amigos existentes.

La imagen se mantiene en `tools/friend-invite-preview.html`. Para regenerarla en el entorno local de pruebas: `node scripts/render-friend-preview.cjs`.

## Actualizacion del servidor

En una base existente, ejecutar `supabase/friend-invite-acceptance.sql` antes de publicar el cliente actualizado. Reemplaza solo `friends_action`: no borra solicitudes, amistades, bloqueos ni perfiles; tampoco reemplaza la funcion de objetivos diarios. Es idempotente. `accept_invite` es la accion explicita; `request` sigue como alias para clientes anteriores. Una solicitud pendiente entre las mismas cuentas se convierte en amistad al abrir el enlace, en cualquiera de las dos direcciones. Un enlace propio, rotado o bloqueado nunca conecta.

Pruebas: `node --test tests/friend-invitation.test.js tests/friends.test.cjs` y `node tests/friends.smoke.cjs` (tambien `FRIENDS_BROWSER=webkit`).
