# Mi espacio con Google Drive

## Uso

- Inicio conserva su espacio personalizable y su pestana movil **Mi espacio**, sin abrir otra pagina para conectar. En escritorio agrega un acceso de carpeta; Cuenta tambien incluye el enlace a Mi espacio.
- **Conectar Google Drive** inicia el consentimiento oficial y muestra siempre el selector de Google. No presupone que el Drive usa el mismo correo que la cuenta de Estudiemos.
- No se conecta Google por escribir un correo ni por instalar la app: Google exige consentimiento expreso. No se agrega este permiso al registro ni se impide usar las demas herramientas si se rechaza.
- La autorizacion pertenece a la cuenta de Estudiemos. Se mantiene en sus dispositivos sin compartir contrasenas. En cada dispositivo se requiere iniciar sesion en esa misma cuenta de Estudiemos.
- En Android 1.6.2 o posterior, Conectar abre el navegador externo, como requiere Google. Si ese navegador no tiene sesion de Estudiemos, hay que iniciarla alli. Despues de conectar, volver a la app; al recuperar el foco se vuelve a consultar la conexion. No se envia la sesion nativa por URL ni se permite OAuth dentro del WebView.
- Carpetas, subida (hasta 50 MB por archivo), busqueda, cuadrícula/lista, cambiar nombre, mover y papelera funcionan sobre Drive. Los bytes van directamente a Google; no pasan por Vercel ni Supabase Storage.
- Desconectar quita la credencial de Estudiemos y solicita su revocacion a Google. No borra los archivos. La papelera es la de Drive y permite recuperarlos desde Google Drive.
- Si Google revoca el permiso o una autorizacion de prueba vence, se solicita volver a conectar. Sin conexion o sin cuota se muestra un error; no se inventa un guardado correcto.

## Configuracion Unica Del Responsable

No activar pruebas gratuitas, creditos, facturacion ni servicios pagos.

1. En el proyecto Google Cloud **Estudiemos**, habilitar **Google Drive API**.
2. Configurar Google Auth Platform con nombre **Estudiemos**, publico externo y correo oficial de soporte. Ese correo puede aparecer a los usuarios: no usar el correo personal sin autorizacion. El correo debe ser elegible en el selector de Google (propietario del proyecto o grupo administrado).
3. Solicitar solamente `https://www.googleapis.com/auth/drive.file`. No pedir `drive`, `drive.readonly`, Gmail, Calendar ni acceso general a metadatos. El scope es no sensible, pero Google puede requerir revision de marca y dominio para mostrar la identidad verificada.
4. Crear un cliente OAuth de tipo **Aplicacion web** dedicado a Mi espacio. Registrar exactamente este redirect URI:

   `https://estudiemos-app.vercel.app/api/account-config?drive=callback`

5. Pagina principal: `https://estudiemos-app.vercel.app/`; privacidad: `https://estudiemos-app.vercel.app/about.html#privacidad`; condiciones: `https://estudiemos-app.vercel.app/about.html#terminos`. Google puede exigir verificacion del dominio.
6. Aplicar `supabase/google-drive.sql` en el proyecto Supabase de Estudiemos. Es idempotente; agrega solo una tabla privada de credenciales cifradas y no toca archivos, tareas, alarmas ni usuarios.
7. Configurar en Vercel, **solo servidor y produccion**, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `DRIVE_TOKEN_ENCRYPTION_KEY` y `GOOGLE_DRIVE_APP_ORIGIN`. La clave de cifrado son 32 bytes aleatorios codificados como 64 caracteres hexadecimales. No imprimirla, versionarla ni guardarla en variables publicas. Secretos de preview separados y cliente OAuth separado si se habilita OAuth en preview.
8. Publicar la version y comprobar Config, consentimiento real, subida de un archivo de prueba y desconexion con una cuenta autorizada por su titular.
9. Antes de ofrecerlo a todos, pasar la aplicacion OAuth de **Prueba** a **Produccion** y completar las verificaciones que indique Google. En Prueba, los permisos de Drive y refresh tokens pueden vencer a los siete dias y hay limites de usuarios de prueba. Una prueba con un correo no demuestra que ya este habilitado para todos.

