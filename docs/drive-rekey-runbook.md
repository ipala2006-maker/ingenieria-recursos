# Drive: lectura dual y recifrado controlado

Estado: preparacion en PR dedicado, basado en #103. No se recifraron filas
reales, no se aplico SQL de produccion ni se cambiaron secretos existentes.
El modulo NO se conecta a un endpoint HTTP, cron ni accion de usuario.

## Compatibilidad

Sin variables nuevas, `drive-vault` conserva las escrituras v1 y el mismo AAD
de produccion. Puede leer grants y cookies OAuth existentes. Agregar un keyring
sin elegir clave activa solo prepara lectores: no cambia el formato escrito.

| Variable privada | Uso |
| --- | --- |
| DRIVE_TOKEN_ENCRYPTION_KEY | AES de 32 bytes en hexadecimal del formato legado; conservarla en Vercel |
| DRIVE_TOKEN_KEYRING | JSON de hasta cuatro IDs y sus claves AES de 32 bytes; guardar como Secret |
| DRIVE_TOKEN_ACTIVE_KEY_ID | ID explicito para escribir sobres v2; ausente mantiene v1 |
| DRIVE_REKEY_ENABLED | Ausente/false impide confirmar lotes; no afecta las lecturas normales |

Los IDs empiezan con letra minuscula, permiten letras, numeros, guion y guion
bajo, hasta 32 caracteres. No cambiar la clave asociada a un ID que ya se uso:
una rotacion posterior crea otro ID. No usar la clave de Supabase, el client
secret de Google, VAPID ni la identidad age como clave AES.

## Formato

```text
v1: base64url(IV de 12 bytes || tag GCM de 16 bytes || ciphertext JSON)
v2: v2.<keyId>.<base64url(IV || tag || ciphertext JSON)>
AAD v1: estudiemos.drive.v1:<purpose>
AAD v2: estudiemos.drive.v2:<keyId>:<purpose>
purpose de grant: user:<UUID de Estudiemos>
purpose de cookie: oauth
```

AES-256-GCM utiliza un IV aleatorio nuevo por escritura. El ID, version y
proposito quedan ligados por AAD: cambiar usuario, usar una cookie como grant
o renombrar el ID (aunque tenga la misma clave) invalida la autenticacion.
No se prueban otras claves a ciegas si falta el ID. Un error de GCM no borra la
conexion ni obliga automaticamente al usuario a autorizar otra vez.

El sobre no contiene claves. El limite de 24.000 caracteres se valida antes de
guardar. Se conserva el formato legado, sin prefijar ni reescribir registros
existentes solo por desplegar este codigo.

## Orden de activacion posterior

1. Revisar el PR, restaurar una copia cifrada en un entorno aislado y conservar
   Vercel operativo. Verificar la renovacion OAuth con el secreto coexistente
   del mismo cliente Google antes de depender de el.
2. Desplegar lectores duales en TODAS las versiones que puedan escribir grants.
   Aun sin clave activa: escrituras v1. Fijar un rollback tambien compatible
   con ambos formatos, no una version antigua que solo entiende v1.
3. Generar la nueva AES mediante CSPRNG, guardarla en un gestor independiente
   y como secreto de Vercel/Cloudflare. No descargar ni exportar la AES antigua.
   Agregar el keyring a Vercel, sin quitar DRIVE_TOKEN_ENCRYPTION_KEY.
4. Elegir el ID activo solo tras probar lecturas, cookies y renovacion con datos
   de prueba. A partir de este momento las renovaciones normales escriben v2.
   Esperar que terminen invocaciones iniciadas con variables/versiones anteriores
   (la API actual tiene maxDuration de 60 segundos), con margen, antes del barrido
   final. No probar escrituras desde previews antiguos durante la migracion.
5. Revisar/aplicar `supabase/drive-recipher.sql`. Solo agrega una funcion privada
   service_role; aplicar el SQL no modifica filas. No se conceden permisos a
   anon/authenticated ni se cambia el control de acceso de Drive.
6. Ejecutar una simulacion del bloque servidor dentro de Vercel. Con
   `recipherBatch()` commit es false por defecto: descifra/verifica en memoria,
   calcula candidatos y devuelve contadores/checkpoint, nunca tokens ni claves.
7. Para confirmar se necesitan las dos acciones: DRIVE_REKEY_ENABLED=true y
   `commit:true` en el trabajo interno revisado. No hay un ejecutor publico en
   este PR: su invocacion operativa se habilitara por separado, con autorizacion.
