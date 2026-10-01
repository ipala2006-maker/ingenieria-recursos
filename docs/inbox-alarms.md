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
- El disparo interno se adelanta 30 segundos: las 17:30 se guardan y muestran
  como 17:30, pero el aviso es elegible desde las 17:29:30. No cambia la tarea,
  la interpretacion de IA ni los dias de repeticion. Aplica tambien a alarmas
  existentes. Windows requiere el componente 1.6.3.3 y Android la app 1.5.9.
  Web Push requiere aplicar la version actual de `supabase/mobile-notifications.sql`.

Ejemplo para el organizador: "Avisame de resolver la guia de Fisica todos los
viernes a las 18, desde el 18 de septiembre". Antes de guardar se ve la tarea
y la fecha, hora y repeticion. Si falta una hora concreta, pide aclaracion.
Solo interpretar el texto usa el asistente y sus limites existentes. La
consulta de alarmas de Windows usa la API de Estudiemos, sin IA ni tokens de
modelo. Genera solicitudes al alojamiento y a la base de datos.

## PC Con La App Cerrada

1. En la campana de una tarea, toca **Activar pantalla completa en esta PC**.
   Tambien podes entrar desde Perfil > **Alarmas con la app cerrada**, o abrir
   https://estudiemos-app.vercel.app/?setup-alarms=1.
2. Toca **Descargar complemento de alarmas** y abri el archivo descargado. Es un
   instalador independiente (1.6.3.3): no requiere Rainmeter, widgets ni reinstalar
   la app. Al terminar abre nuevamente la pantalla de activacion.
3. Marca el consentimiento y toca **Conectar con Windows**. Acepta **Abrir**
   en el navegador. Si no aparece, usa **Abrir activacion de Windows**, sin
   descargar otra vez. No se marca listo hasta recibir una
   confirmacion autentificada despues de registrar la tarea de Windows.
   Si Chrome no abre el componente, usa **No se abrio nada**:
   **Conectar mediante archivo**, luego abre el archivo `.estudiemos-alarmas`
   desde Descargas antes de dos minutos. No es otro instalador ni un script:
   contiene un enlace temporal personal que solo interpreta el componente ya
   instalado. No lo compartas. Si vence, genera otro; no reinstales la app.
4. Toca **Probar alarma de Windows**. Tambien esta disponible en **Ayuda y
   reparacion** antes de conectar la cuenta. Ejecuta el mismo aviso
   nativo, con sonido y **Entendido**. No demuestra que la cuenta este vinculada.
5. Volve a tu tarea, marca **Mostrar esta alarma con la app cerrada** y guarda.
   Espera la sincronizacion de la cuenta antes de cerrar la app. Las alarmas
   posteriores de IA reutilizan esta eleccion, no la decide el modelo.

La activacion agrega una tarea del Programador de tareas para el usuario
actual. No pide su contrasena, no eleva privilegios, no usa servicios pagos
ni desactiva antivirus. La tarea y su lanzador permanecen ocultos cuando no
hay avisos; no abren una consola cada minuto. Comprueba los avisos una vez por
minuto: con el adelanto puede sonar unos 30 segundos antes o despues del horario,
mas las demoras de red y del sistema. No garantiza puntualidad exacta. Tras sincronizar, funciona sin tener
abierta la PWA. Recibe los cambios de otros dispositivos desde la cuenta. Sin
conexion usa la ultima copia recibida; no puede recibir ediciones nuevas.

Cuando hay una alarma, Windows intenta mostrar una vista en la pantalla activa con
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

El parche de instalador 1.6.3.2 acepta tambien la ruta vacia normalizada por
Windows (`connect/?link=...`). Conserva el protocolo de conexion 1.6.3 y su
validacion estricta del token; no permite otros caminos ni parametros extra.
La escritura y lectura DPAPI cargan el modulo oficial de seguridad desde
`PSHOME`, sin depender de rutas de modulos heredadas por el navegador o lanzador.

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
`activation-status.json` y `sync-status.json` registran estados, fechas y,
si hay errores, su tipo, codigo HTTP, HResult o linea del script. No registran
mensajes completos de excepciones, tokens, titulos ni datos de la cuenta.
`display-status.json` se actualiza despues de restaurar explicitamente la
ventana y solicitar el primer plano con las APIs de Windows. Verifica
visibilidad real, ventana activa, limites de pantalla y sesion de proceso/consola.
Comprueba ademas que el escritorio reciba entrada (`inputDesktop=1`) y que
Windows no haya ocultado la ventana (`cloaked=0`).
No basta con un evento Shown, TopMost o `delivered.json` para afirmar que el
usuario fue interrumpido. No se alteran las restricciones de foco de Windows.

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

### Verificacion Real 27/09/2026

Instalador 1.6.3.1 instalado y conectado en la sesion interactiva real de Windows.
Se programo una tarea piloto para las 11:54 y se retiro la pagina de Estudiemos
del navegador de prueba antes del vencimiento. El Programador, sin invocacion
manual de la alarma, consulto el feed a las 11:54:48 y el evento Shown registro
`fullScreen=true` y `topMost=true` a las 11:54:49 (Argentina). La tarea piloto
quedo registrada como entregada. Se verificaron las huellas de los archivos
desde el mismo contexto que ejecuta el Programador, no solo desde la consola
de desarrollo. No se midio el audio fisico ni se verificaron otras pantallas
o aplicaciones con modo exclusivo. No se cambiaron protecciones de Windows.
Pasaron 34 pruebas automatizadas de alarmas y `scripts/security-check.js`.
Actualizacion posterior: el usuario indico que solo vio el aviso web. Por eso
esa comprobacion NO demuestra interrupcion del escritorio; queda invalidada
como prueba visual de extremo a extremo. 1.6.3.2 agrega restauracion y solicitud
explicita de primer plano, con comprobacion posterior de visibilidad/sesion.

### Confirmacion Del Usuario 28/09/2026

Con 1.6.3.2 se creo desde la app una alarma piloto para el 27/09 a las 17:18.
El componente la recibio antes del vencimiento y se retiro la pagina de
Estudiemos del navegador. La ejecucion programada registro la entrega a las
17:18:40, sin invocar manualmente el aviso: pantalla completa, TopMost,
visible, escritorio interactivo (`inputDesktop=1`) y no oculta (`cloaked=0`).
El usuario confirmo posteriormente que esa prueba interrumpio el escritorio
como esperaba, incluso con Estudiemos cerrado.

El muestreo de foco marco `foreground=false`: ese dato indica quien tenia
el foco del teclado en ese instante, no demuestra que una ventana TopMost
estuviera tapada. Se conserva el diagnostico prudente `foreground-unconfirmed`
y se registra por separado la confirmacion visual del usuario. No se declara
exito visual solo a partir de indicadores del sistema.

Pasaron 35 pruebas aisladas de alarmas y el verificador de seguridad. Los ocho
instaladores incluyen 1.6.3.2. Esta comprobacion corresponde a una sesion
Windows iniciada y desbloqueada; no garantiza interrupcion de una pantalla
segura/UAC, una PC suspendida/apagada o una aplicacion en modo exclusivo.
No se modificaron protecciones ni restricciones de foco de Windows.
