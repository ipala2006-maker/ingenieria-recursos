# Capacidad gratuita y presupuesto de sincronizacion

Fecha: 25 de octubre de 2026. Objetivo: al menos 1.000 usuarios activos por mes.
Estado: mejora de sincronizacion; **no es una certificacion de capacidad total**.

## Que mide esta mejora

`node tests/sync-capacity.bench.cjs` ejecuta el cliente real con la funcion SQL
real en PGlite, bajo el rol `authenticated` y RLS. Compara el transporte previo
(lectura antes de guardar, versiones completas y listas completas) con el nuevo,
con los mismos datos, intervalos y operaciones. No consulta cuentas reales.

Escenarios: 300 notas acumuladas, una hora diaria de estudio, 8 ediciones de
notas por dia, dos horas extra con la app quieta y 20 dias activos al mes.
En dos dispositivos ambos estan abiertos, alternan las ediciones y reciben los
cambios del otro. Es mas exigente que tener el celular cerrado mientras se usa PC.

| Escenario | Recibido antes/dia | Despues/dia | Reduccion | Despues/mes |
| --- | ---: | ---: | ---: | ---: |
| Un dispositivo | 194,6 KB | 47,3 KB | 75,7% | 0,95 MB |
| Dos dispositivos | 600,8 KB | 114,1 KB | 81,0% | 2,28 MB |
| Intensivo: 600 notas, 120 min, 20 ediciones, 30 dias, dos dispositivos | 1,88 MB | 0,22 MB | 88,2% | 6,64 MB |

Variaciones de unos bytes entre ejecuciones provienen de las fechas de servidor.
En el escenario habitual de dos dispositivos las solicitudes bajan de 318 a
250 por dia, 21,4% menos. Una edicion entre 300 notas pasa de 33.362 a 1.108
bytes JSON en la prueba SQL sin compactar aun el mapa de versiones.

Solo se cuentan cuerpos JSON de sincronizacion de cuenta. No son bytes de
factura: faltan cabeceras, compresion, autenticacion, Realtime, materias, amigos,
notificaciones push, alarmas Windows y sincronizacion nativa Android. No se ha
medido la CPU ni un pico de 1.000 usuarios reales. La carga SQL de comparar una
lista ocurre al editarla, no en cada segundo ni en cada minuto de estudio.

## Estimacion mensual, con margen

Supabase Free incluye 5 GB de egress. Reservando 30% (1,5 GB) para otros servicios,
quedan 3,5 GB para los JSON medidos. Esa division da aproximadamente:

- Un dispositivo habitual: 3.700 usuarios/mes, techo de sincronizacion solamente.
- Dos dispositivos habituales: 1.530 usuarios/mes, techo de sincronizacion solamente.
- Intensivo todos los dias: 526 usuarios/mes, techo de sincronizacion solamente.

Para 1.000 usuarios del segundo escenario son unos 2,28 GB/mes de estos JSON.
Quedan unos 2,72 GB del egress nominal para lo no medido. El margen de 30% es una
reserva de planificacion, no evidencia de que todos esos otros servicios entren.
Por eso 1.000-1.500 es un objetivo plausible de sincronizacion web moderada, no
una promesa de que 1.500 usuarios con todas las funciones entren gratis.

## Limites que siguen pendientes

| Recurso | Incluido en el plan gratuito | Riesgo a comprobar |
| --- | --- | --- |
| Supabase base | 500 MB, no 10 GB | perfiles, indices y datos de clases; medir crecimiento real |
| Supabase archivos | 1 GB | los archivos nuevos de Mi espacio estan en Drive del usuario |
| Supabase Auth | 50.000 activos/mes | no equivale a capacidad de DB, egress o CPU |
| Supabase Realtime | 200 conexiones pico, 2 millones de mensajes/mes | cada dispositivo/pestana abierta puede consumir conexion |
| Vercel Functions | 1 millon de invocaciones/mes | alarmas Windows y sondeo de materias pueden limitar antes |
| Vercel CPU | 4 horas activas/mes | requiere medicion del proveedor con trafico real |
| Vercel Deployment Storage | 10 GB | depende de versiones retenidas, no del numero de estudiantes |

**Bloqueo para prometer 1.000 usuarios con Windows conectado permanentemente:**
el componente de alarmas consulta Vercel una vez por minuto mientras la PC esta
encendida. No se altero este intervalo ni su interrupcion a pantalla completa.
Son 14.400 solicitudes/mes con 8 horas diarias durante 30 dias, por PC. Solo ese
trafico agotaria un millon con unas 69 PCs, antes de otras funciones. Si estuvieran
encendidas 24 horas, el techo baja a unas 23. No sumar esos limites al techo web:
el menor recurso manda. El siguiente trabajo de arquitectura debe resolver esta
entrega sin prolongar alarmas ni desactivar funciones; un simple cache HTTP no
elimina invocaciones al servidor ni garantiza la misma puntualidad.

Materias conserva su comprobacion condicional cada 5 minutos visible y cada
minuto con el panel abierto. Muchos alumnos dejandolo abierto tambien deben
incluirse en Vercel y CPU. No se alargaron intervalos para inflar estos numeros.

## Validacion continua

Antes de afirmar una capacidad total: reunir al menos 3-7 dias completos de
Usage de ambos proveedores y exportaciones de cada dispositivo de Ian. Medir
por separado usuarios web, Android y PCs con alarmas, horas encendidas, clases,
bytes diarios, invocaciones, CPU, conexiones pico y crecimiento de DB. Excluir
despliegues y pruebas de desarrollo del consumo atribuible a un estudiante.

Repetir esta tabla despues de cada optimizacion. Mantener pruebas de regresion
en cada cambio y no aprobarlo solo porque el consumo baja. El benchmark no debe
generar carga en produccion ni recopilar textos, correos o credenciales.

Fuentes oficiales consultadas el 25/10/2026:
[Supabase cuotas](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Vercel limites](https://vercel.com/docs/limits),
[Deployment Storage](https://vercel.com/docs/deployment-storage).
