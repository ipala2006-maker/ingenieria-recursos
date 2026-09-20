# Alarmas de Inbox

## Uso

- Al crear una tarea, activa **Programar alarma**, elige dia, hora y repeticion.
- La campana junto a una tarea permite cambiar o quitar su alarma.
- Opciones: una vez, todos los dias, lunes a viernes, semanal o mensual.
- La fecha de la alarma es independiente de la fecha de entrega. Una tarea
  puede estar sin fecha en Inbox y tener alarma, o no tener alarma alguna.
- Completar o eliminar la tarea detiene sus siguientes avisos. No se crean
  copias de la tarea por cada repeticion. Las alarmas mensuales del dia 31
  omiten los meses que no tienen dia 31.
- La hora es local en cada dispositivo. Si viajas, las 18:00 siguen siendo
  las 18:00 del lugar donde esta ese dispositivo.

Ejemplo para el organizador: "Avisame de resolver la guia de Fisica todos los
viernes a las 18, desde el 18 de septiembre". Antes de guardar se ve la tarea
y la fecha, hora y repeticion. Si falta una hora concreta, pide aclaracion.
Solo interpretar el texto usa el asistente y sus limites existentes. La
consulta de alarmas de Windows usa la API de Estudiemos, sin IA ni tokens de
modelo. Genera solicitudes al alojamiento y a la base de datos.

## PC Con La App Cerrada

1. Actualiza el soporte de Windows a 1.6.0 desde la pagina de instalacion.
   No es necesario reinstalar la PWA.
2. En el editor de alarma, toca **Conectar alarmas con esta PC**. Acepta el
   comportamiento a pantalla completa y abrir Estudiemos en el navegador.
   Espera la confirmacion de Windows. Si no aparece, el enlace para actualizar
   el soporte esta en el mismo editor. No hace falta mantener widgets abiertos.
3. En la alarma, activa **Enviar tambien la alarma a Windows** en **Con la app
   cerrada en Windows** y acepta el aviso que explica el comportamiento a
   pantalla completa. Guarda y espera que la cuenta termine de sincronizar.
   Las alarmas posteriores de IA reutilizan esta eleccion, no la decide el modelo.

El instalador agrega una tarea del Programador de tareas para el usuario
actual. No pide su contrasena, no eleva privilegios, no usa servicios pagos
ni desactiva antivirus. La tarea y su lanzador permanecen ocultos cuando no
hay avisos; no abren una consola cada minuto. Comprueba los avisos una vez por
minuto: puede sonar hasta un minuto despues del horario. Tras sincronizar, funciona sin tener
abierta la PWA. Recibe los cambios de otros dispositivos desde la cuenta. Sin
conexion usa la ultima copia recibida; no puede recibir ediciones nuevas.

Cuando hay una alarma, Windows muestra una vista en la pantalla principal con
el nombre de la tarea y repite el sonido hasta elegir **Entendido**, abrir
Inbox, pulsar Escape o alcanzar el limite de seguridad de cinco minutos. La
alerta conserva una salida visible y no bloquea los controles del sistema.

La PC debe estar encendida, con la sesion iniciada y el volumen activo. No
enciende la PC ni la despierta. Recupera avisos de los ultimos diez minutos;
los anteriores no suenan todos juntos al regresar. Windows puede ocultar el
globo de respaldo por No molestar, pero no la vista principal. El sonido
respeta volumen/salida del sistema.

El aviso web se mantiene como respaldo: marcar la opcion Windows no demuestra
que el soporte este instalado. Con ambos activos y la app abierta pueden llegar
dos avisos. No se declara instalado un componente que no se pudo comprobar.
La app solicita el permiso web al activar la alarma; si fue denegado, muestra
el estado bloqueado y conserva el aviso interno. No modifica permisos del SO.

## Otros Dispositivos

La configuracion se guarda y sincroniza en `bandeja_agenda`. Con la app abierta
se muestra el aviso y se intenta reproducir el sonido habilitado por una
interaccion. Las notificaciones del navegador requieren su permiso. **Esta
version no agrega alarmas nativas con Android/iPhone cerrados**; el sistema
operativo puede suspender la web y el audio. No se promete puntualidad de un
temporizador web en segundo plano.

## Implementacion Y Privacidad

- `shared/inbox-alarms.js`: validacion y recurrencias locales compartidas.
- `scripts/inbox-alarms.js`: editor, permisos, aviso web y conexion nativa.
- `api/_lib/inbox-alarm-feed.js`: consulta solo las alarmas habilitadas de la
  cuenta autenticada. Enlace inicial de 2 minutos, credencial de solo lectura
  por 90 dias y confirmacion vinculada a esa misma cuenta.
- `windows-installer/ConnectInboxAlarms.ps1`: registra el comprobador oculto,
  protege la credencial con DPAPI para el usuario de Windows y abre la
  confirmacion en Estudiemos. No guarda la sesion completa del usuario.
- `api/agenda-ai.js`: esquema validado del asistente. No activa el componente
  nativo por iniciativa del modelo, y no inventa alarmas para tareas comunes.
- `windows-installer/InboxAlarm.ps1`: consulta la programacion con la credencial
  protegida y conserva una copia local de titulos y horarios. Muestra la alarma
  a pantalla completa y reproduce sonido. Guarda IDs/fechas de avisos emitidos
  por 14 dias. Conserva el lector antiguo de Rainmeter para instalaciones previas.
- `windows-installer/InstallInboxAlarm.ps1`: instala la tarea de Windows y
  guarda la ruta real de los recursos (incluida la instalacion portable). La
  tarea queda marcada como oculta y usa el modo `headless` nativo de la consola
  de Windows, sin depender de Windows Script Host.

`cloud.json` contiene titulos y horarios en texto local; `feed.dpapi` contiene
la credencial cifrada para ese usuario de Windows. El archivo legado
`InboxAlarms.inc` esta codificado, no cifrado. No usar un perfil de Windows
compartido para informacion privada. Cerrar el navegador o cerrar sesion no
revoca esta conexion independiente. Al vencer los 90 dias hay que reconectar;
una respuesta 401/403 detiene los avisos, sin recurrir a datos anteriores.

Desactivar todas las alarmas Windows y sincronizar deja la programacion vacia.
Para quitar el proceso opcional, elimina la tarea `Estudiemos Inbox <usuario>` en
el Programador de tareas de Windows; no afecta las demas tareas del sistema.

## Verificacion

`node --test tests/inbox-alarms.test.cjs` prueba fechas, repeticiones,
cancelacion, contexto/validacion de IA y evaluacion real del script Windows
en modo de prueba, sin instalar tareas del sistema ni mostrar notificaciones.
El 13/09/2026 se actualizo el componente de alarmas en la PC de Ian y se
verifico su tarea activa cada minuto, oculta y ejecutada con
`conhost.exe --headless` sin consola. Una prueba nativa con datos piloto termino
y registro la emision del
aviso y la llamada al sonido. No se confirmo de oido la salida fisica de audio
ni se forzo una alerta a pantalla completa durante la revision.
La revision del 19/09 agrega pruebas del feed con DPAPI, cache sin Internet y
cancelacion al recibir una lista vacia, sin abrir ventanas ni tocar tareas
reales. La prueba fisica de sonido y el flujo completo de conexion en otra PC
siguen requiriendo comprobacion despues de instalar 1.6.0.

Referencias: [Programador de tareas](https://learn.microsoft.com/en-us/windows/win32/taskschd/repeating-a-task),
[sesion interactiva sin contrasena](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype),
[permisos de notificaciones web](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).