Para probar en el origen de produccion sin habilitar Drive al resto, configurar primero `GOOGLE_DRIVE_PILOT_EMAILS` en Vercel servidor con los correos verificados de las cuentas piloto **de Estudiemos** (separados por comas). No son necesariamente los correos del Drive elegido. El backend autentica Config y cada operacion, oculta la lista y bloquea tambien el callback de una cuenta no permitida. Desconectar la credencial propia sigue permitido. Solo despues de verificar el flujo real y la publicacion OAuth, quitar esta restriccion y volver a desplegar para habilitarlo al resto. No basta un cambio de interfaz o un correo enviado en el cuerpo de la peticion para entrar al piloto.

Si faltan credenciales, el backend informa `enabled:false` sin revelar valores. No se activa silenciosamente el almacenamiento anterior ni se muestran conexiones simuladas a usuarios reales.

## Estado De Activacion (19 Octubre 2026)

- Tabla privada aplicada en Supabase y permisos comprobados: RLS habilitado/forzado, sin SELECT para anon/authenticated; acceso del servidor conservado.
- Vercel produccion ya tiene `DRIVE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_DRIVE_CLIENT_ID` y `GOOGLE_DRIVE_CLIENT_SECRET` de tipo Secret, y `GOOGLE_DRIVE_APP_ORIGIN`. No reemplazar la clave de cifrado existente: hacerlo invalidaria las conexiones guardadas. No se guardaron las credenciales nuevas en archivos, Git ni otros entornos.
- Google Drive API habilitada en el proyecto Estudiemos y confirmada en su consola, sin activar prueba gratuita, creditos ni facturacion.
- Ian confirmo `estudiemosapp@gmail.com` como soporte. Su sesion oficial ya esta iniciada, las condiciones iniciales de Cloud estan aceptadas y se otorgo, con confirmacion explicita, solo `roles/oauthconfig.editor` en el proyecto Estudiemos. El propietario original y otros roles no se modificaron.
- La Politica de Datos del Usuario de las APIs fue aceptada con confirmacion explicita. Google guardo la identidad Estudiemos, soporte y contacto `estudiemosapp@gmail.com`, publico externo. No se publico el correo personal como soporte.
- Se creo un cliente web dedicado a Mi espacio con un solo redirect HTTPS exacto, sin origenes JavaScript adicionales. Se declaro unicamente `drive.file` y se agrego solo el Drive oficial como usuario de prueba de Google.
- `GOOGLE_DRIVE_PILOT_EMAILS` restringe la activacion en produccion a la cuenta ya iniciada del responsable en Estudiemos; el correo de esa lista es privado y distinto del correo publico de soporte. Esta restriccion debe permanecer durante el despliegue y la prueba real, hasta completar la publicacion OAuth.
- Implementacion publicada mediante PR63 (main `2a5bdb0`); selector de cuenta independiente corregido y publicado mediante PR64 (main `238ae46`). El despliegue de produccion esta READY y conserva el piloto privado.
- El titular completo la verificacion de identidad de la cuenta oficial. Se comprobo consentimiento real `drive.file`, creacion de carpeta, subida de un TXT inocuo y lectura de su contenido original en Google Drive. Archivo y carpeta de prueba enviados a la papelera recuperable, sin eliminar permanentemente nada. La desconexion oficial termino correctamente y se confirmo en la interfaz.
- Con confirmacion explicita posterior se paso OAuth a **Produccion** y se conecto el Drive habitual del responsable con el mismo permiso limitado. Su correo no se registra en esta documentacion publica. No se leyeron ni importaron sus documentos existentes; Mi espacio crea su propia carpeta.
- Google confirmo que no se requiere verificacion de acceso a datos porque no hay permisos sensibles ni restringidos. La verificacion de **marca** detecto falta de propiedad de la pagina principal. Se solicito el comprobante oficial de Search Console y se agrega `google0ca28d0373362ce8.html`: es un archivo publico de propiedad, no un secreto OAuth. Debe conservarse mientras se mantenga esa propiedad.
- Pendiente confirmar propiedad en Search Console despues del despliegue. Google indica esperar 24 horas despues de verificar la propiedad antes de reintentar la revision de marca. El piloto privado permanece hasta completar esa revision; **En produccion** no significa **Marca verificada**.

