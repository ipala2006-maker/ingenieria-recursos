# Estudiemos: estado de la migracion a Cloudflare

Actualizacion posterior: se decidio retirar la convivencia del origen viejo.
El plan y su estado de aplicacion estan en `docs/cloudflare-only-cutover.md`;
este informe conserva la fotografia anterior al corte.

Fecha del informe: 30 de octubre de 2026. Incluye comprobaciones del 29 y 30.

## Conclusion

El sitio principal, sus APIs y las descargas nuevas estan en Cloudflare:
https://estudiemos.estudiemos-services.workers.dev/.
Supabase conserva la misma base, cuentas y permisos. Drive conserva sus conexiones.
No se activo ningun plan pago ni se borraron archivos de usuarios.

Esto NO equivale todavia a poder eliminar Vercel. Permanece como compatibilidad
para los PWAs y las notificaciones registrados en su origen anterior. Tampoco
equivale a certificar 1.500 usuarios mediante una prueba de carga: esa prueba
no se hizo. Los pendientes concretos se detallan abajo, sin marcarlos como aprobados.

## Componentes y estado

| Componente | Estado comprobado | Limite o pendiente |
| --- | --- | --- |
| Web y assets | Publicados en el origen estable de Cloudflare | API dinamica no tiene cuota ilimitada |
| APIs | Adaptador HTTP de Workers y secretos privados activos | Conservar el adaptador legado durante coexistencia |
| Supabase Auth | Site URL nuevo y ambos retornos autorizados | Sesiones y almacenamiento del navegador son por origen |
| CAPTCHA | Turnstile configurado; login sin CAPTCHA rechazado | No se omiten comprobaciones de seguridad |
| Google Drive | Conexion existente v2 recuperada y carpetas reales visibles | Conexion abierta a todos no certificada; config anonima devuelve enabled=false |
| Catedras | Invitacion real y Open Graph correctos, sin correo privado en preview | No se borraron ni editaron materias reales para probar |
| Movil web push | Cron y claves de ambos origenes activos | Recepcion confirmada por Ian, pero no atribuida al origen nuevo |
| Windows | Instalador 2.1 actualizado en esta PC, vinculacion local completada | Falta confirmar permiso de archivo en el navegador nuevo |
| Android | APK firmado 1.7.0 publicado, misma identidad | Actualizacion fisica de cada dispositivo no verificada |
| Registro y monitoreo Google Sheets | Misma integracion movida a Cloudflare y ejecutada con exito | El campo version del monitor legado puede indicar unknown fuera de Vercel |
| Respaldos | Exportacion cifrada y restauracion real aislada aprobadas | El dump no contiene los bytes de los objetos historicos de Storage |
| Free/Pro | Separacion preparada, sin bloqueos comerciales nuevos | No se activo cobro ni pasarela de pagos |

## Produccion y versiones

- Codigo publico de la migracion: main `438fa52` (PRs 112, 113 y 114 fusionados).
- Worker de entrada estable: `estudiemos`, version
  `12937b0a-3bc3-47a0-90dc-b23165eac355`.
- Backend: `estudiemos-candidate` es un nombre historico; recibe las APIs del
  sitio estable mediante service binding. No significa que el sitio siga en preview.
- Backend medido: `75770533-5020-45da-9366-f5bdd904bbd8`.
- Version publica del backend tras actualizar su configuracion: `8394e1df-d0d9-475a-b2bc-458e058ba5e7`.
  Conserva el mismo codigo y agrega el token existente del sincronizador privado.
- `PUSH_DISPATCH_ENABLED=true` esta versionado: un despliegue ordinario no debe
  desactivar por accidente el despachador autorizado.
- Supabase sigue siendo el mismo proyecto. No hubo traslado de usuarios,
  rotacion de claves Auth ni reconstruccion de calendarios.

Los enlaces antiguos de instalacion, materia y amistad redirigen con 307 al
origen nuevo. Se conservan `/`, `/api/*` y los transportes antiguos necesarios;
una redireccion global romperia permisos de PWA y accesos breves firmados.

## Datos observados en produccion

Consulta agregada de solo lectura, sin exportar contenido ni credenciales:

| Metrica | Observado |
| --- | --- |
| Base PostgreSQL completa | 19.459.219 bytes, aproximadamente 19,5 MB |
| Cuentas registradas | 6 |
| Cuentas con ultimo inicio de sesion en 30 dias | 3 |
| Estados personales | 5 |
| Conexiones de Drive | 1 |
| Catedras / membresias adicionales | 1 / 1 |
| Storage historico | 1 bucket, 3 objetos, 16.994.081 bytes |
| RLS de user_states | Activado |
| Cron de alarmas | Uno activo, cada minuto |
| Suscripciones web vigentes anteriores | 1 |
| Suscripciones web vigentes en Cloudflare | 0 en la consulta de cierre |
| Cola push actual | 0 pendientes, 0 agotados |
| Ultimo heartbeat del cron | 48 segundos antes de la consulta |

