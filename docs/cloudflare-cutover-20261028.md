# Corte Cloudflare: ejecucion del 28/10/2026

Estado: migracion solicitada y en curso; el corte publico todavia NO se hizo.
No anunciar 100% migrado ni modificar el cron hasta cerrar las puertas reales.

## Completado

- Backup nuevo: workflow 40772159437, finalizado correctamente. Se descargo
  solo el archivo age cifrado y su manifiesto a .backups/pre-migration-20261028.
  Tamano: 308.866 bytes. SHA-256 verificado:
  1060c28259fc5f99b8f1ce4bd4d7516c4bd6a4f29ee941b03b6becd80bd970d3.
  La integridad se verifico, no se simula que esto equivalga a restaurarlo.
- PR #105 integrado en #103; #103 integrado en main, incluyendo #102, sin
  squash. Los tres PR figuran fusionados. Free/Pro del PR #104 no se activo.
- Codigo de compatibilidad publicado: main 40096c05f4b58b9aa1c55576e0c19773dbe6288d.
  Produccion Vercel: dpl_7SwDHGp5jwhWf5GrP21t8MhL43s3, estado Ready.
  Se conserva https://estudiemos-app.vercel.app y sus alias habituales.
- Al publicar la compatibilidad los lectores duales seguian escribiendo v1.
  El recifrado ejecutado posteriormente se registra abajo; la AES original
  sigue intacta y solo en Vercel.
- Google NEXT ya se verifico con un refresh real dentro de Vercel. No se
  deshabilito ninguno de los dos secretos del cliente existente.
- Codigo aprobado actualizado en estudiemos-candidate, version Cloudflare
  1f7458da-2ab8-4d62-9cb7-5f97cb4e4e1c. Se conservaron las cuatro variables
  secret_text existentes y PUSH_DISPATCH_ENABLED=false. No se habilito Auth
  incompleto ni se anuncio el candidato como sitio de lanzamiento.
- Chequeo de seguridad del sitio aprobado tras publicar la compatibilidad.
- PR #106 integrado despues en main 99aec9e028258d39b181a72af8e69a8128ec803a.
  Produccion dpl_6qYEe9vELSpye6NAvuyR9JNzhUWP, Ready y HTTP 200.
  Auditoria real dpl_5sLWFb8xtic4kz22nH13KWMgXZr6: una conexion legacy,
  ninguna ilegible, recorrido completo. El build no genero salida publicable.
- Se genero una identidad age de recuperacion nueva, privada y local en
  .backups/recovery/estudiemos-recovery-20261028.agekey. El directorio solo
  permite acceso al usuario actual de Windows; no se imprime ni se sube la
  identidad a GitHub. Se actualizo solo el destinatario PUBLICO del workflow:
  age178feaxhe8d0krp9xyl53he7ev965dlng3x4ch504745sk0uykd8saj9wr3.
  No se borraron los respaldos anteriores ni su destinatario.
- Backup recuperable nuevo: workflow 40775213725, archivo cifrado
  estudiemos-2026-10-28T21-50-38-425Z-b7172c23.dump.age, 308.866 bytes.
  Se verifico su manifiesto y se RESTAURO realmente en PostgreSQL 18.6 local,
  aislado con SCRAM y escucha solo en 127.0.0.1. Resultado: 6 auth.users,
  6 auth.identities, 5 user_states, 1 classroom y 1 drive_connection;
  RLS conservado y cero claves foraneas sin validar. La base temporal se
  elimino y su servidor se detuvo. No se escribio un dump descifrado en disco.
  La identidad privada necesita una copia independiente en el gestor seguro
  del titular: tenerla solo en esta PC no cubre la perdida del dispositivo.

## Avance posterior y acceso externo

- Chrome dejo de contestar inicialmente. El titular lo reabrio y se recupero
  el acceso oficial a Supabase, sin CDP ni extraccion de cookies.
- Se aplico supabase/drive-recipher.sql mediante SQL Editor y se comprobaron
  sus permisos reales: service_role=true, anon=false, authenticated=false.
  La conexion existente siguio legacy; crear la funcion no recifro ningun dato.
- El CLI oficial de Supabase 2.122.0 no tiene sesion iniciada. En este entorno
  no hay herramientas execute_sql/apply_migration de un MCP Supabase ni
  recursos de ese servidor expuestos. No se inventa acceso de escritura SQL.
- La identidad age anterior quedo guardada por el titular en un chat, no en
  una ubicacion local conocida. No se buscaron ni leyeron historiales o
  almacenes de credenciales. La identidad nueva y el respaldo recuperado
  resuelven la recuperacion previa a esta migracion, no la de archivos antiguos.