## Seguridad

- SDK oficial `google-auth-library`, version fija. Autorizacion con PKCE S256, state aleatorio y cookie `__Host-`, Secure, HttpOnly, SameSite=Lax, diez minutos. El callback elimina la cookie, no carga terceros y devuelve a una ruta fija sin codigos ni tokens.
- Supabase comprueba la sesion antes de empezar, consultar, renovar o desconectar; el usuario de la peticion nunca se toma del cuerpo.
- Los grants se cifran con AES-256-GCM y datos asociados distintos para cada usuario y para el estado OAuth. Solo `service_role` puede consultar la tabla; clientes anonimos y autenticados no tienen permisos ni politicas.
- Los access tokens breves se mantienen solo en memoria del navegador. Los refresh tokens y el secreto OAuth nunca se envian al cliente ni se incluyen en logs, URLs o Git.
- Cambiar/cerrar cuenta limpia archivos, correo de Drive, navegacion, dialogos y token en memoria. No elimina la conexion consentida de la cuenta del servidor.
- La CSP permite conexiones solo a `https://www.googleapis.com`, sin agregar scripts de terceros ni permitir codigo inline arbitrario. La app verifica destinos de subida, IDs, nombres y propiedad de los archivos antes de modificar. Solo mueve a la papelera, nunca ejecuta DELETE permanente de archivos.
- Cada cuenta de Estudiemos tiene su carpeta identificada por `appProperties`. El permiso Google sigue siendo `drive.file`, no una restriccion criptografica a una carpeta; no debe presentarse como acceso general ni como ausencia total de riesgo.

## Conservado Y Costos

- `scripts/workspace.js`, las tablas y archivos previos en Supabase y los planes permanecen guardados. No se migran, copian ni eliminan automaticamente.
- `workspace:false` mantiene cerrado el motor de almacenamiento anterior y sus widgets nativos. `driveWorkspace:true` habilita solo la nueva interfaz de Drive. IA y facturacion siguen desactivadas.
- El espacio ocupado es el de Google del usuario. La integracion no elimina los costos de autenticacion, base de datos y hosting, ni las cuotas de la API de Google. No promete gratuidad ilimitada.

## Verificacion

- `node --test tests/google-drive.test.js tests/drive-files.test.js tests/drive-privacy.test.js`
- `node tests/workspace-drive.smoke.cjs` (Chrome); `TEST_WEBKIT=1` para Safari/WebKit. Simula cuentas y Drive, nunca usa archivos reales.
- Suite general del proyecto, comprobaciones de seguridad/CSP, compilacion Android y prueba real de Google antes de dar la integracion por activada.
- PR64: 17 pruebas de Drive/proveedor/RLS aprobadas; seguridad y CSP correctas y CI de seguridad finalizada correctamente. Chrome y WebKit a 1440, 390 y 320 px completaron los flujos simulados de conexion, archivos y desconexion. La suite general anterior completo 184 pruebas.
- Compilacion Android firmada de PR63/main `2a5bdb0` finalizada correctamente (Actions run `39315696285`); el APK `android-latest` fue actualizado el 19 de octubre de 2026 a las 20:01 UTC. La publicacion web posterior cambia solo el selector del servidor y documentacion.
- Pendiente probar consentimiento real en iPhone/PWA y Android. El WebKit de pruebas en Windows fallo de forma intermitente al navegar por un enlace desde Inicio en un viewport movil; las vistas independientes y la pestana movil se verifican por separado. No se considera una prueba en un iPhone fisico.

Fuentes: https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/workspace/drive/api/guides/api-specific-auth ; https://developers.google.com/workspace/drive/api/guides/manage-uploads ; https://developers.google.com/workspace/drive/api/guides/limits
