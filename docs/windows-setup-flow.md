# Widgets y alarmas: recorrido de instalacion

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
local sin cuentas. El componente nativo no cambia en esta revision; el flujo
real de Windows depende de aceptar su aviso y abrir el instalador.
No se evitan SmartScreen, antivirus ni permisos del sistema.
