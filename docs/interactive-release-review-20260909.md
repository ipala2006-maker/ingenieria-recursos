# Revision de interacciones y seguridad - 2026-09-09

## Alcance entregado

- Inicio: aro Pomodoro ajustable con puntero, tacto y teclado; configuracion de estudio, descanso, bloques, inicio automatico y alarma.
- El cambio de tiempo pendiente conserva el reloj y la sincronizacion existentes. No asigna minutos ficticios ni completa bloques por arrastrar el aro.
- Musica y Spotify retirados de las interfaces del temporizador. Se conserva la alarma y su prueba manual.
- Racha: consulta de periodos de 7 y 30 dias con datos registrados, seleccion de dia y navegacion al pasado.
- Calendario: boton Hoy, navegacion con teclado, gesto horizontal y transicion que respeta movimiento reducido.
- Descarga: refinamiento del diseno existente y demostracion interactiva del Pomodoro. La demostracion no escribe datos en la cuenta.
- Widgets web de Windows: relieve visual, dimensiones compactas estables y preservacion del foco durante actualizaciones.
- Widgets nativos de Android: superficies y tipografia refinadas, sin alterar IDs ni acciones. APK 1.5.4 (versionCode 22); requiere actualizacion nativa.
- Autenticacion del servidor: tiempo maximo de 12 segundos, incluyendo lectura de respuesta; una falla o respuesta invalida no concede acceso.

## Comprobaciones reproducibles

1. `node --test tests/plans.test.js tests/referral-ui.test.js tests/security.test.js tests/study-home.test.js`: 32 pruebas aprobadas.
2. `tests/product-ui.smoke.cjs`: Chrome y WebKit, 1440x900, 390x844, 412x915 y 320x568. Cuentas simuladas aisladas. Inicio, aro, configuracion, calendario, Inbox, carpetas, historial, temas y movimiento reducido. Capturas y comprobacion de pixeles del contenido 3D.
3. `tests/presentation-widgets.smoke.cjs`: descarga en tres tamanos y cinco widgets en tres tamanos. Foco, controles, limites visuales y ausencia de errores de pagina. La instalacion PWA se simula: no sustituye una instalacion real del sistema operativo.
4. `tests/security-public.smoke.cjs`: comprobaciones no destructivas sobre produccion; cabeceras, rutas privadas sin sesion, configuracion publica sin secretos y denegacion de consultas anonimas a tres tablas.
5. `scripts/security-check.js`: patrones de secretos en archivos rastreados y consulta OSV para las cinco dependencias declaradas en el verificador. No es un inventario completo de dependencias transitivas ni una auditoria del historial Git.

Las pruebas de interfaz no envian consultas reales a IA, no cobran, no envian SMS y no modifican cuentas de usuarios.

## Limites de la verificacion

No es posible afirmar seguridad absoluta ni ausencia de todos los errores. Esta revision no sustituye una prueba de penetracion independiente.

- La comprobacion de RLS combina revision de definiciones y rechazo de acceso anonimo en produccion. No se ejecuto aqui una nueva prueba integral entre dos cuentas autenticadas reales.
- Las pruebas de escritorio/WebKit no certifican la alarma con un iPhone fisico bloqueado, la ejecucion suspendida, la bateria de Android ni el anclaje de widgets por cada fabricante.
- No se reinstalo Windows ni se alteraron SmartScreen, antivirus, permisos o sesiones personales.
- No se probaron cobros reales ni la entrega de correos/SMS/WhatsApp.
- No se contrataron herramientas, servicios ni planes pagos. No se ejecuto Strix.

## Actualizacion

La web, PWA de PC/iPhone y contenido web de widgets usan los archivos publicados. Desde Perfil > Actualizar se obtiene la version web vigente. Los widgets de escritorio ya abiertos pueden necesitar cerrarse y abrirse para cargar el nuevo diseno.

Android requiere la APK 1.5.4 para los cambios en widgets nativos. Se conserva el ID de paquete y el mecanismo existente de firma estable. La publicacion se realiza mediante el flujo `Build Android app`; verificar su resultado y el recurso `android-latest` antes de anunciar disponible la APK. No debe requerir desinstalar una version anterior firmada con la misma clave.

Enlace permanente de descarga: https://estudiemos-app.vercel.app/instalar.html

## Referencias

- Android RemoteViews: https://developer.android.com/reference/android/widget/RemoteViews
- Android app widgets: https://developer.android.com/develop/ui/views/appwidgets
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
