# Enlaces de catedras

## Recorrido

- Compartir siempre `https://estudiemos-app.vercel.app/materia/CODIGO` desde la catedra. Los enlaces anteriores con `#materia=` siguen siendo compatibles; solo los enlaces nuevos tienen metadatos especificos para redes.
- Dentro de la app, o al elegir expresamente continuar por web, una sesion activa abre e incorpora la catedra automaticamente. Una persona ya inscripta abre la misma catedra sin duplicar su membresia ni sus fechas.
- Si Android o Windows deja el HTTPS en el navegador, la primera accion es **Abrir en Estudiemos**. No se carga el SDK de Auth ni se aprovecha una sesion del navegador para mandar al usuario a la version web por sorpresa. **Unirme desde el navegador** es una eleccion separada y explicita.
- Sin sesion, se muestra la materia, su responsable, institucion y una muestra de fechas. "Unirme a la catedra" abre el acceso sobre esa presentacion. Instalar es opcional.
- La invitacion pendiente dura siete dias, esta ligada a la cuenta al continuar y se consume despues de una inscripcion exitosa. Los expulsados siguen bloqueados por el servidor.
- El registro envia `emailRedirectTo` con `?materia=CODIGO&unirme=1`. El codigo no va en el fragmento que Supabase usa para la sesion. El proveedor de correo debe conservar `ConfirmationURL` y permitir el retorno al origen oficial. No se agregan dominios ajenos ni comodines entre dominios.
- Una invitacion eliminada muestra una salida clara; un fallo temporal conserva la invitacion y permite volver a intentar.

## App instalada

Android nativo, desde la version 1.6.9, declara App Links verificados solo para `/materia/` en el dominio oficial. `CourseLinks` valida y normaliza la ruta a un ingreso del mismo origen, sin reenviar tokens ni URLs arbitrarias. Una apertura en frio y una apertura con la app existente usan el mismo destino. No se borran cookies ni la sesion persistente del WebView.

La asociacion publica esta en `/.well-known/assetlinks.json`. Su huella es la del certificado de firma del APK oficial, verificado con Google apksig, no la huella del archivo APK. La publicacion de Android comprueba la firma de cada APK contra esa asociacion antes de publicarlo. No se concede acceso a credenciales con Digital Asset Links.

Los APK anteriores requieren actualizar una vez. Si un navegador interno retiene el enlace, el boton principal usa un `intent:` directo, con el toque original y sin esperar la autenticacion. No se usan temporizadores para lanzar Android, porque pierden la activacion del usuario. Si la app no se encuentra o el navegador la bloquea, vuelve a la misma presentacion con `?abrir=web`: no descarga APKs por sorpresa ni intenta abrir de nuevo en bucle.

Windows 2.0.1 registra por usuario exclusivamente `estudiemos-app://open?materia=CODIGO`. AppLauncher valida el URI completo, rechaza cualquier opcion extra y abre solo el origen oficial mediante `--app`, en el perfil habitual de Edge (Chrome como alternativa). La entrada no se pasa a PowerShell ni a un shell de comandos. No se cambian `http`, `https`, el navegador predeterminado ni el protocolo PWA existente. Al actualizar y abrir el paquete se conserva una pista local de esta capacidad; en ese navegador se hace un intento automatico por invitacion, acotado para evitar bucles. La pista y la perdida de foco no se consideran prueba de que una app se abrio.

El paquete viejo de Windows requiere actualizar una vez para instalar este protocolo. No es una nueva app WinUI ni una instalacion PWA silenciosa: sigue usando el navegador como motor, pero abre la ventana de Estudiemos, no una pestana de Internet. No se copian sesiones entre perfiles distintos.

La verificacion depende del dispositivo, sus preferencias y de que el navegador desde WhatsApp permita enlaces externos. No se puede impedir que el sistema muestre **Abrir Estudiemos** o que el usuario deba tocar ese boton cuando un navegador retiene el HTTPS. No se promete interceptar todos los enlaces del sistema.

iPhone sigue siendo una PWA sin app nativa con Universal Links. El sistema puede abrir Safari en lugar de la ventana instalada. Se mantiene el recorrido web sin perder la invitacion; no se inventa una asociacion iOS, que requeriria una app nativa y su identificador firmado.

## Vista previa y privacidad

La ruta publica devuelve HTML renderizado en el servidor, incluso sin JavaScript. Open Graph y Twitter incluyen titulo de materia, descripcion, URL limpia e imagen PNG 1200 x 630 existente. Android App Links tiene tambien sus etiquetas de compatibilidad. WhatsApp y Telegram pueden conservar una vista previa anterior en su cache; volver a compartir el enlace limpio no garantiza invalidar esa cache inmediatamente.

La respuesta publica no incluye correos, listas de alumnos, archivos privados, notas, identificadores de Auth ni tokens. La previsualizacion conserva la cache acotada y la deduplicacion existentes del servidor; el navegador reutiliza la semilla HTML sin otra consulta. Los cambios no crean sondeos, tablas ni nuevos servicios pagos.

## Comprobaciones

```powershell
node --test tests/course-invitation.test.js tests/course-link-preview.test.js tests/course-deep-links.test.js tests/classroom-sync.test.js
node --test tests/course-app-routing.test.js tests/windows-setup-flow.test.cjs
node tests/classrooms.smoke.cjs
$env:TEST_WEBKIT='1'
node tests/classrooms.smoke.cjs
Remove-Item Env:TEST_WEBKIT
```

El smoke usa SQL real en una base PGlite efimera, API HTTP local, cuentas ficticias y un SDK de Auth simulado: no manda correos ni modifica produccion. Comprueba acceso con/sin sesion, repeticion sin duplicados, entrada desde enlaces viejos, retorno del registro, HTML sin JavaScript, imagenes cargadas y controles sin desbordes en 320/390/768/1440 px. Chrome y WebKit no sustituyen una prueba en un Android/iPhone fisico.

La prueba app-first intercepta los protocolos antes del sistema: comprueba href, activacion real del clic y ausencia de SDK/login del navegador, sin abrir programas en la PC. Script Host ejecuta el parser VBS con un shell ficticio: valida destino `--app`, rechazo de opciones/URLs maliciosas y conservacion del perfil. No modifica el registro durante las pruebas. Una apertura real de Windows/Android requiere comprobar ademas el componente instalado, no solo el DOM.

En Android de prueba, despues de instalar el nuevo APK:

```text
adb shell pm verify-app-links --re-verify com.estudiemos.app
adb shell pm get-app-links com.estudiemos.app
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://estudiemos-app.vercel.app/materia/CODIGO_REAL"
```

El dominio debe indicar `verified`. Probar con app cerrada y abierta, usuario conectado y desconectado. Comprobar la ruta publica de asociacion con HTTP 200, JSON y sin redireccion, y que el APK firmado conserve la huella declarada. El pipeline Android ejecuta los tests Java de enlaces y construye la app. La confirmacion real por correo y la decision de apertura del sistema requieren su comprobacion en dispositivo/cuenta de prueba, no se deducen de una captura local.
