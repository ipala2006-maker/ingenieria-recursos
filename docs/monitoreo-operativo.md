# Monitoreo operativo de Estudiemos

No sustituye las pruebas de usuario ni los paneles de consumo. No requiere un servicio nuevo, no recopila datos personales y no realiza escrituras en Supabase.

## Activar después de revisar

1. GitHub → Settings → Secrets and variables → Actions → Variables: crear `ESTUDIEMOS_MONITOR_ENABLED=true`. El workflow solo corre desde la rama predeterminada y con esa variable habilitada.
2. En Actions → **Estudiemos production watch**, ejecutar manualmente en `main`. Las siguientes ejecuciones están programadas cada seis horas y pueden retrasarse. Revisar que las notificaciones de fallos de Actions estén habilitadas.
3. Opcional: agregar `CF_ANALYTICS_READ_TOKEN` como Secret de Actions, con **Analytics Read** solo en la cuenta que aloja Estudiemos. Sin este secreto, el monitor sigue comprobando las rutas y respaldos; leer cuotas y latencia en Cloudflare.

Las sondas comprueban Inicio, configuración de Auth/Turnstile y disponibilidad declarada de Web Push; se repiten una sola vez ante fallo. No hacen registro, login, sincronización o envíos reales. El workflow revisa metadatos de un artefacto vigente con menos de 40 horas, sin descargarlo ni descifrarlo.

Presupuesto: cuatro rondas significan **12 GET públicos por día**, hasta 24 si todos fallan y se reintentan. Auth y Web Push usan el limitador existente y solo Web Push consulta su disponibilidad: normalmente 12 RPC pequeñas en Supabase al día, sin sondear tablas de estudiantes ni escanear logs. La consulta opcional de Analytics es una petición a Cloudflare por ronda, no a Supabase.

Con Analytics, se evalúan métricas agregadas de 24 horas: solicitudes de la cuenta, errores de ejecución de las APIs, latencia p99, CPU p99 y cortes por límite de CPU. El log público muestra estados y alertas, no cifras exactas. Para las cifras, consultar el panel o ejecutar `node scripts/production-watch.cjs` localmente con las credenciales de lectura disponibles en el entorno. Se advierte a partir de 70.000 solicitudes y se alerta a partir de 90.000 en esa ventana móvil. Contrastar con el día UTC del panel antes de concluir que se alcanzó una cuota. Los errores de ejecución no representan todos los HTTP 5xx. [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/).

## Mientras aumenta el tráfico

- Revisar periódicamente transferencia, tamaño, Storage y uso de logs en Supabase; rebotes y cuota diaria en Brevo; y cola/latencia de alarmas con [consultas agregadas](../supabase/pilot-metrics.sql). No automatizar consultas al Logs Explorer. [Uso de Logs Query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query).
- Tras una convocatoria, completar una ronda con cuentas de prueba autorizadas: alta y confirmación, enlace de cátedra y cambio de calendario entre dos dispositivos. El monitor no detecta por sí solo un fallo en esos flujos.
- Investigar al proyectar 70% de una cuota o ver latencia sostenida por encima de la habitual. Preparar mitigación antes del 90%. No establecer un cupo artificial de usuarios ni contratar recursos automáticamente.
- Pausar la captación ante pérdida/cruce de datos, fallos repetidos de registro o cátedras, 429/5xx sostenidos, cola de alarmas creciente o una cuota operativa sin margen. Una falla aislada de la sonda requiere comprobar primero el panel y repetir una prueba controlada.
- Ensayar [la restauración](database-backups.md) en una base aislada y proteger las claves fuera de GitHub. El éxito del respaldo y el resultado del monitor no certifican la recuperación.
