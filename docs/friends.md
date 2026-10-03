# Amigos y ranking de rachas

## Uso

1. Abrir Amigos desde el icono de personas de la barra superior e iniciar sesion.
2. En el icono de ajustes (Mi nombre y privacidad), elegir un alias. Compartir la racha es opcional
   y viene desactivado. No se publica el correo ni el telefono.
3. Tocar + e ingresar el correo exacto de otra cuenta confirmada para enviarle
   una solicitud dentro de Amigos. No se manda un email. Tambien podes copiar
   la invitacion y enviarla por el medio que prefieras. Al abrirla,
   se envia la solicitud automaticamente con la cuenta iniciada. Si falta iniciar
   sesion, el enlace espera hasta que termine el acceso. No hay que pegarlo de nuevo.
4. Aceptar en Solicitudes. El ranking muestra dias consecutivos, solo entre
   amigos aceptados con racha compartida. Los empates tienen el mismo puesto.
5. Quitar o bloquear desde las opciones del amigo. Un bloqueo elimina la
   amistad. Desbloquear no la restaura automaticamente.

Todos muestra la lista completa, incluso amigos con racha privada. Ranking muestra
solo quienes la comparten. Desde seis amigos aparece un buscador por nombre.
Las solicitudes pendientes se muestran arriba de la lista, sin abrir otro menu.

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
- Abrir un enlace envia una solicitud, no acepta una amistad ni comparte la racha.
  Una invitacion pendiente se conserva localmente hasta 24 horas para sobrevivir
  recargas e inicio de sesion. Antes de enviarla queda vinculada a esa cuenta;
  no se reutiliza con otra. Se elimina al completar, caducar o resultar invalida.
  Un error de conexion permite reintentar sin duplicar solicitudes.
- Solicitudes por email: el servidor busca una coincidencia exacta normalizada
  entre cuentas con correo confirmado. No hay directorio, autocompletado ni
  busqueda parcial. No devuelve el email, pero una solicitud creada aparece con
  el alias y el ID social del destinatario, como las enviadas por enlace.
  Direcciones inexistentes, propias, sin verificar o bloqueadas no crean una
  relacion; se usa el mismo mensaje general sin revelar el motivo. No se envia
  correo ni se guarda una invitacion para un correo que aun no esta registrado.
  Tanto el emisor como el destinatario deben tener su email confirmado.
  Hasta 10 intentos cada 10 minutos por cuenta, contados incluso sin coincidencia.
  El correo solo se usa en la consulta parametrizada, no en logs ni respuestas.
- Limite de 100 relaciones (amigos + solicitudes) por cuenta y 200 bloqueos.
  Limite persistente de 20 cambios/minuto por cuenta mas limitacion de API.
- Actualiza al abrir, manualmente o cada 60 segundos solo con Amigos visible;
  tambien al volver a la app si el panel esta abierto o queda un enlace pendiente;
  no agrega conexiones permanentes ni consulta con el panel cerrado.
- El alias y privacidad se guardan en servidor; la disposicion del inicio y
  los datos privados de estudio no se modifican.

## Verificacion

`node --test tests/friends.test.cjs`

`node tests/friends.smoke.cjs` (requiere el Playwright local de pruebas).

Las pruebas usan PostgreSQL embebido y cuentas ficticias locales: invitacion,
aceptacion, ranking, retirada de consentimiento, bloqueos, rotacion, RLS,
suplantacion del actor, limites y vistas de escritorio/movil/claro/oscuro.
El recorrido de navegador tambien comprueba enlaces directos, login diferido,
recarga, enlaces repetidos/propios/invalidos, reintento y cambios de fragmento.
Incluye solicitudes por correo antes de abrir Amigos, mayusculas, duplicados,
cuentas no verificadas, bloqueos, limites y permisos privados. La fecha de estudio
de las pruebas y el navegador usan UTC para evitar fallos por la medianoche local.
No crean usuarios ni amistades en produccion.
