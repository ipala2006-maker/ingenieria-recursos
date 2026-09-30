# Notificaciones del celular

## Para estudiantes

- Android/Samsung: actualizar Estudiemos sin desinstalar, abrir la campana de una tarea y tocar **Activar notificaciones**. Aceptar notificaciones y, cuando Android lo ofrezca, **Alarmas y recordatorios**. Guardar la fecha, hora y repetición.
- iPhone/iPad: iOS 16.4 o posterior. Safari > Compartir > Agregar a inicio. Abrir ese icono, iniciar sesión y tocar **Activar notificaciones** dentro de la alarma. Llega una prueba real del sistema.
- No hace falta Play Store, App Store, SMS ni una suscripción paga para esta implementación.
- Android conserva la programación aunque se cierre la app o reinicie el teléfono. Forzar detención desde Ajustes, revocar permisos, apagar el teléfono o ciertas restricciones del fabricante pueden impedir los avisos. Sin permiso de alarmas exactas, Android puede retrasarlos.
- iPhone necesita internet. Los avisos pueden demorarse alrededor de un minuto o más si el sistema los retiene. No son alarmas a pantalla completa, no saltan el modo silencio/Concentración ni garantizan volumen.
- El horario es local a cada dispositivo. Completar, borrar o modificar una tarea cancela o cambia su próxima alarma al sincronizar. Los cambios hechos en otro equipo requieren que llegue la sincronización al Android.

## Activación del servidor (una sola vez)

1. Ejecutar `supabase/mobile-notifications.sql` en el proyecto existente.
2. Generar VAPID con la biblioteca `web-push` (`generateVAPIDKeys()`). Guardar `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y un `MOBILE_PUSH_CRON_SECRET` aleatorio de al menos 32 bytes en las variables de producción de Vercel. No poner claves privadas en archivos públicos ni Git.
3. Guardar el mismo secreto de cron en Supabase Vault, nombre `estudiemos_mobile_push_cron`. No incrustarlo en el SQL de un repositorio ni logs.
4. Desplegar la app y ejecutar `supabase/mobile-notifications-cron.sql`. El cron verifica las tareas cada minuto en la base existente y solo llama al servidor cuando hay avisos pendientes.
5. `GET /api/widget-push?mobilePush=1` debe devolver `enabled:true`. Mientras falten claves o un latido reciente del cron, la interfaz **no afirma que está conectada**.
6. Probar con un iPhone real: permitir, recibir la prueba, programar una tarea unos minutos adelante, cerrar la app y comprobar el aviso. El consentimiento del teléfono solo puede darlo su usuario.

No se activa ningún plan pago. Se utilizan recursos y cuotas de los servicios existentes: no es uso ilimitado ni una promesa de costo cero si se cambia de plan. El despliegue inicial limita a 5 navegadores por cuenta, 5 entregas por lote, 3 intentos por aviso y 5000 trabajos diarios. Vigilar cuotas antes de ampliar. Las alarmas nativas Android no necesitan estas llamadas periódicas.

## Seguridad y mantenimiento

- Todas las tablas y funciones están cerradas a `anon` y `authenticated`; el servidor vincula la suscripción exclusivamente al usuario autenticado. Los endpoints se limitan a proveedores Web Push conocidos para evitar SSRF.
- No se entregan claves privadas, notas, archivos ni contraseñas. El service worker comprueba la cuenta destinataria antes de mostrar un título.
- Las entregas vencidas (10 minutos) se descartan; los errores temporales reintentan con una reserva de 2 minutos. Las respuestas 404/410 eliminan la suscripción caducada.
- Los avisos usan un identificador estable para reducir duplicados si el proveedor aceptó el envío pero la respuesta se perdió. La entrega no puede garantizarse exactamente una vez.
- `mobile_push_jobs` conserva estado de intentos y envío durante 2 días, sin copiar títulos. `mobile_push_health` guarda un único latido. Las suscripciones sin renovación vencen a los 90 días.
- Para detener el envío: desactivar el cron `estudiemos-mobile-alarms` en Supabase. No afecta a Windows ni borra tareas.
- Pruebas: `npm ci --ignore-scripts`, `npm run test:mobile`; Android: `gradle :app:testDebugUnitTest :app:assembleDebug`.

## Estado de validación

El código y las pruebas locales no equivalen a una activación de producción. Registrar en el PR qué migraciones, variables, cron, APK y pruebas físicas se verificaron realmente.
