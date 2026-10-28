# Entrega real de notificaciones: estado y ensayo reproducible

28/10/2026. No confundir CPU sintetica con una entrega a un dispositivo.

## Estado comprobado

- El PR #103 midio cifrado y tres fetches de fixture en Workers; no fue una
  entrega real ni una consulta a SQL. p99 sintetico 3,736 ms no certifica el cron.
- Se desplego un Worker de ensayo independiente, sin Supabase, FCM service
  account, credenciales de Drive, datos ni suscripciones de produccion.
- Para el ensayo se generaron claves VAPID y autorizacion NUEVAS, por stdin a
  Wrangler. No se extrajeron ni reemplazaron claves de Vercel.
- Se llego en Chrome al pedido de permiso de notificaciones. El control de
  navegador se detuvo porque no pudo verificar con confianza la pagina activa
  en Windows. No se sorteo esa proteccion ni se confirmo recepcion.
- El Worker se volvio a desplegar con `PROBE_ENABLED=false` y vencimiento cero.
  El asistente local temporal fue cerrado. No queda habilitado un despachador.

| Proveedor o tramo | Resultado real |
| --- | --- |
| Cifrado Web Push / descifrado independiente | Pruebas locales aprobadas |
| HTTP de Workers hacia proveedor de Chrome | Pendiente: no se completo el permiso/ensayo |
| Recepcion por Service Worker / cartel Windows | Pendiente, no certificada |
| Web Push de Safari/iPhone | Requiere dispositivo real y permiso de la PWA instalada |
| FCM nativo Android | Requiere la nueva clave autorizada del mismo service account y equipo de prueba |
| Cola SQL, claim/ACK y pico matutino | Pendiente de credenciales y prueba aislada de extremo a extremo |

## Herramientas preparadas

`node scripts/verify-workers-provider.cjs` despliega SOLO
`estudiemos-provider-probe`, con acceso de ensayo de una hora y secretos
temporales por stdin. Abre un asistente local en `http://127.0.0.1:8192`.
El operador abre el enlace con su boton, acepta el permiso normal del navegador
y envia una unica notificacion de prueba. No se habilitan notificaciones mediante
flags de Chrome ni se usan perfiles o suscripciones ajenos.

La autorizacion viaja por el fragmento, que el cliente retira inmediatamente de
la URL. No se escribe en archivos ni consola. Referrer-Policy es no-referrer,
los logs de URLs estan desactivados y los endpoints privados verifican token,
origen, vencimiento y tamano. La pagina solo recibe la clave VAPID publica.

El servidor informa por separado la aceptacion HTTP del proveedor. Solo un
mensaje del Service Worker activado por un evento push puede marcar la recepcion
en la pagina. `showNotification()` resuelto no prueba que Windows haya mostrado
un cartel visible sobre otras apps: comprobarlo tambien en el dispositivo.
"Finalizar" elimina la suscripcion de ensayo y su registro de Service Worker.
El permiso de notificacion del sitio es independiente y se puede revocar desde
Chrome; no modificar permisos de la app real para limpiar este ensayo.

Al terminar, ejecutar desde esta rama:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.provider.jsonc
```

La configuracion versionada vuelve a dejarlo desactivado. No usar este Worker
como cron, ni apuntar la cola de produccion a el. Si se desea retirarlo por
completo, hacerlo solo despues de guardar resultados y confirmar su nombre.

## Puerta de salida para el hosting

Para cada plataforma guardar fecha, version, cantidad de avisos, HTTP del
proveedor, recepcion en el dispositivo y error/latencia, sin endpoint, tokens,
titulos de tareas ni datos personales. Medir CPU del despachador real con las
credenciales finales y SQL, incluyendo fallos/reintentos. Solo entonces activar
el cron, con reservas por generacion de clave y la ventana de rollback.
