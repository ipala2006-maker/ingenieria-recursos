# Capacidad gratuita: modelo, no promesa

Fecha: 28 de octubre de 2026. Cloudflare Workers Free + Supabase Free + Drive.
El cambio de hosting aun no esta cortado a produccion. No se hizo una prueba
de carga con 1.000 personas reales ni se garantiza esa concurrencia.

## Limites que no desaparecen

Workers: 100.000 invocaciones diarias por cuenta, 10 ms CPU por peticion Free,
50 subpeticiones y seis conexiones salientes simultaneas. Estatica atendida
directamente desde Assets no consume esas invocaciones. Las rutas API y las
invitaciones si las consumen. La CDN no vuelve ilimitado a Postgres/Auth.

Supabase: 500 MB DB, 5 GB egress no cacheado, 5 GB cacheado por separado,
50.000 Auth MAU, 200 conexiones Realtime simultaneas y CPU/RAM compartidas.
No sumar los dos egress como 10 GB libres para consultas REST. Backups tambien
exportan bytes; historial, indices y metadatos tambien ocupan DB. Drive evita
alojar PDFs nuevos, no elimina el coste de Auth/sync/catedras/notificaciones.

## Tres escenarios DAU

Ejercicio de sensibilidad, NO proyeccion observada de usuarios. Se reservan
1 GB/mes de egress para backups/operacion y luego 30% de margen: 2,8 GB/mes
para usuarios. En Workers se reservan 20.000 llamadas/dia para cron, invitados,
reintentos y operacion. Las cifras incluyen todos los dispositivos de un DAU.

| Escenario | Egress supuesto por DAU/dia | API Workers por DAU/dia | DAU por egress | DAU por Workers | Menor limite, redondeado |
| --- | --- | --- | --- | --- | --- |
| Pesimista | 1.000 KB | 150 | 93 | 533 | 90 DAU |
| Realista de planificacion | 250 KB | 60 | 373 | 1.333 | 370 DAU |
| Optimista | 100 KB | 20 | 933 | 4.000 | 930 DAU |

Formulas, GB/KB decimales:

```text
DAU_por_egress = floor(2.800.000.000 / (30 * bytes_por_DAU_dia))
DAU_por_Workers = floor(80.000 / peticiones_por_DAU_dia)
```

Estos valores son presupuestos condicionales, no techos certificados ni un
diagnostico del consumo actual. Reemplazar las hipotesis con 7-14 dias de la
cohorte. Si el backup supera 1 GB/mes, recalcular; un dump diario de 43 MB ya
seria aproximadamente 1,29 GB/mes antes de considerar otros consumos.

1.000 MAU no equivale a 1.000 DAU. Si DAU/MAU fuese 30%, 1.000-1.500 MAU
serian 300-450 DAU: el extremo inferior puede encajar en el modelo medio; el
superior necesita menos bytes por dia, menos backup o mayor cuota. No se puede
confirmar 1.500 MAU como "seguro" solo por mover Vercel. El limite real puede
ser DB, CPU compartida, Realtime, envios de correo o rafagas antes del egress.

## Picos, alarmas y retencion

El cron actual procesa hasta 400 avisos/tick. Ni 1.000 avisos a la misma hora
ni 1.000 clientes conectados se deducen del presupuesto mensual. Se preparo el
fan-out acorde a un aviso por invocacion, pero falta validar pg_net/DB y cola bajo ese pico.
Mas invocaciones cortas reduce CPU por invocacion, pero aumenta reservas/ACKs
y trafico PostgREST por aviso; no presentarlo como ahorro neto de bytes.

La puntualidad depende de cron, leases, red, proveedor y restricciones del SO.
Los 30 segundos de adelanto no eliminan todos esos retrasos. Windows local
sigue funcionando con su agenda descargada; una nueva alarma del telefono
necesita sincronizarse en la PC al reabrir/enfocar. No se reintrodujo polling.

Objetivos internos de piloto, no SLA contractual: vigilar CPU p99 con margen
bajo 10 ms, 1102, HTTP 5xx, cola vencida, latencia Auth/sync y conexiones Realtime.
Medir latencia servidor-proveedor y recepcion en el equipo por separado.
Dos dispositivos por alumno pueden duplicar conexiones; no prometer 200 alumnos
simultaneos si cada uno abre dos clientes. Limitar sesiones de prueba concurrentes
y escalar 20, 50, 100 antes de anunciar capacidad mayor.

Alarmas fiables pueden ayudar al habito, pero no se atribuye una mejora de
retencion sin datos. Medir activacion (unirse a catedra/crear tarea), D1/D7/D30,
fallos de entrega y abandono por cohorte, con telemetria minima y agregada.

## Otros riesgos

- Registro: verificar cuotas y entregabilidad SMTP, no solo MAU de Supabase.
- Drive: permisos del propietario, revocaciones y limites de descarga/API;
  un acceso directo no es copia ni respaldo independiente.
- OAuth/cambio de dominio: puede exigir revision de Google y nuevos permisos PWA.
- Entrega al menos una vez: ACK perdido puede repetir transporte; tags estables
  ayudan en UI, no son una garantia exactly-once.
- No existe una garantia propia de disponibilidad por usar servicios Free.
  Mantener rollback y copias, sin activar facturacion automatica.

Recomendacion: cerrar secretos, CPU real y corte de origen; luego usar la
cohorte escalonada para ajustar el modelo. El objetivo de 1.000-1.500 MAU
es plausible con uso moderado, pero no es aun una capacidad comprobada.

Fuentes: [Cloudflare limites](https://developers.cloudflare.com/workers/platform/limits/),
[Cloudflare estaticos](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[CPU y metricas](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
[Supabase precios/cuotas](https://supabase.com/pricing).
