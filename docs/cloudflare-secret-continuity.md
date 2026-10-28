# Continuidad cuando los secretos solo existen en Vercel

Estado: plan preparado, NO ejecutado. El titular confirmo el 28/10/2026 que
no conserva copias originales. Mantener Vercel operativo, sin borrar variables,
proyecto, datos cifrados ni conexiones. No pedir claves por chat ni agregar una
ruta que devuelva process.env, aunque tenga un token administrativo.

## 1. Credenciales reemplazables

- Supabase: recuperar URL/clave PUBLICA desde la configuracion publica; crear
  una clave de SERVIDOR adicional por el panel oficial para Cloudflare. No
  regenerar JWT secret, claves de firma de Auth ni invalidar sesiones existentes.
- Google OAuth: conservar client ID. Evaluar agregar/rotar client secret con
  coexistencia en Google, verificando que se mantengan refresh tokens y callbacks
  anteriores. No eliminar el cliente OAuth ni desconectar a todos los usuarios.
- Firebase: nueva clave del MISMO service account con permisos minimos para
  FCM; no conceder Owner ni privilegios de base de datos. Mantener la anterior
  durante rollback y revocarla solo al verificar el nuevo transporte.
- Cron/registro/rate limit: secretos nuevos en destinos autorizados, coordinando
  Vault, consumidores y hojas. Un cambio de cron secreto unilateral cortaria
  avisos; el token de exportacion necesita actualizar tambien su consumidor.
- Turnstile: la clave privada ya configurada en Supabase no necesita moverse.
  Preservar sus controles y agregar el hostname autorizado cuando corresponda.

Las creaciones de credenciales por UI requieren que el titular complete el
paso de generacion/guardado cuando lo pida el proveedor. No almacenarlas solo
en Cloudflare: guardar tambien copia protegida en un gestor independiente.

## 2. Clave de cifrado de Drive: no es intercambiable sin migracion

Los refresh tokens guardados en Supabase no pueden descifrarse con una clave
distinta. Conservar la actual en Vercel es imprescindible mientras se prepara:

1. Un cambio revisado que admita dos claves en Vercel: actual y nueva. La nueva
   se genera y guarda con respaldo seguro, sin exponer la actual.
2. Un trabajo de migracion controlado que se ejecute DENTRO del entorno legado,
   con la clave actual disponible. Descifra cada registro solo en memoria y lo
   vuelve a cifrar con la nueva. No devuelve tokens, claves o texto plano al
   navegador, Cloudflare ni logs. No convertir esto en una API publica de exportacion.
3. Transaccion/actualizacion condicional por version, paginacion, idempotencia,
   rollback y conteo de registros: una actualizacion concurrente no se pisa.
4. Copia cifrada y estrategia de restore antes de tocar registros reales;
   contemplar que los backups viejos necesitan la clave anterior o el entorno
   legado para recuperar sus autorizaciones. Un dump no respalda variables.
5. Tras verificar todas las filas y la lectura en ambos entornos, Cloudflare
   puede usar la nueva clave. Mantener lectura dual durante convivencia y
   retirar la anterior solo al cerrar rollback y la politica de backups.

Este trabajo necesita su propio PR, pruebas con datos ficticios y aprobacion
antes de reescribir autorizaciones reales. Si el entorno legado se pierde antes
de migrar, la alternativa es pedir reconectar Drive; no prometer recuperar el
texto cifrado sin la clave.

## 3. VAPID y permisos PWA

Una nueva clave VAPID no funciona con las suscripciones creadas con la anterior.
El nuevo origen ademas requiere sus propias suscripciones/permisos. Opciones:

- Conservar el despachador legado para las suscripciones viejas durante la
  convivencia, con version/origen de suscripcion y reservas SQL filtradas.
- Registrar las nuevas en el origen nuevo con otro par VAPID. Solo habilitar su
  cola cuando la seleccion de clave por suscripcion este comprobada.

No permitir que dos servidores tomen indistintamente trabajos cifrados para
claves distintas. SKIP LOCKED evita reservas simultaneas, no corrige una clave
equivocada. No borrar suscripciones existentes para simular una migracion exitosa.

## Decision actual

El candidato es verificable y la migracion sigue preparada, pero NO se corta
produccion hasta resolver estos tres frentes. Esto conserva la funcionalidad de
las alarmas, las cuentas y los Drives actuales sin gastos ni extraccion de claves.
