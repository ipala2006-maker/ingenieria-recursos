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
- Lectores duales activos, SIN clave activa nueva: las escrituras siguen v1.
  No se recifraron autorizaciones ni se cambio la clave AES original.
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
  No se eligio todavia una clave escritora; la AES legacy no se exporto ni cambio.
  El deployment publico anterior a esta variable necesita un redeploy compatible
  y un rollback tambien compatible antes de cualquier escritura v2.
- Cloudflare tiene cinco secretos: los cuatro iniciales y el keyring nuevo.
  Faltan credenciales/configuracion de proveedores. No exportar secretos
  marcados no exportables de Vercel para saltar esta limitacion.

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

1. Publicar lectores con keyring y conservar un rollback compatible. Preparar
   escritor v2, drenar invocaciones antiguas, simular y confirmar CAS por lotes.
   El ejecutor aislado y sus puertas se documentan en drive-recipher-executor.md.
2. Auditar otra vez todas las conexiones y probar refresh/listado en Workers
   antes del corte. No borrar originales ni respaldos del entorno legado.
3. Configurar callbacks y hostname CAPTCHA, probar Auth/Drive y preparar los
   instaladores y la transicion de datos locales de cada origen.
4. Resolver VAPID/FCM y la convivencia de suscripciones sin doble despacho;
   probar proveedores y cola reales antes de cambiar un unico cron.
5. Cambiar el sitio publico solo cuando estas pruebas pasen. Conservar Vercel
   como respaldo compatible y puente temporal donde sea necesario.
