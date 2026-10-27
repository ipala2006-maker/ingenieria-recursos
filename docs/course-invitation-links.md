# Enlaces de catedras

## Recorrido

- Compartir siempre `https://estudiemos-app.vercel.app/materia/CODIGO` desde la catedra. Los enlaces anteriores con `#materia=` siguen siendo compatibles; solo los enlaces nuevos tienen metadatos especificos para redes.
- Con sesion activa, la invitacion abre e incorpora la catedra automaticamente. Una persona ya inscripta abre la misma catedra sin duplicar su membresia ni sus fechas.
- Sin sesion, se muestra la materia, su responsable, institucion y una muestra de fechas. "Unirme a la catedra" abre el acceso sobre esa presentacion. Instalar es opcional.
- La invitacion pendiente dura siete dias, esta ligada a la cuenta al continuar y se consume despues de una inscripcion exitosa. Los expulsados siguen bloqueados por el servidor.
- El registro envia `emailRedirectTo` con `?materia=CODIGO&unirme=1`. El codigo no va en el fragmento que Supabase usa para la sesion. El proveedor de correo debe conservar `ConfirmationURL` y permitir el retorno al origen oficial. No se agregan dominios ajenos ni comodines entre dominios.
- Una invitacion eliminada muestra una salida clara; un fallo temporal conserva la invitacion y permite volver a intentar.

## App instalada

Android nativo, desde la version 1.6.9, declara App Links verificados solo para `/materia/` en el dominio oficial. `CourseLinks` valida y normaliza la ruta a un ingreso del mismo origen, sin reenviar tokens ni URLs arbitrarias. Una apertura en frio y una apertura con la app existente usan el mismo destino. No se borran cookies ni la sesion persistente del WebView.

La asociacion publica esta en `/.well-known/assetlinks.json`. Su huella es la del certificado de firma del APK oficial, verificado con Google apksig, no la huella del archivo APK. La publicacion de Android comprueba la firma de cada APK contra esa asociacion antes de publicarlo. No se concede acceso a credenciales con Digital Asset Links.

Los APK anteriores requieren actualizar una vez; la presentacion conserva el boton Android "Abrir app instalada" con el protocolo existente y una alternativa web. La verificacion depende del dispositivo, sus preferencias y de que el navegador desde WhatsApp permita enlaces externos. La app no puede forzar ni saltar estas decisiones.

iPhone y Windows actualmente son instalaciones web/PWA, no aplicaciones nativas con Universal Links. El sistema puede abrir el navegador en lugar de la ventana instalada. El recorrido web conserva la catedra y la sesion del navegador. No se promete interceptar todos los enlaces ni se inventa una asociacion iOS: eso requiere una app nativa y su identificador firmado.

## Vista previa y privacidad

La ruta publica devuelve HTML renderizado en el servidor, incluso sin JavaScript. Open Graph y Twitter incluyen titulo de materia, descripcion, URL limpia e imagen PNG 1200 x 630 existente. Android App Links tiene tambien sus etiquetas de compatibilidad. WhatsApp y Telegram pueden conservar una vista previa anterior en su cache; volver a compartir el enlace limpio no garantiza invalidar esa cache inmediatamente.

La respuesta publica no incluye correos, listas de alumnos, archivos privados, notas, identificadores de Auth ni tokens. La previsualizacion conserva la cache acotada y la deduplicacion existentes del servidor; el navegador reutiliza la semilla HTML sin otra consulta. Los cambios no crean sondeos, tablas ni nuevos servicios pagos.

## Comprobaciones

```powershell
node --test tests/course-invitation.test.js tests/course-link-preview.test.js tests/course-deep-links.test.js tests/classroom-sync.test.js
node tests/classrooms.smoke.cjs
$env:TEST_WEBKIT='1'
node tests/classrooms.smoke.cjs
Remove-Item Env:TEST_WEBKIT
```

El smoke usa SQL real en una base PGlite efimera, API HTTP local, cuentas ficticias y un SDK de Auth simulado: no manda correos ni modifica produccion. Comprueba acceso con/sin sesion, repeticion sin duplicados, entrada desde enlaces viejos, retorno del registro, HTML sin JavaScript, imagenes cargadas y controles sin desbordes en 320/390/768/1440 px. Chrome y WebKit no sustituyen una prueba en un Android/iPhone fisico.

En Android de prueba, despues de instalar el nuevo APK:

```text
adb shell pm verify-app-links --re-verify com.estudiemos.app
adb shell pm get-app-links com.estudiemos.app
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://estudiemos-app.vercel.app/materia/CODIGO_REAL"
```

El dominio debe indicar `verified`. Probar con app cerrada y abierta, usuario conectado y desconectado. Comprobar la ruta publica de asociacion con HTTP 200, JSON y sin redireccion, y que el APK firmado conserve la huella declarada. El pipeline Android ejecuta los tests Java de enlaces y construye la app. La confirmacion real por correo y la decision de apertura del sistema requieren su comprobacion en dispositivo/cuenta de prueba, no se deducen de una captura local.