- Se preparo drive_20261028 y se verifico su respaldo cifrado local
  .backups/recovery/drive-keyring-20261028.json.age. DRIVE_TOKEN_KEYRING se
  guardo como Secret en Vercel produccion y secret_text en Cloudflare candidato.
  En esa preparacion no se eligio una clave escritora; la AES legacy no se
  exporto ni cambio. Los redeploys compatibles se completaron posteriormente.
- Cloudflare tuvo entonces cinco secretos: los cuatro iniciales y el keyring.
  Faltaban credenciales/configuracion de proveedores. No exportar secretos
  marcados no exportables de Vercel para saltar esta limitacion.

## Recifrado ejecutado y comprobado

- PR #107 integrado en main 0e8de70fd745814c9b42351d29096723d574ec65.
  525 pruebas verificadas (523 generales y dos de navegador con fixture local),
  CI, restauracion de fixture y compilacion Workers aprobados.
- Lector compatible con keyring: dpl_C6BGYdFBCdVv3SKNj7jnbmGNNdaV.
  Respaldo inmediato antes del escritor: dpl_J4W5RHTsYdHKANE1PpfUijwdPERQ.
- Escritor v2 publicado: dpl_DsKajxjBAvhc8cTfo6FkaEV1EAUw, main #107.
  Se verifico que era el deployment publico Ready y se drenaron mas de 90 s.
- Simulacion privada dpl_xruuaqMnWXe8cBnc4gAtANxiD1CT: una conexion legible,
  wouldChange=1, changed=0, conflicts=0, failed=0.
- Commit privado dpl_HenGWrGRrYfDs5xxEBVqP2VaZukP: changed=1, conflictos=0,
  errores=0, sin paginas pendientes. Se uso CAS, no un PATCH sin version.
- Auditoria final dpl_74vPVKwWnFmKRCNxnVaJpRpZdQ5n: checked=1, legacy=0,
  versioned=1, unreadable=0, complete=true y casRegistered=true.
- Mi espacio abrio la conexion real y cargo sus carpetas despues del recifrado.
  Ninguno de los builds operativos genero una app Ready ni recibio el dominio.
- Backup previo fresco 40807453777 restaurado; posterior 40808982718 tambien
  restaurado en PostgreSQL local. Este ultimo recupero y descifro la conexion v2
  usando SOLO el keyring recuperado de su copia age: versionedDriveRecovered=1.
  No se necesito la AES legacy para recuperar ese grant; no se imprimieron
  credenciales, ni se escribio un dump descifrado en disco. Servidores cerrados.
- Cloudflare tiene ahora 14 secretos: keyring, identificador activo y datos
  publicos de clientes validados desde account-config, ademas de sus cuatro
  iniciales. Drive queda limitado a las dos cuentas de prueba conocidas.
  PUSH_DISPATCH_ENABLED sigue false y no hay corte publico ni cambio de cron.
- La configuracion del origen estable se prepara en cloudflare-stable-origin.md.

## Auditoria previa de Drive

Se preparo un modo audit para el ejecutor aislado existente:

```powershell
node scripts/verify-drive-oauth-build.cjs --audit-package
```

El paquete conserva siete archivos, sin app ni endpoints. Usar solo un build
protegido del proyecto actual con --prod --skip-domain, DRIVE_PROBE_MODE=audit,
DRIVE_AUDIT_ENABLED=true y DRIVE_AUDIT_EXPIRES_AT futuro de como maximo una hora.
La activacion es solo --build-env, no una variable persistente de la app.

El auditor hace GET del esquema REST y paginas de hasta 26 filas para verificar
25 conexiones por pagina, como maximo 1.000 por invocacion. Descifra solo en
memoria. No escribe, renueva tokens, lee documentos ni devuelve UUID o ciphertext.
La respuesta contiene contadores y casRegistered: true/false solo si el esquema
se pudo leer; null significa desconocido, nunca permiso confirmado por defecto.
Una pagina corrupta o no ordenada falla con codigo fijo. Si llega al limite,
complete=false; no se puede presentar una muestra parcial como auditoria total.

Incluso un resultado correcto detiene la compilacion con salida no cero.
No produce una version Ready, recursos publicos o un respaldo de la app.
El resultado real de esta auditoria se debe registrar despues de ejecutarla;
las pruebas con fixtures no son un resultado de produccion.

## Orden restante

1. Probar refresh/listado en Workers antes del corte. No borrar originales ni
   respaldos del entorno legado. El recifrado ya se verifico completamente.
2. Configurar callbacks y hostname CAPTCHA, probar Auth/Drive y preparar los
   instaladores y la transicion de datos locales de cada origen.
3. Resolver VAPID/FCM y la convivencia de suscripciones sin doble despacho;
   probar proveedores y cola reales antes de cambiar un unico cron.
4. Cambiar el sitio publico solo cuando estas pruebas pasen. Conservar Vercel
   como respaldo compatible y puente temporal donde sea necesario.
