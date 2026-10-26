# Redes universitarias y picos de alarmas

## Cambios de esta rama

| Ruta | Control |
| --- | --- |
| Invitacion HTML `/materia/CODIGO` | 600/min por IP, distribuido |
| Vista publica JSON de invitacion | 600/min por IP, distribuido |
| Acceso previo a autenticar Catedras | 1.000/min por IP, en memoria |
| Catedras autenticadas | 120/min por ID validado, distribuido; 1.000/min por IP en cada instancia |
| Configuracion publica y SDK de arranque | 1.000/min por IP, distribuido |

Los limites privados se vinculan al ID devuelto por Supabase Auth, no al JWT
decodificado, a un mail ni a un header que pueda inventar el cliente. Rotar el
token no reinicia el presupuesto de una cuenta. El guard de IP local no se
presenta como un limite global: varias instancias tienen contadores distintos.
El limite distribuido por usuario sigue aplicando entre instancias; el guard
local y las protecciones DDoS del proveedor completan la defensa de volumen.
Los demas endpoints conservan sus valores anteriores, al igual que CAPTCHA,
confirmacion de correo, RLS y permisos de cada catedra.

Una prueba simula 400 alumnos y dos acciones por alumno desde la misma IP sin
429, y comprueba que el abuso de una cuenta no consume el presupuesto personal
de las otras. Esto no es una prueba de carga de la infraestructura real.

Las consultas publicas al mismo codigo se agrupan en una promesa por instancia
y se cachean diez segundos, con hasta 128 entradas. Una rafaga de 400 lecturas
de la misma invitacion comparte una lectura de presentacion. No se cachean
errores ni los permisos/contactos privados. La tarjeta puede tardar diez
segundos en reflejar un cambio; unirse o editar siempre consulta permisos reales.
No se habilita cache publica de calendarios privados ni se cambia su acceso.

## Jitter sin alterar alarmas

- Comprobaciones de respaldo de cuenta: cada dispositivo elige un pulso local
  de 5 a 10 segundos para revisar si vencio su intervalo de sincronizacion.
  El intervalo de 30/120/300 segundos no aumenta por llamadas al servidor.
  Las escrituras (600 ms de debounce), controles de Pomodoro, verificacion
  explicita y avisos Realtime mantienen su respuesta inmediata.
- Materias: las comprobaciones periodicas tienen 0-10% extra aleatorio (hasta
  6 segundos con panel abierto, hasta 30 con panel cerrado). Abrir, guardar o
  refrescar manualmente no espera ese jitter. Nada hace polling a la hora de
  disparo de una alarma local.
- Web Push: cada trabajador del cron espera 0-750 ms antes de reservar su lote,
  sin modificar `occurrence`, el adelanto de 30 segundos ni las repeticiones.
  La cola mantiene cuatro trabajadores por tick, 100 mensajes por reserva y
  diez envios paralelos por trabajador. El cron salta ticks SQL superpuestos
  mediante advisory lock; las reservas siguen usando SKIP LOCKED y leases.
- Windows conserva la programacion local, sin sondeo periodico al servidor.
  Android ya usa JobScheduler para su respaldo de 15 minutos, no alarmas de red
  exactas alineadas al reloj; no se cambian sus horarios ni permisos.

**No se promete entrega exacta de Web Push.** Un pico de 1.500 envios necesita
cuatro ticks de hasta 400, aparte del proveedor, red y sistema operativo.
El jitter reduce simultaneidad, no crea capacidad. `notification-capacity.bench.cjs`
comprueba drenaje, limites, ausencia de scans de agenda y de HTTP en reposo.

## Supabase Auth y firewall: limites independientes

Los cambios en Vercel no cambian los limites de Supabase Auth. Su documentacion
publica indica buckets por IP que permiten rafagas de hasta 30 operaciones y
limites configurables para altas, recuperacion, verificacion y refresh. Ademas
existe una cuota de correos por proyecto; Brevo tiene su propio presupuesto.
No se leen ni modifican aqui las opciones reales de Auth o las reglas del
firewall porque requieren acceso al panel del proveedor.

Antes de una convocatoria de todo un curso, revisar Authentication > Rate Limits
en el proyecto real, comprobar los 429 y hacer una prueba gradual desde su Wi-Fi.
Mantener CAPTCHA, no falsificar IPs ni proxyar Auth con una service key para
evadir limites. No subir indiscriminadamente los limites de recuperacion/OTP.
Si las cuotas no alcanzan, escalonar el alta de alumnos y las invitaciones.
Las reglas WAF propias del proyecto se inspeccionan aparte; no se desactivan
las defensas del proveedor ni se agrega un bypass a toda una universidad.

Fuentes: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Vercel Firewall](https://vercel.com/docs/vercel-firewall).
