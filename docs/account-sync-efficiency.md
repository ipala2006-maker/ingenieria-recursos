# Sincronizacion de menor consumo

## Cambios

- Inicio, cambios locales y comprobaciones manuales conservan el flujo de lectura,
  mezcla y guardado por cuenta. RLS sigue protegiendo `user_states`.
- Las consultas posteriores filtran por `user_id` y por una revision `updated_at`
  diferente de la ultima confirmada. Si no cambio, Supabase no devuelve `state`.
- Para guardar una edicion propia se comprueba esa misma revision. Si sigue
  vigente, se mezcla contra la copia confirmada en memoria, sin descargarla otra
  vez. Si hubo un cambio remoto, se recibe y mezcla antes de guardar.
- Realtime transporta solo un aviso de revision, nunca tareas ni credenciales.
  Un aviso inicia una comprobacion inmediata; no espera al sondeo de respaldo.
- Respaldo visible: cada 2 minutos con Realtime conectado; cada 30 segundos si
  no esta disponible. En segundo plano, cada 5 minutos. Al volver a la app,
  recuperar conexion o reconectar Realtime se comprueba sin esa espera.
- Los widgets web comparten el limite de comprobaciones de su cliente de cuenta.
  No se altera el renderizado local ni el reloj del Pomodoro.
- Las ediciones rapidas se agrupan durante 600 ms. Play, pausa y controles de
  Pomodoro mantienen prioridad inmediata. Los contadores no publican por segundo.
- Sin red no se hacen consultas. Los errores espaciados reintentan desde 30
  segundos hasta 5 minutos; Sincronizar ahora permite un intento explicito.
- Una comprobacion previa a un recordatorio de racha evita el cache temporal
  de widgets. Sigue verificando el progreso remoto antes de interrumpir.
- Se conservan las ediciones hechas durante una subida y se impide aplicar una
  respuesta de una sesion que ya se cerro, incluso al volver a la misma cuenta.

No se agregan migraciones, permisos, servicios, pagos ni credenciales. Los
clientes antiguos siguen siendo compatibles. No se modifica el sistema de
alarmas nativas ni el trabajo de sincronizacion nativo de Android.

## Medicion para Ian

En **Cuenta > Consumo de sincronizacion** se ven el tamano del perfil recibido,
los bytes JSON recibidos hoy y en los ultimos 31 dias, las comprobaciones sin
cambios y las descargas completas. **Exportar medicion** descarga esos contadores.
Tambien se puede consultar `EstudiemosAccount.getSyncUsage()` en desarrollo.

La medicion queda solamente en ese navegador/perfil y cuenta, con hasta 31 dias.
No se sincroniza, no sale a analitica, no incluye textos, correos, nombres de
archivos, identificadores de cuenta, tokens ni contrasenas. No sumar como si fueran
usuarios distintos varios dispositivos de una misma persona.

Son tamanos JSON aproximados, no una factura ni todo el consumo de Supabase:
no incluyen compresion, cabeceras, autenticacion, heartbeats de Realtime, otras
consultas, alarmas, sincronizacion nativa Android/Windows o trafico de Google.
Para el total facturable, contrastar con Usage > Egress en Supabase.

Para estimar un usuario completo, reunir al menos 2-3 dias completos de uso
normal, exportando en cada dispositivo/perfil. Sumar el trafico de esos dias,
dividir por los dias observados y multiplicar por 30. Reservar margen para
servicios no medidos y picos; no extrapolar un primer dia aun incompleto.

La capacidad gratuita aproximada por trafico seria `presupuesto mensual /
trafico mensual por usuario`, pero tambien limita la base de datos, la CPU y
las 200 conexiones simultaneas de Realtime (dispositivos, no usuarios totales).
No se garantiza una cantidad de usuarios a partir de un benchmark.

## Verificacion

- `node --test tests/account-sync-efficiency.test.js tests/study-reminders.test.js`
- `node tests/pomodoro-device-sync.smoke.cjs`
- Casos de sesion quieta, 300 notas y 60 ediciones alternando dos dispositivos,
  avisos perdidos, reconexion, consultas duplicadas de widgets, modo sin red,
  reintentos, mezclas, cambios durante una subida y aislamiento entre cuentas.
- La prueba con dos dispositivos usa datos y red simulados. Sus resultados
  representan solo JSON de sincronizacion, no el uso real de Ian ni su factura.

Referencias oficiales: [filtro neq](https://supabase.com/docs/reference/javascript/neq),
[Realtime](https://supabase.com/docs/guides/realtime/broadcast),
[cuotas](https://supabase.com/pricing).
