# Respaldos cifrados de Estudiemos

## Que queda implementado

`scripts/backup-database.cjs` ejecuta `pg_dump` en formato custom comprimido y
lo envia directamente a `age`. No crea SQL, JSON de usuarios ni dumps sin cifrar
en disco. Cada dump tiene una unica instantanea consistente de PostgreSQL.
Incluye estructura, funciones, politicas RLS y datos de `public`, `auth` y
`private`: cuentas, identidades, notas, amigos, catedras, miembros, fechas,
materiales y conexiones de Drive cifradas. Incluye nuevas tablas de esos schemas.

No exporta archivos de Drive, Storage, Vault, claves de Vercel ni configuracion
SMTP/OAuth del proveedor. No conserva sesiones, refresh tokens, colas de envio,
suscripciones push ni contadores de rate limit. Tras restaurar, los usuarios
inician sesion y vuelven a habilitar los avisos. Las alarmas se reproyectan al
registrar cada dispositivo, sin reproducir notificaciones antiguas.

La estructura de esas tablas temporales si se conserva. El limite es cinco
minutos y 32 MiB por archivo cifrado. Ante error, falta de tablas o exceso de
tamano no se publica ningun respaldo parcial. El manifiesto contiene solamente
fecha, proyecto, alcance, bytes y SHA-256; nunca contenido ni credenciales.

## Activacion unica (todavia no se activa por fusionar el PR)

1. Instalar `age` desde su fuente oficial en una maquina de confianza. Ejecutar
   `age-keygen -o estudiemos-recovery.agekey`. Guardar la identidad privada
   fuera del repositorio y de GitHub, con otra copia offline protegida. Sin esa
   identidad no hay recuperacion. No enviarla por chat.
2. En GitHub > Settings > Secrets and variables > Actions guardar como **Secret**
   `BACKUP_DATABASE_URL`: URL PostgreSQL directa o Supavisor en modo **Session**,
   puerto 5432. Usar una credencial de lectura dedicada con acceso a los tres
   schemas y capacidad de leer las tablas con RLS forzado. No basta la API key
   publica ni una service key de HTTP. No crear un usuario administrador para
   esto ni pegar la URL en codigo, logs o el historial de consultas SQL.
3. Crear las variables `BACKUP_PROJECT_REF` (referencia del proyecto) y
   `BACKUP_AGE_RECIPIENT` (solo la clave publica `age1...`). El exportador rechaza
   otro proyecto, puertos de transaccion y TLS sin verificar. Se recomienda el
   pooler de sesion por compatibilidad IPv4 y certificado publico. Si se necesita
   una CA propia, configurar `BACKUP_SSL_ROOT_CERT` en el entorno del runner;
   nunca desactivar TLS para hacerlo funcionar.
4. Crear `BACKUPS_ENABLED=true` y ejecutar manualmente **Encrypted database
   backup** en la rama principal. Descargar su artefacto y realizar la prueba
   de recuperacion antes de considerarlo activo. No se debe habilitar esta
   variable mientras falte el secreto o la identidad offline.
5. La tarea solicita ejecucion diaria a las 06:17 UTC (03:17 de Buenos Aires),
   solo desde la rama principal, sin ejecutar codigo de PRs con secretos. GitHub
   puede retrasar los cron; no es un sistema de recuperacion punto en el tiempo.
   Retiene siete dias y no reemplaza una copia independiente offline periodica.
   En repositorios publicos, GitHub puede desactivar schedules tras 60 dias sin
   actividad. Revisar Actions, su ultimo exito y los avisos de fallos.

La credencial de exportacion debe limitarse a SELECT/USAGE de los schemas
incluidos. BYPASSRLS es sensible: su configuracion requiere al administrador.
No otorgar acceso a Vault ni permisos de escritura, crear roles o crear bases.
Revisar los permisos de tablas nuevas; si faltan, pg_dump falla y avisa, no
acepta silenciosamente un respaldo parcial. Mantener protegida la rama main.

## Cuota y costo de infraestructura

No contrata planes ni habilita sobreconsumo. Siete archivos de 32 MiB son hasta
224 MiB, mas manifiestos y eventuales reintentos; comparten cuota de artefactos
con los otros workflows de GitHub. No se promete almacenamiento ilimitado.

**El respaldo tambien usa transferencia de salida de Supabase.** pg_dump recibe
datos de PostgreSQL y los comprime en el cliente: el tamano final `.age` NO es
la medida del egress de origen. Si una exportacion transfiere 10/50/100 MB,
30 ejecuciones consumen aproximadamente 0,3/1,5/3 GB al mes, aparte del uso de la
app. Medir el primer respaldo y presupuestarlo; no extrapolar 1.500 usuarios sin
restar este consumo. Si crece demasiado, reducir la frecuencia deliberadamente
(aceptando mas datos recientes sin respaldo), aumentar el presupuesto solo con
autorizacion, o disenar incrementales con restauracion verificada. No omitir
notas ni simular un respaldo exitoso para reducir consumo.

## Recuperacion segura

1. Descargar el `.dump.age` y su `.json`; comprobar bytes y SHA-256 contra el
   manifiesto. Un hash detecta corrupcion, no autentica a un autor por si solo.
2. En un entorno privado, `age --decrypt --identity estudiemos-recovery.agekey
   --output recuperacion.dump respaldo.dump.age`. La salida ya contiene datos
   personales: usar disco protegido y no subirla a GitHub o al chat.
3. Inspeccionar con `pg_restore --list recuperacion.dump`. Restaurar primero en
   una base de prueba aislada y vacia, con PostgreSQL compatible. No ejecutar
   `--clean` sobre produccion. En Supabase, preparar extensiones/roles y adaptar
   los objetos administrados de Auth siguiendo su guia oficial; no reemplazar
   el schema Auth de un proyecto activo a ciegas.
4. Reaplicar los grants de las migraciones del repo: el dump no exporta owners
   ni ACL. Comprobar cuentas/identidades, notas, miembros, FK, funciones y RLS.
   Recuperar las claves de Drive/Vercel y SMTP por separado; sin la clave de
   cifrado de Drive sus tokens no son utilizables y hay que reconectar.
5. Recien despues planificar la restauracion real. El script de respaldo no
   tiene una accion de restauracion automatica ni puede borrar produccion.

`backup-verify.yml` realiza con PostgreSQL y age reales un ciclo de exportacion,
cifrado, descifrado y restauracion de datos ficticios. No usa secretos de
produccion ni publica artefactos privados. Esa prueba no equivale a haber
restaurado la base real de Estudiemos.

Fuentes: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[restauracion](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[age](https://github.com/FiloSottile/age),
[GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
