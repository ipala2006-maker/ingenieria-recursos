# Amigos y ranking de rachas

## Uso

1. Abrir Amigos desde el icono de personas de la barra superior e iniciar sesion.
2. En Mi nombre y privacidad, elegir un alias. Compartir la racha es opcional
   y viene desactivado. No se publica el correo ni el telefono.
3. Copiar el enlace y enviarlo por el medio que prefieras. Al abrirlo, el otro
   usuario puede iniciar sesion y enviar una solicitud. No se acepta sola.
4. Aceptar en Solicitudes. El ranking muestra dias consecutivos, solo entre
   amigos aceptados con racha compartida. Los empates tienen el mismo puesto.
5. Quitar o bloquear desde las opciones del amigo. Un bloqueo elimina la
   amistad. Desbloquear no la restaura automaticamente.

El ranking conserva el criterio de la app: 25 minutos registrados por dia.
Si hoy aun no se completo el objetivo, mantiene la racha de ayer. Se calcula
en el servidor desde el estado sincronizado, usando la zona horaria elegida
al guardar el perfil. No demuestra que una persona realmente estudio: la
fuente de minutos existente sigue siendo el temporizador del dispositivo.

## Activacion y seguridad

- Aplicar `supabase/friends.sql` en el proyecto existente antes de publicar.
- No hay servicios nuevos, IA, SMS, chat, llamadas ni funciones pagas.
- La API se aloja en `api/account-config?friends=1`, reutilizando el limite
  actual de funciones y la autenticacion de servidor. Nunca toma el actor
  de los datos enviados por el cliente.
- Tablas con RLS y sin acceso directo de anon/authenticated. Solo el servidor
  puede ejecutar la funcion publica limitada. La funcion interna de racha
  no puede ejecutarse directamente con las credenciales publicas.
- La consulta no devuelve historial, tareas, correos, telefonos, enlaces de
  terceros ni rachas privadas. Ocultar/quitar bloquea las siguientes consultas;
  no puede borrar lo que alguien ya vio o capturo.
- Invitaciones aleatorias de 128 bits, revocables. Los enlaces no identifican
  la cuenta publicamente. Cada amistad requiere aceptacion del destinatario.
- Limite de 100 relaciones (amigos + solicitudes) por cuenta y 200 bloqueos.
  Limite persistente de 20 cambios/minuto por cuenta mas limitacion de API.
- Actualiza al abrir, manualmente o cada 60 segundos solo con Amigos visible;
  no agrega conexiones permanentes ni consulta con el panel cerrado.
- El alias y privacidad se guardan en servidor; la disposicion del inicio y
  los datos privados de estudio no se modifican.

## Verificacion

`node --test tests/friends.test.cjs`

`node tests/friends.smoke.cjs` (requiere el Playwright local de pruebas).

Las pruebas usan PostgreSQL embebido y cuentas ficticias locales: invitacion,
aceptacion, ranking, retirada de consentimiento, bloqueos, rotacion, RLS,
suplantacion del actor, limites y vistas de escritorio/movil/claro/oscuro.
No crean usuarios ni amistades en produccion.
