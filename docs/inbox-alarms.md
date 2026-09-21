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

1. En la campana de una tarea, toca **Activar pantalla completa en esta PC**.
   Tambien podes abrir https://estudiemos-app.vercel.app/?alarms-setup=1.
2. Toca **Instalar alarmas para Windows** y abri el archivo descargado. Es un
   instalador independiente (1.6.3): no requiere Rainmeter, widgets ni reinstalar
   la app. Al terminar abre nuevamente la pantalla de activacion.
3. Marca el consentimiento y toca **Conectar con Windows**. Acepta **Abrir**
   en el navegador. Si no aparece, usa **Abrir activacion de Windows**, sin
   descargar otra vez. No se marca listo hasta recibir una
   confirmacion autentificada despues de registrar la tarea de Windows.
   Si Chrome no abre el componente, usa **Conectar sin el aviso del navegador**:
   **Generar archivo de conexion**, luego abre el archivo `.estudiemos-alarmas`
   desde Descargas antes de dos minutos. No es otro instalador ni un script:
   contiene un enlace temporal personal que solo interpreta el componente ya
   instalado. No lo compartas. Si vence, genera otro; no reinstales la app.
4. Toca **Probar alarma de Windows**. Esta prueba ya esta disponible despues
   de instalar y es independiente de conectar la cuenta. Ejecuta el mismo aviso
   nativo, con sonido y **Entendido**. No demuestra que la cuenta este vinculada.
5. Volve a tu tarea, marca **Mostrar esta alarma con la app cerrada** y guarda.
   Espera la sincronizacion de la cuenta antes de cerrar la app. Las alarmas
   posteriores de IA reutilizan esta eleccion, no la decide el modelo.

La activacion agrega una tarea del Programador de tareas para el usuario
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
los anteriores no suenan todos juntos al regresar. La vista nativa no depende
del permiso de notificaciones web. No puede cubrir la pantalla de bloqueo,
el escritorio seguro de Windows ni garantizar prioridad sobre aplicaciones
en pantalla completa exclusiva. El sonido respeta volumen/salida del sistema.

El aviso web se mantiene como respaldo: marcar la opcion Windows no demuestra
que el soporte este instalado. Con ambos activos y la app abierta pueden llegar
dos avisos. No se declara instalado un componente que no se pudo comprobar.
En Windows se ofrece la activacion nativa sin pedir un permiso web que no la
resolveria. En otras plataformas se solicita el permiso web. No modifica
permisos del SO ni elimina advertencias de seguridad del instalador.

## Otros Dispositivos

La configuracion se guarda y sincroniza en `bandeja_agenda`. Con la app abierta
se muestra el aviso y se intenta reproducir el sonido habilitado por una
interaccion. Las notificaciones del navegador requieren su permiso. **Esta
version no agrega alarmas nativas con Android/iPhone cerrados**; el sistema
operativo puede suspender la web y el audio. No se promete puntualidad de un
temporizador web en segundo plano.

## Implementacion Y Privacidad

Aplicar `supabase/windows-alarms.sql` antes de desplegar el feed. La funcion
`get_windows_alarm_snapshot` solo puede ejecutarla `service_role`; devuelve
ID, titulo y horario de alarmas Windows no completadas, filtradas por el
propietario del token firmado. No otorga SELECT sobre `user_states` ni altera
RLS. Una instalacion sin esta migracion no puede completar la conexion.

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
- `windows-installer/Estudiemos-Alarms.iss`: instalador independiente, sin
  dependencias de widgets. Usa la carpeta `Windows/AlarmService`, separada de
  scripts antiguos, y verifica los cinco archivos por SHA-256 despues de instalar.
  Registra `estudiemos-alarms://` para conectar/probar y `.estudiemos-alarmas`
  como archivo de vinculacion. El lector solo acepta JSON pequeno con una
  version y un token firmado; no ejecuta instrucciones ni direcciones del archivo.
- `launcher-status.json`: registra exclusivamente etapa y codigo de error de
  apertura. Nunca guarda el enlace, credenciales, titulos ni horarios.
- `windows-installer/AlarmLauncher.vbs`: valida esas dos acciones y el formato
  del token antes de lanzar el componente oculto. No recibe comandos libres.

`cloud.json` contiene titulos y horarios en texto local; `feed.dpapi` contiene
la credencial cifrada para ese usuario de Windows. El archivo legado
`InboxAlarms.inc` esta codificado, no cifrado. No usar un perfil de Windows
compartido para informacion privada. Cerrar el navegador o cerrar sesion no
revoca esta conexion independiente. Al vencer los 90 dias hay que reconectar;
una respuesta 401/403 detiene los avisos, sin recurrir a datos anteriores.
`activation-status.json` registra solo etapa, codigo HTTP y fecha de un fallo;
no incluye tokens, titulos de tareas ni datos de la cuenta.

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
siguen requiriendo comprobacion despues de instalar 1.6.1.

El 20/09/2026 se verifico el formulario nativo real con
`tests/helpers/native-alarm-window.ps1`: pantalla principal completa, TopMost,
titulo y boton para cerrar visibles. La prueba captura solo ese formulario y
lo cierra automaticamente; no instala tareas ni modifica la cuenta. Invoca el
sonido, pero no comprueba la salida fisica del parlante. El recorrido web de
instalacion/consentimiento/confirmacion se probo con respuestas y protocolo
simulados en `tests/alarm-setup.smoke.cjs`; la prueba final desde una cuenta
conectada y el Programador de tareas sigue disponible en el boton de la app.

Referencias: [Programador de tareas](https://learn.microsoft.com/en-us/windows/win32/taskschd/repeating-a-task),
[sesion interactiva sin contrasena](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype),
[permisos de notificaciones web](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).
