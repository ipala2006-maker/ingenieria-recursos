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

## Orden operativo y condiciones de avance

| Paso | Accion | Comprobacion antes de avanzar |
| --- | --- | --- |
| 0 | Mantener Vercel, inventariar nombres/consumidores sin copiar valores; comprobar backup cifrado y restore aislado | Inventario y recuperacion probados, sin secretos en logs |
| 1 | Crear una clave de servidor Supabase adicional y guardarla en Cloudflare y un gestor protegido | Consulta autenticada de piloto; no cambiar JWT signing keys ni sesiones |
| 2 | Agregar un secreto al MISMO cliente Google OAuth, conservando el anterior | Renovar un refresh token existente con el secreto nuevo, sin pedir otro consentimiento |
| 3 | Crear clave del mismo service account Firebase y guardar solo en servidor | Envio a un dispositivo de prueba del mismo proyecto, sin tocar tokens de alumnos |
| 4 | Implementar lectura dual y formato de sobre con version de clave para Drive en un PR dedicado | Pruebas de cifrado, alteracion, proposito/usuario y claves faltantes |
| 5 | Generar nueva clave AES y respaldarla; desplegar primero lectores compatibles en Vercel | TODAS las versiones capaces de escribir tokens entienden ambos formatos |
| 6 | Migrar dentro de Vercel en lotes limitados, con comparacion de version | Cero registros fallidos o pendientes y cero sobreescrituras concurrentes |
| 7 | Validar conexiones desde Workers con nuevo secreto OAuth y nueva AES | Listar, renovar token vencido, subir un PDF de prueba y regresar sin reconectar Drive |
| 8 | Preparar dos generaciones de Web Push, probar recepcion y configurar callbacks/origen final | Cada suscripcion se entrega con la clave que la creo; no mezclar reservas |
| 9 | Cambiar un solo cron y publicar clientes firmados/origen | Auth, invitacion, Drive, alarmas, permisos nuevos y rollback verificados |
| 10 | Retirar credenciales antiguas despues de convivencia y ventana de backups | No quedan lectores/escritores ni copias necesarias dependientes de la AES anterior |

Google permite agregar un secreto nuevo mientras el anterior sigue habilitado:
usar esa rotacion, no eliminar el cliente. Los refresh tokens estan ligados al
cliente; conservar su ID y probar una renovacion real antes del corte.
[Documentacion de Google](https://support.google.com/cloud/answer/15549257?hl=en-GB).
Supabase permite separar claves de API del servidor de las claves de firma de
Auth: [claves de API](https://supabase.com/docs/guides/getting-started/api-keys).

### Contrato del trabajo de recifrado pendiente

No se ejecuta desde el navegador ni se descarga un dump descifrado. El trabajo
legado solo puede transformar `drive_connections.credentials`, con pagina
acotada, destino de clave fijado en entorno y sin tabla/usuario/clave arbitrarios
en el cuerpo de una peticion. Devuelve contadores, no autorizaciones ni claves.

Cada fila se descifra con su proposito `user:<id>` (AAD legado completo:
`estudiemos.drive.v1:user:<id>`) y se vuelve a cifrar manteniendo su identidad
de usuario y el AAD del formato que corresponda. El `UPDATE` compara simultaneamente la version/updated_at y el texto
cifrado leido; si otra renovacion gano, no actualiza y relee en un lote posterior.
Una fila ya migrada no se vuelve a migrar. Un error de autenticacion GCM no se
interpreta como permiso para borrar/reconectar la cuenta. No se registra el error
con su payload. Antes de empezar hay dry-run y prueba con filas ficticias.

La cookie OAuth de diez minutos tambien usa el vault: mantener lectura del
formato anterior hasta vencer consentimientos en curso. No usar el nuevo origen
para recibir callbacks iniciados con cookies del origen viejo.

### Recuperacion y cambio de origen

Un backup previo conserva tokens bajo la clave vieja que solo conoce Vercel.
Conservar ese entorno mientras sea necesario restaurarlo; tras recifrar, generar
y probar una copia nueva recuperable con la AES nueva. No borrar la ultima via
de lectura de respaldos viejos antes de vencer su retencion.

La continuidad de Drive no implica conservar automaticamente la sesion PWA:
el nuevo origen necesita login/permisos propios. No enviar access/refresh tokens
en query strings para intentar trasladar sesiones. La clave age privada de los
backups no se usa como AES de Drive ni se sube a Cloudflare/GitHub.
