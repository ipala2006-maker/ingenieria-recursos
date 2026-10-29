# Ejecutor aislado de recifrado

Solo para el operador de la migracion. No es una API de la app ni un cron.
No extrae la clave legacy de Vercel. La cuenta de servidor conserva el mismo
acceso que tenia a drive_connections; anon/authenticated no reciben permisos.

## Puertas previas

1. Backup cifrado restaurado realmente y nueva AES respaldada y recuperable.
2. recipher_drive_connection aplicada y verificada como exclusiva del servidor.
3. Lectores v1/v2 desplegados con DRIVE_TOKEN_KEYRING, incluido un rollback.
4. Previsualizacion correcta. Antes del commit, activar escritor v2 de la app,
   desplegarlo y esperar que se drenen las funciones anteriores; no permitir
   que una renovacion legacy vuelva a escribir v1 despues de recifrar.
5. Conservar la clave legacy para OAuth en transito y conexiones no migradas.

## Paquete y ejecucion

```powershell
node scripts/verify-drive-oauth-build.cjs --recipher-package
```

Se genera un directorio tmp nuevo con OCHO archivos: package.json, lock,
vercel.json, wrapper y cuatro modulos revisados. Comprobar el inventario con
el dry-run del CLI. No adjuntar env, app, API, claves ni documentos.

Ejecutar solo el commit revisado en main y en el proyecto Vercel existente,
con --prod --skip-domain. Estas activaciones son --build-env efimeras, NO
variables persistentes de la app:

- DRIVE_PROBE_MODE=recipher
- DRIVE_RECIPHER_ENABLED=true
- DRIVE_RECIPHER_EXPIRES_AT: ISO UTC futuro de como maximo una hora.
- DRIVE_RECIPHER_TARGET_KEY_ID: identificador exacto de la AES elegida.
- DRIVE_TOKEN_ACTIVE_KEY_ID: mismo identificador, para la simulacion.
- DRIVE_RECIPHER_MODE=preview (predeterminado).

Para un commit deliberado se requieren AMBOS DRIVE_RECIPHER_MODE=commit y
DRIVE_REKEY_ENABLED=true, ademas de todas las puertas anteriores.

El resultado contiene solo contadores y un codigo fijo. Nunca contiene UUID,
cursor, token, clave o ciphertext. El lote es de como maximo 25 conexiones;
conflictos, errores o hasMore=true implican resultado INCOMPLETE, no una
migracion total. No reintentar un conflicto sin releer el estado actual.

Incluso un commit correcto termina el build con salida NO CERO: eso impide
crear una app Ready o un rollback publico con el ejecutor. No promoverlo.
Una respuesta correcta a esta operacion no prueba entrega de notificaciones
ni que Workers ya pueda renovar todos los grants.

## Verificacion final

- Repetir el inventario completo de Drive desde un lector con ambas claves.
- Confirmar cero legacy, cero ilegibles y el conteo esperado de conexiones.
- Probar refresh y listado autorizado en Workers sin devolver tokens.
- Crear y restaurar un backup posterior; conservar el keyring recuperable.
- No retirar la clave anterior ni cambiar el sitio/cron antes de cerrar los
  callbacks, proveedores y transicion de sesiones del nuevo origen.
