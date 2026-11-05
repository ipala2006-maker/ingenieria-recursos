# Estudiemos: revision previa a AdSense

## Actualizacion de estado: 5 de noviembre de 2026

Este archivo conserva abajo la auditoria historica del 4 de noviembre; sus
hallazgos de Drive y consentimiento no describen el estado actual.
La guia operativa vigente es `ads-banner-integration.md`.

- PR #125 corrigio Drive para ambos origenes. La comprobacion sin sesion desde
  estudiemos.ar devuelve 401 de autenticacion, no el antiguo 403 de origen.
  Esto no sustituye una prueba personal de autorizacion OAuth.
- PR #128 activo InMobi Choice globalmente en Inicio, Mi espacio y Materias.
  Cuenta -> Preferencias de cookies permite reabrir el CMP; la pagina
  `/consentimiento?preferencias=1` conserva el acceso alternativo sin anuncios.
- Chromium y WebKit verificaron aceptacion, rechazo y revocacion persistente
  entre pantallas. AdSense permanece condicionado a una cuenta Free, origen
  canonico y consentimiento valido; Pro, Sin anuncios y Android WebView quedan
  excluidos. Los ensayos interceptan las peticiones publicitarias.
- El propietario confirmo perfil de pagos y configuracion de anuncios completos,
  sitio `Preparando el sitio` y ads.txt `Autorizado`. No equivale a `Listo`.
- Siguen correspondiendo la validacion del ancla/SDK real tras la aprobacion,
  las comprobaciones en dispositivos fisicos y la revalidacion del CMP cuando
  termine su prueba Premium. No hay pagos ni un nuevo envio a revision.

## Auditoria original (historica)

Fecha: 4 de noviembre de 2026, Argentina.
Produccion auditada: `estudiemos.ar`, codigo base `c31de83`.
Esta revision no activa publicidad, no cambia cuentas ni credenciales y no
certifica todos los modelos de dispositivos.

## Verificaciones

- Produccion: HTTP redirige a HTTPS; el certificado se valida normalmente.
  Inicio, Mi espacio, Materias, CSS, JS, fuente, icono, manifest, service
  worker y `ads.txt` responden con los tipos y contenidos esperados.
- Auth: la configuracion publica declara Turnstile; Catedras rechaza
  solicitudes sin sesion. El hostname y los retornos de Auth de estudiemos.ar
  ya fueron autorizados. No se enviaron correos ni se usaron credenciales.
- Regresion: 527 pruebas generales y 22 pruebas de avisos moviles aprobadas.
  Incluyen simulaciones de sincronizacion y pruebas aisladas de Windows.
- UI local: Chrome y WebKit, 320, 390, 768, 1024 y 1440 px, claro/oscuro y
  movimiento reducido. Se ejercitan Inbox, calendario, Pomodoro, amigos,
  catedras, cuenta, personalizacion, Mi espacio e instalacion.
- Casos adicionales: tutorial, alarmas con panel anidado, instalador Windows
  y puente Android con datos simulados. El ancla de AdSense se prueba con SDK
  simulado; sin impresiones ni peticiones a Google Ads.
- Correcciones preparadas: calendario angosto con controles que pasan a
  dos filas, Inbox angosto con acciones debajo del titulo y mejor contraste
  en la descarga en modo claro.

## Hallazgos al momento de la auditoria original

1. **Drive en el dominio nuevo.** La solicitud POST sin sesion a
   `/api/account-config?drive=start` responde 403 "Origen no permitido" desde
   estudiemos.ar, pero 401 "AUTH_REQUIRED" desde workers.dev. El servidor
   compara Origin con el origen anterior antes de autenticar. No equivale a
   una caida de Google ni se arregla con CORS abierto. Preparar un callback
   exacto adicional en Google y soporte de ambos origenes en el servidor,
   manteniendo validacion de sesion, cookie por host, PKCE, cifrado y retorno
   fijo. Verificar una conexion existente y una nueva antes de migrar.
2. **Dispositivos reales.** La configuracion publica de avisos web declara
   `enabled:true`; no demuestra que llegue una notificacion. Validar un aviso
   en iOS agregado a Inicio y Android, y una alarma/instalacion Windows con
   permisos reales. Verificar tambien actualizacion del APK, apertura de
   invitaciones, registro, recuperacion y sesion sincronizada. La emulacion
   WebKit no certifica Safari en un iPhone fisico.
3. **Consentimiento.** El controlador espera un gestor conectado a
   `EstudiemosAdConsent`; no hay un puente real en produccion. La aprobacion
   de Google por si sola no debe iniciar anuncios. Conectar un gestor real y
   comprobar otorgamiento, rechazo, retiro y cambio de cuenta. Para trafico
   personalizado en EEE, Reino Unido y Suiza rige el requisito de CMP
   certificado de Google con TCF. No simular consentimiento en produccion.

## Secuencia de activacion

1. Confirmar en AdSense que el sitio figura Listo y ads.txt Autorizado. No
   reiniciar la revision ni cambiar el identificador durante la espera.
2. Cerrar los pendientes de Drive, dispositivos y consentimiento. Mantener
   el APK WebView sin anuncios y revisar privacidad y audiencia escolar.
3. Validar el ancla real con trafico limitado y consentimiento, sin hacer
   clic en anuncios propios. Revisar teclado, navegacion inferior,
   calendario, cambio a Pro, CSP y saltos de layout. Mantener las demas
   ubicaciones automaticas desactivadas.
4. Ante una regresion, deshabilitar la carga publicitaria con el flag
   independiente de `shared/release.js` y volver a verificar. No reducir
   protecciones para conseguir que aparezca un anuncio.

Referencias oficiales:
- https://support.google.com/adsense/answer/12170222
- https://support.google.com/adsense/answer/13554116