Tres inicios de sesion recientes NO son la metrica oficial facturada de MAU,
ni seis cuentas registradas equivalen a seis usuarios activos. El consumo de
egress del mes debe leerse en Usage; el tamano de la base no permite deducirlo.
Los 16,99 MB historicos se conservaron: no se declaro Storage vacio.

La consulta reproducible es `supabase/diagnostics/migration-health.sql`.
No crea funciones, permisos ni tablas; es solo para operadores.
La ultima lectura fue el 30/10 a las 03:06 de Argentina; estos valores son una
fotografia, no contadores inmutables ni el consumo mensual de transferencia.

## Pruebas de regresion

- 566 pruebas Node aprobadas, cero fallos y cero omitidas en la suite completa.
- Dos pruebas con assets compilados aprobadas por separado: compartir texto a
  Inbox y alineacion del calendario del widget.
- CSP y comprobacion de seguridad del repositorio aprobadas.
- Smoke publico real contra Cloudflare aprobado: encabezados, rutas privadas,
  acceso anonimo a tablas/RPC y rechazo de login sin CAPTCHA.
- En la fase anterior de esta misma migracion se verificaron Chrome tactil y
  WebKit responsivo, scroll de alarma, dialogo de cuenta superpuesto y borrador
  conservado. Eso no equivale a un iPhone fisico ni concede permisos nativos.

No hubo cambios de layout ni de logica de estudio en este PR de cierre. Las
pruebas no enviaron SMS, no llamaron modelos pagos ni contrataron servicios.

## Rendimiento real, no carga sintetica

En Cloudflare, filtrando la version `75770533` y la ventana disponible:

- 13 invocaciones observadas.
- CPU p50: 5,66 ms. CPU p99: 9,60 ms.
- Wall time p50: 278 ms; p99: 984 ms. Esperar red no equivale a consumir CPU.
- Memoria p99: 5,27 MB.
- Cero errores de ejecucion y cero limites de CPU excedidos en esa muestra.

La muestra es pequena y mezcla rutas. NO certifica el p99 del envio push a Apple,
Google o Mozilla, ni demuestra estabilidad con una cohorte grande. El p99 de
9,60 ms esta cerca de los 10 ms del plan Free: hace falta seguir midiendo las
rutas autenticadas y criptograficas, no repetir el antiguo 3,74 ms como garantia.
Hubo percentiles por intervalos de otras versiones superiores a 10 ms; no se
atribuyeron a la version actual ni se ocultaron en una promesa de capacidad.

