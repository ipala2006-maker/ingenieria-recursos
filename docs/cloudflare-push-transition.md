# Cloudflare: paso 1, despachador de alarmas

Continuacion y estado de la migracion: [hosting HTTP y validacion real](cloudflare-hosting-migration.md).
El perfil inicial de cuatro se conserva para comparacion; el candidato posterior
usa `cloudflare-free-single` tras detectar picos de CPU en Workers real.

Fecha: 28 de octubre de 2026. No cambia el proveedor de datos, Auth, dominio,
suscripciones push, claves VAPID, callbacks, instaladores ni cron de produccion.
No contrata servicios. El cambio se prepara en una rama y un PR.

## Perfiles separados

El motor `api/_lib/push-dispatch.js` no importa Node, Vercel, variables de entorno
ni credenciales. Recibe un perfil explicito y dos transportes: `rpc(name, body)`
y `send(job)`. Cada operacion de transporte debe realizar como maximo una
solicitud de red: sin reintentos ni seguimiento automatico de redirecciones.
El adaptador actual sigue en `api/_lib/mobile-push.js`, con el perfil Vercel.

| Limite | Vercel actual | Candidato Workers Free |
| --- | --- | --- |
| Reserva SQL por lote | 20 | 4 |
| Envios simultaneos por ejecucion | 10 | 2 |
| Avisos maximos por ejecucion | 100 | 4 |
| Subpeticiones logicas por ejecucion llena | 110 | 6 |
| Presupuesto interno de subpeticiones | 160 | 40 |
| Fallback al RPC antiguo de cinco avisos | Si | No |

En Vercel, 100 avisos requieren cinco reservas y cinco confirmaciones en lugar
de una de cada una: aumenta el numero de RPC pequenas de 2 a 10. Es un coste
del lote acotado, no un supuesto ahorro de trafico. No se relee la agenda ni se
envia el perfil entero. Una cola pequena mantiene una reserva y una confirmacion.
El cron actual conserva hasta cuatro despachadores: 4 x 100 = 400 avisos/tick
como capacidad nominal con red saludable, no una garantia de puntualidad.

El perfil de Workers solo reserva cuatro trabajos y deja el resto disponible:
no pide cien para luego recortarlos. Reserva + cuatro envios + confirmacion son
seis subpeticiones. Su presupuesto interno de 40 deja margen hasta el limite
actual de 50, pero el futuro adaptador tambien debe contabilizar sus operaciones.
No usar el adaptador Node/Vercel como entrada Workers: el futuro adaptador debe
seleccionar explicitamente `cloudflare-free` y usar transportes compatibles.

## Conservacion de la cola

- Se utiliza el parametro `p_limit` del RPC existente `claim_mobile_push_batch`.
  No hace falta migrar tablas, funciones, permisos ni Auth para este paso.
- SQL conserva `SKIP LOCKED`, leases, reintentos, recurrencias, antelacion de
  30 segundos y exclusiones por tarea completada o borrada.
- Se confirma cada lote antes de reservar otro. Si falla la confirmacion, se
  detiene la ejecucion y los leases conservan la recuperacion existente.
- Una respuesta SQL sobredimensionada, repetida o invalida falla sin enviar ni
  recortar silenciosamente trabajos. El perfil Workers no cae al camino viejo.
- Los 404/410 del proveedor invalidan suscripciones como antes; los otros
  fallos conservan el reintento de SQL. No se reintenta el envio en JavaScript.
- Vercel deja de reservar nuevos lotes al acercarse a su limite de tiempo.
  Es una reserva conservadora de tiempo, no un timeout absoluto de red.
- Las etiquetas de las notificaciones no cambian. Un envio aceptado cuyo ACK
  se pierde puede reintentarse: entrega al menos una vez, no exactly-once.
  No se promete eliminar duplicados de transporte ante fallos de confirmacion.

El perfil antiguo queda disponible solo para el fallback Vercel de cinco
trabajos. Sus confirmaciones independientes se esperan juntas y cualquier
fallo impide reservar mas. La autenticacion del cron y la validacion de destinos
HTTPS Apple/Google/Mozilla siguen en el adaptador, antes de usar el motor.

## Medicion y pruebas

```powershell
node --test tests/push-dispatch.test.js tests/mobile-push-indexed.test.cjs
npm run test:mobile
node scripts/benchmark-push-budget.cjs
```

El benchmark genera claves ficticias solo en memoria y prepara solicitudes
cifradas con la version bloqueada de `web-push`. No envia notificaciones ni
imprime claves, suscripciones reales, titulos personales o endpoints reales.
Mide CPU media agregada y tiempo de pared en Node. No presenta percentiles de
CPU por lote: en Windows esos contadores pueden ser demasiado gruesos.

**Esto no certifica los 10 ms de CPU de Cloudflare.** La medida local omite
arranque del Worker, adaptador HTTP, peticiones SQL y procesado de respuestas.
Antes de mover trafico, medir en Workers con su runtime y registrar CPU de
invocacion completa en frio/caliente, maximo/p95, subpeticiones y errores 1102.
La espera de red no equivale a CPU. Si cuatro avisos exceden el presupuesto,
reducir el lote o elegir otro ejecutor gratuito tras evaluarlo; no ocultar
fallos, desactivar alarmas ni habilitar un plan pago automaticamente.

## Puertas de la siguiente etapa

1. Crear un adaptador Workers aislado que preserve autorizacion, respuestas y
   secretos del servidor. Validar Node/HTTPS o un transporte alternativo oficial.
2. Probar Workers con datos ficticios y una cola aislada. Nada de doble despacho
   ni secretos de produccion durante las pruebas de compatibilidad.
3. Coordinar el fan-out del cron antes de activar Workers. El cron vigente
   calcula cuatro llamadas para lotes de cien: con cuatro avisos cada una solo
   entregaria 16/tick. No cambiar unicamente la URL o el perfil. Mantener el
   presupuesto de capacidad, limite diario de solicitudes y puntualidad medidos.
4. Preparar dominios, callbacks y transicion de dispositivos en un PR posterior.
   Un cambio de origen no conserva automaticamente almacenamiento local, sesion
   de navegador, permisos, instalacion PWA o suscripcion de notificaciones.
5. Probar registro, invitaciones, notas, sincronizacion, alarmas y rollback antes
   del corte. Conservar Vercel operativo mientras se valida el candidato.

Fuentes oficiales:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://github.com/web-push-libs/web-push
