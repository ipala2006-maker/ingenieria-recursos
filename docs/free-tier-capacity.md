# Capacidad gratuita y presupuesto de sincronizacion

Fecha: 26 de octubre de 2026. Objetivo: 1.000-1.500 usuarios activos por mes.
Estado: mejora de sincronizacion; **no es una certificacion de capacidad total**.

## Revision de rutas auxiliares del piloto

`node tests/notification-capacity.bench.cjs` incluye el notificador web real,
la RPC nativa real y una cola efimera de 1.500 destinos. No usa produccion.
Los siguientes JSON corresponden a las rutas medidas, no a toda la factura:

| Perfil modelado | Cuenta + tokens + lectura nativa / mes | Invocaciones widget-push / mes | Techo aritmetico de estas rutas con 3,5 GB |
| --- | ---: | ---: | ---: |
| Completo, dos navegadores sin Android vinculado | 2,28 MB | 0 | 1.533 |
| Completo, PC y Android nativo alternados | 3,64 MB | 680 | 960 |
| Completo, solo Android nativo | 1,98 MB | 0 | 1.770 |
| Dos navegadores y Android receptor adicional | 3,95 MB | 1.360 | 886 |
| Intensivo, dos navegadores sin Android | 6,65 MB | 0 | 526 |

Completo: 300 notas, 60 minutos y 8 ediciones al dia, 20 dias activos/mes. La
lectura nativa agrega 96 chequeos de reserva en cada dia modelado; no incluye
los otros dias del mes, renovacion de Auth, Drive, clases, Realtime, cabeceras,
compresion ni CPU. Son cuerpos JSON de una simulacion reproducible. La cuenta
Android debe actualizar su APK a 1.6.8 y tener la RPC activa para obtenerlo.

La lectura nativa PC+Android baja aproximadamente de 86,6 a 1,30 MB/mes en el
modelo (98,5% menos para ese componente). La ruta de tokens pasa de leer todo
el perfil a unas decenas de bytes por llamada. Sin Android no hay invocaciones;
un Android no se envia push a si mismo, porque sus widgets reciben datos locales.
No se ralentizaron los intervalos para conseguir este ahorro.

La cola nueva usa el indice de proxima ocurrencia y cero barridos JSON por tick.
La prueba de 1.500 destinos consume todos en cuatro ticks, con entregas ficticias,
frente al limite anterior de 5 claims por minuto. Los proveedores reales pueden
retener o fallar avisos: no es una promesa de 1.500 entregas instantaneas.

**Dictamen actualizado:** 1.000 MAU sigue siendo una meta razonable para validar
con una mezcla de uso, no un piso asegurado. 1.500 no es un techo seguro demostrado.
Por ejemplo, 1.000 usuarios PC+Android de este modelo consumen 3,64 GB solo en
estas rutas. Y 1.000 receptores del tercer dispositivo generarian 1,36 millones
de invocaciones solo de widgets, mas que Hobby. La mezcla de dispositivos,
intensidad, conexiones y consumo real del piloto determina la capacidad.

El [protocolo del piloto](pilot-notifications.md) fija despliegue, pruebas fisicas
y presupuestos de salida; el [informe SMTP](pilot-smtp.md) cubre el alta sin pagos.
No convertir la division de una cuota en una garantia de estabilidad ni omitir
las rutas nativas del proximo calculo. Las secciones siguientes describen el
benchmark de cuenta original, no reemplazan este presupuesto combinado.

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

## Mejora local y catedras (26/10)

Windows 2.0 elimina el sondeo del servidor de Inbox y racha. La tarea comprueba
solo disco y reloj locales: **0 llamadas periodicas al servidor por esas alarmas**.
Antes eran 14.400/mes por PC encendida 8 horas diarias durante 30 dias. A 1.000
PCs equivalia a 14,4 millones. El ahorro requiere actualizar el complemento,
desactivar el puente oculto antiguo y conectar el archivo local. No reduce a cero
la sincronizacion de la app ni de widgets visibles. La pantalla completa sigue;
una alarma nueva desde el celular requiere abrir/sincronizar esa PC.

