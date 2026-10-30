# Corte definitivo del puente de Vercel

Decision del 30/10/2026: dejar de mantener transporte para clientes del origen
anterior. Cloudflare es la unica direccion operativa que se comunicara a usuarios.
Las cuentas y datos siguen en el mismo Supabase. No se activan pagos.

## Estado

Cambios preparados y probados. La ejecucion de la migracion en Supabase requiere
la confirmacion puntual solicitada por el control de seguridad. No se debe
presentar el proyecto de Vercel como pausado hasta verificar la respuesta real.

## Que cambia

- `vercel.json` deshabilita despliegues Git en todas las ramas. La configuracion
  de headers sigue siendo utilizada por el build de Cloudflare; no es un proxy
  de trafico hacia Vercel.
- `supabase/mobile-push-cloudflare-only.sql` deshabilita el origen legacy sin
  borrar suscripciones, datos personales, archivos ni cuentas.
- El cron conserva su frecuencia, limite diario, indice de proxima ocurrencia,
  reintentos y deduplicacion. Solo envia al endpoint fijo de Cloudflare: hasta
  400 invocaciones con un trabajo cada una por tick, y ninguna en ticks vacios.
- Los usuarios sin una suscripcion nueva no proyectan agendas ni generan nuevos
  trabajos para la cola retirada. Las suscripciones viejas no consumen los cinco
  cupos de dispositivos activos del origen nuevo.
- Las firmas antiguas de claim devuelven cero filas. No reservan trabajos del
  origen nuevo. El registro antiguo queda rechazado y no retaguea suscripciones.
- Se conservan funciones y permisos privados; no se concede acceso de alumnos
  a tablas, tokens, cola ni cron. Un marcador impide reaplicar por accidente la
  migracion anterior de convivencia sobre el corte final.

## Orden de aplicacion para el operador

1. Verificar el origen nuevo y su configuracion publica de push. Generar un
   backup cifrado y comprobar su resultado. El backup previo a este corte es
   [41067945967](https://github.com/ipala2006-maker/ingenieria-recursos/actions/runs/41067945967).
2. Aprobar el PR y ejecutar `supabase/mobile-push-cloudflare-only.sql` en el
   proyecto correcto. La guarda exige que el servicio Cloudflare ya este listo;
   falla antes de modificar filas si no lo esta. Es repetible.
3. Leer `supabase/diagnostics/migration-health.sql`: legacy deshabilitado,
   Cloudflare habilitado, cron unico y datos personales intactos. Comprobar el
   comentario `estudiemos-cloudflare-only-v1` en `public.tick_mobile_push()`.
4. Pausar exclusivamente el proyecto `estudiemos-app`, ID
   `prj_BDIVyIanCqTDh32fhWkloZJi9Cbp`, equipo `team_hPWQUVpRlY5E5VjE9nBQ1CL2`.
   Usar la pausa oficial y reversible de Vercel, no borrar el proyecto ni sus
   credenciales. El dominio anterior dejara de responder como app; no es una
   redireccion ni un proxy.
5. Fijar `VERCEL_CLEANUP_ENABLED=false` en las variables del repositorio. No se
   borra ningun artefacto adicional ni se cambia el workflow de backups.
6. Fusionar el PR si aun no esta en main. Con `git.deploymentEnabled=false` no
   deben generarse mas despliegues Vercel automaticos. El codigo desplegado de
   Workers ya usa el contrato SQL con origen; no necesita nuevas credenciales.
7. Repetir el smoke publico contra Cloudflare y comprobar por HTTP que el dominio
   anterior esta pausado. Una respuesta 503 `DEPLOYMENT_PAUSED` alli es el efecto
   esperado del retiro, no una caida de Cloudflare.

No hay que exportar secretos de Vercel, copiar sesiones entre origenes ni
enviar tokens por URL al sitio nuevo. Los callbacks historicos conservados no
son un puente activo cuando Vercel esta pausado. No se rotan claves de Auth,
Drive ni Firebase como parte de este corte.

## Lo unico que depende del dispositivo

La guia para Ian esta en `docs/activar-estudiemos-cloudflare.md`. Los permisos de
notificacion de un PWA y de escritura del archivo local corresponden al origen
y perfil concretos. Deben otorgarse en el nuevo icono/ventana mediante el flujo
normal del sistema; ningun cambio SQL puede concederlos por el usuario.

Una prueba de limites de cola con 500 suscripciones sinteticas no es un ensayo
real de 500 alumnos. Tampoco se acredita una alarma fisica programada con la app
cerrada hasta realizar las comprobaciones de la guia en ambos dispositivos.

## Recuperacion excepcional

La pausa puede revertirse sin borrar el proyecto. Eso por si solo NO reactiva
la cola antigua ni cambia callbacks. Un retorno al sistema anterior requiere
una decision explicita del operador, retirar el marcador del cron y restaurar
las funciones de convivencia desde Git, manteniendo las identidades de clave.
No hay fallback automatico al transporte viejo por error, timeout ni falta de
permiso en un celular.

Referencias: [Pausa oficial](https://vercel.com/docs/rest-api/projects/pause-a-project)
y [deshabilitar despliegues Git](https://vercel.com/docs/project-configuration/git-configuration).
