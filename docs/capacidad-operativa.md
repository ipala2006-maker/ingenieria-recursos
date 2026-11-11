# Capacidad gratuita de Estudiemos

Las cifras son de planificación, no límites de registro ni una prueba de carga real. Medir después de cada convocatoria y actualizar el modelo antes de contratar recursos.

## Qué se optimizó

- Cátedras parte de los índices de titularidad y membresía. Reutiliza el conjunto visible y conserva la revisión, los permisos y el protocolo. Ejecutar `node tests/classroom-scope.bench.cjs` para comparar el plan original y el nuevo con las mismas 12.000 cátedras ficticias. El usuario de la prueba tiene cinco; el primer paso de lectura examinó 12.000 filas antes y siete después, con el mismo resultado. No es una medición de egreso.
- Una confirmación de sincronización sin cambios ya no reconstruye ni vuelve a serializar el perfil completo. El chequeo periódico también consolida sus contadores locales en una sola escritura. No se cambiaron tiempos, Realtime, el tratamiento de conflictos ni la programación de alarmas.
- Las descargas de materiales siguen en Drive. La cola de alarmas sigue indexada y solo llama al Worker cuando hay trabajo. No se cambian retención, correo, Ads ni Drive para ganar capacidad.

## Estimación de activos mensuales

Reproducir con `node tests/sync-capacity.bench.cjs` (JSON de cuenta) y `node tests/notification-capacity.bench.cjs` (destinos Android y alarmas). El JSON simulado para cuenta está en torno a 6,65 MB/mes en dos dispositivos intensivos, 2,28 MB en dos habituales y 0,95 MB en uno. No incluye todos los encabezados, Cátedras, Auth, respaldos ni el efecto de usuarios que entran a la vez.

Presupuesto orientativo: 3,5 de 5 GB de egreso para cuentas activas, reservando 1,5 GB para los demás servicios y variación; hasta 140 de 200 conexiones Realtime simultáneas para planificar con margen.

| Escenario | MB/activo/mes presupuestados | Conexiones por activo mensual en hora pico (supuesto) | Activos estimados |
| --- | ---: | ---: | ---: |
| Intensivo | 8–10 | 0,40–0,55 | 250–350 |
| Habitual | 3,2–4,0 | 0,14–0,18 | 780–1.000 |
| Reducido | 1,4–1,9 | 0,04–0,06 | 1.800–2.500 |

Se toma el menor resultado de `3.500 MB / MB mensuales por activo` y `140 / conexiones pico por activo mensual` en cada extremo, redondeado. Realtime puede limitar picos de inicio o sincronización con varios dispositivos, antes que el egreso mensual. Con hábitos dispersos, el egreso es más probable como tope. Medir también bytes reales de PostgreSQL, egress, error/CPU del Worker y cola de alarmas; el crecimiento de historial, widgets o captación puede bajar la estimación. Brevo Free tiene un presupuesto diario separado para altas y recuperaciones.

Antes de pagar: distribuir convocatorias, observar conexiones y egress reales, investigar consultas de logs con ventanas cortas y revisar frecuencia/retención de procesos solo si hay mediciones y sin perder recuperación ni fiabilidad. [Supabase Free](https://supabase.com/pricing) · [Límites Realtime](https://supabase.com/docs/guides/realtime/limits) · [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).