`node tests/classroom-capacity.bench.cjs` compara el SQL anterior y el nuevo con
los mismos 39 chequeos, cinco materias y 100 fechas: 914.572 -> 128.034 bytes JSON,
**86,0% menos**, con igualdad del calendario comprobada en cada paso. Incluye
8 materiales, 5 inscripciones y 5 reprogramaciones, ademas de lecturas quietas.
Son datos sinteticos, no el consumo diario de Ian. Los deltas son por catedra,
no por fila. El historial guarda 30 cambios por catedra y no se descarga en cada
chequeo. Los PDFs permanecen en Drive de cada publicador/alumno.

Las lecturas privadas de catedras usan Supabase con la sesion del usuario y la
funcion `classroom_read`, que liga la identidad a Auth y no permite mutaciones.
No pasan por Vercel ni vuelven a consultar /auth/v1/user en cada chequeo.
Escrituras, invitaciones publicas y otros servicios siguen usando Vercel. Clientes
viejos o un servidor sin la migracion conservan la ruta anterior durante el
despliegue; ese ahorro no existe hasta actualizar ambas partes.

Materias conserva su comprobacion condicional cada 5 minutos visible y cada
minuto con el panel abierto. Sigue consumiendo Supabase, aunque no Vercel para
usuarios con la migracion. No se alargaron intervalos para inflar estos numeros.

## Escenarios de planificacion, no capacidad garantizada

Con un presupuesto de 3,5 GB/mes para el conjunto de trafico de usuario y 1,5 GB
de reserva, los siguientes consumos **supuestos** dan estos techos por egress:

| Perfil | Presupuesto supuesto total/MAU/mes | Techo aritmetico |
| --- | ---: | ---: |
| Pesimista: dos dispositivos intensivos, muchas clases/widgets | 8-12 MB | 290-437 |
| Realista a validar: uso moderado y mezcla de dispositivos | 3-4 MB | 875-1.166 |
| Optimista: principalmente un dispositivo y pocas reprogramaciones | 1,4-2 MB | 1.750-2.500 |

Son presupuestos para medir, no resultados de una prueba de carga ni todos
usuarios simultaneos. El escenario intensivo medido de cuenta sola ya consume
6,64 MB/mes y no permite prometer 1.500 usuarios con ese mismo uso. Para 1.000
MAU el total promedio deberia quedar bajo 3,5 MB/mes; para 1.500, bajo 2,33 MB,
con esta reserva. El promedio se mide por todos los dias y dispositivos, no por
el peso de una sola respuesta. Si CPU, DB, Realtime o correo se agotan antes,
manda ese limite. No se debe vender la cifra de 1.500 como capacidad asegurada.

**Condicion del hosting:** Vercel Hobby permite uso personal no comercial.
Un piloto sin cobros de un producto que planea vender suscripciones no queda
automaticamente autorizado por ser gratuito. Consultar con Vercel la elegibilidad
antes de lanzar al publico; no activar Pro ni facturacion sin autorizacion.
Supabase Free no exige pagar por alcanzar una cantidad concreta de alumnos:
hay cuotas tecnicas, y una superacion puede restringir el servicio. Mantener
ambas cuentas en Free/Hobby no equivale a una garantia de disponibilidad gratis.

Antes del piloto tambien comprobar SMTP: el emisor predeterminado de Supabase
no es un servicio de alta masiva (solo destinatarios autorizados del equipo y
limites estrictos). Un link no puede inscribir a un usuario sin cuenta confirmada;
la invitacion debe conservarse durante registro/confirmacion. Configurar un
emisor apropiado dentro de sus cuotas gratuitas o corregir ese cuello de botella
antes de compartir con cursos completos. Conservar backups propios de la base.

## Validacion continua

Antes de afirmar una capacidad total: reunir al menos 3-7 dias completos de
Usage de ambos proveedores y exportaciones de cada dispositivo de Ian. Medir
por separado usuarios web, Android y PCs con alarmas, horas encendidas, clases,
bytes diarios, invocaciones, CPU, conexiones pico y crecimiento de DB. Excluir
despliegues y pruebas de desarrollo del consumo atribuible a un estudiante.

Repetir esta tabla despues de cada optimizacion. Mantener pruebas de regresion
en cada cambio y no aprobarlo solo porque el consumo baja. El benchmark no debe
generar carga en produccion ni recopilar textos, correos o credenciales.

Fuentes oficiales consultadas el 26/10/2026:
[Supabase cuotas](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Supabase Realtime](https://supabase.com/docs/guides/realtime/limits),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Vercel uso permitido](https://vercel.com/docs/limits/fair-use-guidelines),
[Deployment Storage](https://vercel.com/docs/deployment-storage).