La CDN libera a los Workers de servir assets ordinarios. Solo APIs e invitaciones
dinamicas pasan por el script. Los assets son gratuitos e ilimitados; las APIs
siguen sujetas a cuota y CPU. [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

## Notificaciones y Windows

### Moviles

Ian confirmo que recibio un aviso real. No estaba seguro de si lo abrio desde
el icono nuevo o el anterior. La base aun mostraba una suscripcion antigua y
ninguna nueva. Por eso esa confirmacion prueba recepcion, NO la entrega desde
el nuevo origen. No se quitaron las claves ni la cola anterior.

Para cerrar la coexistencia falta registrar un dispositivo real en el sitio
nuevo y comprobar una alarma programada con la app cerrada, ademas del aviso
inmediato de prueba. En iPhone/iPad la PWA nueva debe agregarse a Inicio y recibir
su propio permiso; ningun servidor puede transferir el permiso del icono viejo.
Ver [WebKit: Web Push en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

El despachador de Cloudflare reserva un trabajo por invocacion, envia y confirma
con tres subpeticiones en el camino normal. SQL reparte hasta 400 trabajos por
tick entre los origenes pendientes, no un unico aviso por minuto. Usa reservas,
deduplicacion y reintentos acotados. Eso no garantiza puntualidad al segundo:
influyen el cron, la cola, el proveedor y el sistema operativo del telefono.

### Esta PC

Se actualizo el paquete ya instalado sin reinicio ni cambios de seguridad.
Los componentes comprobados coinciden con las fuentes publicadas. La tarea
programada permanece oculta y sin consola.

La vinculacion nativa termino con estado `connected`, etapa `complete` y
archivo local version 2. Cuenta y dispositivo coinciden. Se retiro la credencial
`feed.dpapi` que el corredor local ya no necesita. El archivo contenia cero
alarmas activas al vincular: no se inventaron alarmas para el usuario.
El corredor instalado tambien completo su diagnostico `-DryRun` con salida 0;
la tarea estaba habilitada/oculta, usaba `--headless` y su ultima ejecucion
termino con codigo 0. Ese diagnostico no equivale a conceder el permiso web.

La pestaña nueva aun no confirmaba que pudiera escribir el archivo. Ian indico
que creia haberlo autorizado; esa duda no se contabiliza como permiso comprobado.
El paso pendiente es elegir el archivo `Alarmas-*.estudiemos-local` desde
Documentos/Estudiemos y permitir su actualizacion en Chrome/Edge. No hace falta
reinstalar ni generar otra clave. No se evaden permisos de archivos del navegador.

Windows ejecuta localmente lo ya sincronizado con la app cerrada y el equipo
encendido/sesion iniciada. Una alarma NUEVA del celular no llega a una PC que
nunca vuelve a abrir o sincronizar Estudiemos: es el limite deliberado de quitar
el sondeo de servidor. No se promete sincronizacion instantanea sin un canal activo.

## Registro privado y monitoreo del Excel

Se localizaron el proyecto existente de Apps Script y sus dos activadores.
Solo se reemplazaron los dos origenes HTTP por Cloudflare, conservando codigo,
hoja, destinatarios, permisos y la misma credencial de lectura ya existente.
El token se transfirio como Secret por stdin y se elimino el archivo temporal
privado. No se incluyo en Git, documentacion ni codigo del navegador.

Se ejecuto `actualizarPanelAdministrativo` y Apps Script confirmo finalizacion
sin error. Sigue habiendo dos activadores: monitoreo cada hora y registro de
usuarios cada seis horas. No son llamadas a modelos de IA ni consumen tokens.
No se recrearon activadores ni se amplifico su frecuencia.

## Respaldos y recuperacion

Respaldo comprobado: GitHub Actions
[40974908998](https://github.com/ipala2006-maker/ingenieria-recursos/actions/runs/40974908998).
Archivo cifrado: 317.065 bytes; manifiesto y SHA verificados.

Se restauro en PostgreSQL 18 aislado en loopback, sin tocar produccion:

- auth.users: 6; auth.identities: 6; user_states: 5.
- classrooms: 1; classroom_members: 1; events/materials: 0/0.
- RLS conservado; cero claves foraneas sin validar.
- La conexion de Drive v2 se descifro con el respaldo de claves correcto.
- No se escribio un archivo dump sin cifrar. El servidor temporal se cerro.

La programacion diaria es 06:17 UTC (03:17 de Argentina); GitHub puede demorar
el inicio. Los artefactos cifrados duran siete dias. La clave privada age queda
fuera de GitHub. Debe existir otra copia segura independiente de esta PC;
el archivo cifrado sin esa clave no es recuperable.

El dump guarda metadatos de Storage, no los bytes de los tres archivos antiguos
ni documentos de Drive. Conservar esos archivos requiere el procedimiento de
Storage de `docs/database-backups.md`; el presente restore no acredita su copia.
Drive pertenece a cada usuario y necesita su propia politica de recuperacion.

## Seguridad comprobada y limites

Se verificaron en el origen publico nuevo HSTS, CSP, nosniff y proteccion de
marcos. Las rutas administrativas, planes y widgets rechazaron acceso anonimo
con 401; las tablas personales y cuatro RPC privilegiadas tampoco entregaron
filas sin autenticacion. Supabase rechazo un intento de login sin CAPTCHA.

La configuracion publica no entrega claves secretas. La lectura dual/versionada
de Drive sigue activa; no se elimino la clave anterior de forma prematura.
Los origenes y destinos nativos tienen allowlist exacta y no siguen redirects
para canjear credenciales. No se expone un endpoint para volcar variables.

Son verificaciones puntuales y pruebas de regresion, no una garantia de ausencia
de toda vulnerabilidad ni una auditoria ofensiva completa realizada ahora.
No se cambiaron roles de usuarios reales ni se borraron datos para demostrar tests.

## Capacidad gratuita: modelo de presupuesto

Limites oficiales comprobados: Workers Free tiene 100.000 peticiones dinamicas
por dia, 10 ms CPU por peticion, 50 subpeticiones y 128 MB RAM. No hay SLA de
produccion garantizado por la prueba local. [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/).

Supabase Free incluye 500 MB DB, 5 GB egress, 1 GB Storage, 50.000 MAU Auth,
200 conexiones Realtime y dos millones de mensajes/mes. Son limites distintos;
50.000 MAU de Auth NO significa que toda esta app soporte esa carga. El proyecto
puede pausarse tras una semana sin actividad. [Supabase](https://supabase.com/pricing).

Los siguientes numeros son SUPUESTOS de planificacion, no mediciones de Ian:
20 dias activos por usuario al mes, 40% de MAU activos en un dia de pico y
reserva del 30% de las cuotas. El presupuesto de egress usado es 3.500 MB/mes.

| Escenario | Egress por MAU/mes | MAU por presupuesto egress | DAU al 40% | Peticiones dinamicas por DAU/dia | Peticiones/dia estimadas |
| --- | --- | --- | --- | --- | --- |
| Pesimista | 5 MB | 700 | 280 | 150 | 42.000 |
| Realista condicionado | 2 MB | 1.750 | 700 | 60 | 42.000 |
| Optimista condicionado | 1 MB | 3.500 | 1.400 | 30 | 42.000 |

Formula: MAU por egress = 3.500 MB / MB reales por usuario al mes. El presupuesto
de peticiones por DAU debe incluir APIs, invitaciones, pruebas, alarmas y todo
trabajo auxiliar contabilizado por Cloudflare; no solo clicks de pantalla.
Los ejemplos no suman dos veces el trafico directo de assets y no convierten
DAU en simultaneos. En un pico de vuelta de clase, el numero de sesiones y
canales Realtime por usuario podria alcanzar su limite antes que el egress.

Para 1.500 MAU, con esa reserva, se necesitan menos de 2,33 MB egress/MAU/mes,
CPU con margen en TODAS las rutas importantes y concurrencia dentro de cuota.
Con 5 MB por usuario cabrian unos 700, aunque no se guarde ningun PDF en Supabase.
Por eso 1.000-1.500 MAU es un objetivo plausible condicionado, NO un techo seguro
certificado. No se activo ningun upgrade automatico; agotar una cuota gratuita
puede limitar el servicio en vez de comprar capacidad.

## Pendientes priorizados

1. Registrar y probar un dispositivo fisico en el origen NUEVO y una alarma
   programada con app cerrada. Hasta entonces conservar la entrega antigua.
2. Confirmar el permiso local de archivo de Windows en el navegador nuevo.
   La vinculacion nativa esta completada; falta el puente de futuras ediciones.
3. Verificar el alcance publico del consentimiento Google y la allowlist de
   Drive antes de anunciar esa conexion para todos; no abrirla a ciegas.
4. Medir CPU por ruta y por proveedor push. La muestra p99 9,60 ms deja poco margen.
5. Pilotear 20, 50 y 100 personas y registrar egress/DAU, fallos de login,
   latencias, conexiones Realtime y puntualidad de avisos; no lanzar 1.500 de golpe.
6. Respaldar tambien los bytes historicos de Storage y guardar la identidad age
   en una ubicacion segura independiente. No confundir Git con backup de datos.

## Criterio para retirar Vercel y rollback

No eliminar Vercel solo porque la web nueva carga. Retirarlo cuando no queden
suscripciones ni clientes necesarios en el origen viejo, haya una alarma movil
real comprobada en el nuevo, los callbacks funcionen con usuarios representativos
y los respaldos restaurables incluyan los activos historicos necesarios.

Mientras tanto se conservan su emisor de accesos breves, callbacks, secretos
y despliegues activo/anterior. La limpieza de artefactos sigue habilitada.
Para volver atras se restaura la version verificada de cada Worker y, si hace
falta, se revierten los cuatro redirects y el Site URL; no se vuelve a cifrar
la base con una clave antigua ni se revocan sesiones masivamente.

## Archivos de cierre

- `google-apps-script/user-registry.gs`: consumidores privados hacia Cloudflare.
- `.env.example`: origen primario, callbacks y esquema de claves versionadas.
- `tests/cloudflare-entrypoints.test.js`: regresion de URLs y frecuencia del consumidor.
- `tests/security-public.smoke.cjs`: Cloudflare por defecto, legacy elegible con allowlist.
- `supabase/diagnostics/migration-health.sql`: diagnostico agregado de solo lectura.
- Este informe. Las pruebas locales y evidencias privadas no se suben a Git.

Los cambios anteriores de la mudanza se detallan en `docs/cloudflare-client-cutover.md`,
`docs/cloudflare-hosting-migration.md`, `docs/cloudflare-push-coexistence.md` y
`docs/cloudflare-secret-continuity.md`. No se alteraron las preferencias de
layout, calendarios, notas ni archivos de los usuarios en este cierre.
