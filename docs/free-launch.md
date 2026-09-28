# Primera Version Gratuita

Mi espacio y Trabajar con la IA aparecen como Proximamente para todos los
usuarios, sin excepcion por cuenta o plan. Inbox, calendario, Pomodoro, racha,
sincronizacion y alarmas manuales continuan disponibles. No se activaron pagos.

## Controles

- `shared/release.js`: decision de disponibilidad compartida por web y API.
- Las tres APIs de IA responden `503 FEATURE_COMING_SOON` antes de consumir
  cuota, autenticar contra servicios externos o llamar al modelo.
- Mi espacio no inicia consultas, subidas ni editores desde la aplicacion.
  Los enlaces directos muestran la misma pantalla Proximamente.
- Los widgets web muestran Proximamente y no consultan workspace_items.
- El APK 1.5.7 muestra Proximamente en el widget nativo y omite su consulta.
  Los APK anteriores necesitan actualizarse para cambiar el widget nativo.
- Los instaladores Windows cargan la web actual; no requieren recompilacion.

## Datos Y Reactivacion

No se borran archivos, carpetas, planes, descuentos ni datos locales. Las
politicas de propiedad existentes de Supabase se conservan; esta pausa de
interfaz no es un sistema de cobro ni una revocacion de acceso a la API de
almacenamiento de clientes anteriores. Antes de ofrecer Mi espacio como
beneficio pago, aplicar y verificar autorizacion de planes en DB/Storage,
ademas de habilitar las banderas. No alcanza con ocultar botones para cobrar.

Para reactivar, coordinar `shared/release.js`, `ReleaseFeatures.java`, los
textos de instalar.html y las pruebas de lanzamiento. Mantener los cobros
deshabilitados hasta implementar/verificar ese flujo con autorizacion de Ian.

## Verificacion

`node --test tests/free-release.test.cjs tests/commercial-launch-hidden.test.cjs`
comprueba la pausa, ausencia de llamadas de IA y preservacion de planes.
Revisar tambien el inicio movil/escritorio, enlaces a Mi espacio, asistente,
campana manual, perfil y widget workspace. Los cambios web se reciben al
recargar; un widget Android instalado usa el codigo del APK hasta actualizar.
