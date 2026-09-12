# Alarmas de Inbox

## Uso

- Al crear una tarea, activa **Alarma**, elige fecha, hora y repeticion.
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
Las alarmas no llaman una API: solo interpretar el texto usa el asistente
existente y sus limites existentes.

## PC Con La App Cerrada

1. Actualiza el soporte de widgets de Windows a 1.4.0 (recompilar los paquetes
   antes de publicar esta rama). No es necesario reinstalar la PWA.
2. Mantene un widget conectado a la misma cuenta para recibir los cambios.
3. En la alarma, abre **Avisos en esta PC** y activa **Usar avisos de Windows
   con la app cerrada**. Guarda y espera que la cuenta termine de sincronizar.

El instalador agrega una tarea del Programador de tareas para el usuario
actual. No pide su contrasena, no eleva privilegios, no usa servicios pagos
ni desactiva antivirus. Comprueba los avisos una vez por minuto: puede sonar
hasta un minuto despues del horario. Tras sincronizar, funciona sin tener
abierta la PWA, incluso sin conexion. Los cambios hechos en otro dispositivo
requieren que un widget conectado los reciba.

La PC debe estar encendida, con la sesion iniciada y el volumen activo. No
enciende la PC ni la despierta. Recupera avisos de los ultimos diez minutos;
los anteriores no suenan todos juntos al regresar. Windows puede ocultar el
aviso por No molestar. El sonido respeta volumen/salida del sistema.

La opcion Windows evita duplicar el aviso en el navegador donde la activaste.
Otra PC no silencia su aviso web solo por recibir una alarma sincronizada. Si no
actualizaste el soporte, dejala desactivada para recibir el aviso con la app
abierta. No se declara instalado un componente que no se pudo comprobar.

## Otros Dispositivos

La configuracion se guarda y sincroniza en `bandeja_agenda`. Con la app abierta
se muestra el aviso y se intenta reproducir el sonido habilitado por una
interaccion. Las notificaciones del navegador requieren su permiso. **Esta
version no agrega alarmas nativas con Android/iPhone cerrados**; el sistema
operativo puede suspender la web y el audio. No se promete puntualidad de un
temporizador web en segundo plano.

## Implementacion Y Privacidad

- `shared/inbox-alarms.js`: validacion y recurrencias locales compartidas.
- `scripts/inbox-alarms.js`: editor, permisos, aviso web y sincronizacion del
  archivo local de Rainmeter. Ningun texto de usuario se ejecuta como codigo.
- `api/agenda-ai.js`: esquema validado del asistente. No activa el componente
  nativo por iniciativa del modelo, y no inventa alarmas para tareas comunes.
- `windows-installer/InboxAlarm.ps1`: lee fragmentos base64 limitados, muestra
  aviso y sonido. Solo guarda IDs/fechas de avisos emitidos por 14 dias.
- `windows-installer/InstallInboxAlarm.ps1`: instala la tarea de Windows y
  guarda la ruta real de los recursos (incluida la instalacion portable).

El archivo `InboxAlarms.inc` contiene titulos y horarios locales en texto
codificado, no cifrado. Tiene la misma privacidad local que los widgets y solo
incluye alarmas activas. No contiene correos, tokens ni claves. Cerrar sesion
en el widget limpia su programacion cuando recibe ese cambio. No puede
borrar remotamente un archivo en una PC desconectada.

Desactivar todas las alarmas Windows y sincronizar deja el archivo vacio.
Para quitar el proceso opcional, elimina la tarea `Estudiemos Inbox <SID>` en
el Programador de tareas de Windows; no afecta las demas tareas del sistema.

## Verificacion

`node --test tests/inbox-alarms.test.cjs` prueba fechas, repeticiones,
cancelacion, contexto/validacion de IA y evaluacion real del script Windows
en modo de prueba, sin instalar tareas del sistema ni mostrar notificaciones.
La comprobacion del sonido fisico y la instalacion real deben realizarse al
probar el paquete actualizado. No se realizaron con una cuenta de usuario real.

Referencias: [Programador de tareas](https://learn.microsoft.com/en-us/windows/win32/taskschd/repeating-a-task),
[sesion interactiva sin contrasena](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype),
[permisos de notificaciones web](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).