8. Procesar hasta 25 filas por lote; revisar failed/conflicts/retryRequired.
   No avanzar ni declarar exito solo porque hasMore sea false. Parar y revisar
   fallos; no crear un bucle de reintentos ilimitado sobre una fila ilegible.
9. Hacer un recorrido completo nuevo de verificacion, desde el principio,
   despues de la migracion. Comprobar que todos los escritores usan v2 y que
   Workers renueva tokens/lista archivos sin pedir otro consentimiento.
10. Crear y restaurar un backup nuevo recuperable con la AES nueva. Mantener
    el entorno legado hasta vencer la retencion/rollback de copias antiguas;
    aquellas copias todavia necesitan la clave vieja o su entorno de lectura.
11. Apagar DRIVE_REKEY_ENABLED. No borrar la clave antigua, conexiones o Vercel
    como parte de este PR. No mezclar este paso con cambiar dominios/cron/pagos.

## Concurrencia y seguridad del lote

La actualizacion compara user_id, ciphertext previo Y updated_at preciso. No
convierte el timestamp a milisegundos antes del CAS. Si otro proceso renovo el
token, la comparacion falla sin pisarlo. Si el usuario desconecto Drive, UPDATE
no inserta ni restaura su autorizacion.

Las filas ya en la clave destino se descifran y verifican antes de contarlas
como actuales. Un lote repetido es idempotente. El checkpoint no supera el
primer conflicto o error, aunque otras filas del mismo lote si se conviertan.
Un timeout puede haber confirmado una escritura: releer antes de reintentar.

El listado usa cursor por UUID, orden estable y como maximo 26 filas para
procesar 25. La respuesta contiene contadores, ID de clave y cursor tecnico;
no publicarla ni enviarla a analitica. No registrar el cuerpo RPC, ciphertext,
refresh/access tokens, claves, correos o titulos. El SQL CAS solo recibe los
textos cifrados por POST, nunca como filtro de URL ni en un enlace compartido.

## Paso 1 externo: clave adicional Supabase

El titular confirmo haber creado y respaldado `estudiemos_cloudflare_backend`.
La clave correcta es la fila con ESE NOMBRE dentro de Secret keys, no la
publishable, default o estudiemos_widgets. Se verifico por la interfaz oficial
de Wrangler que SUPABASE_SECRET_KEY esta guardado como secret_text en
estudiemos-candidate, sin leer ni imprimir su valor. Se agrego SUPABASE_URL
para el mismo proyecto, sin reemplazar la clave ni subir otro codigo.

La prueba de conexion quedo aprobada: una invitacion aleatoria inexistente
devolvio el 404 de clase no encontrada que corresponde a la consulta privada
autorizada de Supabase, no el 503 de conexion fallida. No se imprimieron datos
de alumnos ni se modificaron tareas, archivos o cuentas. Los controles normales
de tasa pueden registrar el contador operativo de esa consulta.

Esto completa la verificacion de la clave de servidor del candidato, no el
corte de hosting ni los flujos Auth/Google/push. No se habilitaron registros
de usuarios en el candidato ni se activaron notificaciones o recifrado.

No cambiar JWT signing keys, contrasena de la BD ni las claves de Vercel.
La siguiente comprobacion debe ser de solo lectura, con respuesta minima,
sin abrir el registro de alumnos en el candidato ni activar el despachador.

El navegador no permitio continuar la observacion de Google Cloud por un
fallo temporal de su revision automatica. No se uso una via alternativa para
leer ese panel ni crear secretos. No se creo un segundo secreto Google ni se
probo un refresh token real en esta entrega. El cliente existente se conserva.

## Verificacion

- 500/500 pruebas de regresion, sin omisiones, con fixtures Windows aislados.
- Formato legado comprobado con un descifrador independiente; v2 tambien se
  descifra independientemente con su AAD documentado.
- Doble lectura de grants/cookies, nuevo IV, rechazo de alteracion, usuario/ID
  equivocados, claves faltantes, keyrings invalidos y formato no soportado.
- Simulacion sin escrituras, limite de pagina, lotes repetidos, conflictos,
  checkpoint conservador y validacion SQL de timestamps con microsegundos.
- El SQL real de prueba rechaza anon/authenticated y no recrea conexiones
  eliminadas mientras el lote conserva una lectura anterior.
- El runtime local de Workers, CSP, aislamiento de fuentes y descargas paso
  las comprobaciones habituales; build y chequeo de seguridad aprobados.
- Nada de esto certifica todavia un refresh OAuth real con el nuevo secreto.
