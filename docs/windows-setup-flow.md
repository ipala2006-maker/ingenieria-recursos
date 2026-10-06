# Widgets y alarmas: recorrido de instalacion

## Instalacion completa de Windows (1.6.4.1)

El boton principal de instalar.html y el boton Instalar dentro de la web
descargan Estudiemos-Para-Windows.exe. Es el mismo paquete verificado que
el complemento, ahora con accesos directos en Escritorio e Inicio.
Incluye Rainmeter, los cuatro widgets disponibles y AlarmService. No instala
programas pagos ni cambia SmartScreen. Requiere Windows x64 compatible.

El acceso abre la web real en una ventana de Edge (Chrome como alternativa),
sin crear otro perfil de navegador. No es un nuevo motor nativo ni una
instalacion PWA silenciosa. La interfaz se actualiza desde la web; cambios
del componente de Windows requieren actualizar el instalador.

Al finalizar abre directamente Conectar alarmas, sin otra descarga. Iniciar
sesion y consentir la consulta de alarmas sigue siendo necesario. La marca
windows-bundle es solo una pista de instalacion, nunca prueba de identidad
ni autorizacion: el recibo autenticado sigue siendo obligatorio.
No se agrega ningun widget visible sin elegirlo. Desde Perfil, el + usa
el soporte instalado y pide abrir el protocolo del navegador si corresponde.
Las conexiones existentes cifradas con DPAPI no se borran ni reemplazan.

La instalacion de Android y la de iPhone no cambian. Los sistemas moviles
siguen requiriendo sus propios permisos de notificacion.

Verificado: compilacion Inno Setup de los siete paquetes, instalacion de
actualizacion real en Windows con el registro indicando exito, acceso directo
apuntando a AppLauncher y tarea Inbox habilitada/oculta con AlarmService.
La prueba de navegador windows-bundle.smoke.cjs usa almacenamiento vacio y
comprueba descarga, un solo modal, consentimiento y paso a inicio de sesion.
No equivale a una prueba en una PC virgen ni elimina avisos de SmartScreen.

## Widgets

1. En Perfil, elegir el widget. Desde la pagina de descarga, elegir Inbox,
   Calendario, Pomodoro o Racha abre el mismo asistente dentro de Estudiemos.
2. Solo la primera vez: descargar el complemento y abrirlo desde Descargas.
   La eleccion se conserva. El instalador existente vuelve a Estudiemos.
3. Si ya esta instalado, tocar **Ya lo instale - Continuar**. No descarga nada.
4. **Agregar al escritorio** usa la sesion actual; si falta, pide iniciar
   sesion y retoma el paso sin obligar a instalar otra vez.
5. Windows recibe la solicitud. Minimizar la app para ver el escritorio.
   **Ya lo veo en mi escritorio** confirma el resultado para este navegador.

Si Windows ya esta preparado, el boton + del perfil envia directamente el
widget elegido sin pedir otro clic en Agregar. El asistente muestra el estado
y deja a mano el reintento si el navegador no abre el complemento.

El callback del componente indica que Windows recibio la solicitud, no prueba
que un widget sea visible ni que Rainmeter siga instalado. Un temporizador
nunca marca exito. Un fallo de conexion no abre un widget desconectado.
La descarga solo ocurre por una accion explicita. Reparacion queda desplegable.

## Alarmas

Perfil > **Alarmas con la app cerrada**, la campana de una tarea y la pagina
de descarga llevan al mismo asistente. Se ve un paso por vez:
**Instalar > Conectar > Probar**. La vuelta del instalador salta al paso de
conexion; no implica que la cuenta este conectada. El paso Probar solo aparece
como principal con el recibo de conexion autentificado existente.

El consentimiento no se premarca. Cambiar de cuenta elimina enlaces temporales.
El archivo alternativo sigue venciendo en dos minutos. No se solicitan nuevos
permisos web para resolver una funcion que requiere el complemento de Windows.

## Verificacion y limites

Las pruebas automatizadas simulan protocolos y respuestas sin instalar,
vincular cuentas reales ni disparar alarmas. La revision visual usa un servidor
local sin cuentas. El flujo real de Windows depende de aceptar su aviso y
abrir el instalador.
No se evitan SmartScreen, antivirus ni permisos del sistema.

## Procesos sin consola (1.6.4.1)

Los cinco recordatorios de racha, la conexion de alarmas y su prueba usan
`conhost.exe --headless`, con PowerShell sin perfil y no interactivo. No se
confia solo en `WindowStyle Hidden`: el terminal predeterminado puede mostrar
una ventana antes de que PowerShell procese ese argumento. La pantalla y el
sonido de una alarma vencida siguen siendo intencionales.

`InstallStreakReminders.ps1` migra solo tareas de este usuario cuyo comando
contenga la ruta exacta de `StreakReminder.ps1`. Conserva los horarios y el
estado habilitado de tareas anteriores. Las nuevas llevan el SID del usuario
para no reemplazar tareas de otra cuenta. No modifica el antivirus, el terminal
predeterminado ni las credenciales de alarmas.

Pruebas: `node --test tests/windows-background.test.js` usa un programador
simulado para verificar la migracion sin tocar tareas reales. El probe
`tests/helpers/windows-background-probe.ps1` puede ejecutarse en una tarea
temporal para comprobar que la consola no sea visible, sin disparar alarmas.

Verificado el 2026-10-06 en Windows: las cinco tareas existentes de racha se
migraron sin cambiar horarios ni preferencias. La credencial cifrada de
alarmas mantuvo el mismo hash. Una tarea temporal real termino con codigo 0,
sin consola ni ventana principal visible. Ambos protocolos ejecutaron un
helper piloto tambien sin consola. Se reconstruyeron todos los instaladores.
