# Comprobaciones reales de Cloudflare: 29 de octubre de 2026

La cuenta del titular ingreso en el origen estable de Cloudflare y la UI confirmo
sincronizacion completada. Se verificaron sin editar contenido:

- Listado y actualizacion de carpetas de Drive en Mi unidad.
- Calendario con los horarios existentes y el estado de Pomodoro sincronizado.
- Listado y apertura de una catedra existente, responsable y permisos.

## Firebase

Se encontro una copia local original de la cuenta de servicio ya utilizada.
Se verificaron proyecto, identidad, identificador de clave y material RSA sin
imprimirlos. Google acepto un JWT limitado a firebase.messaging. No se envio un
mensaje durante esta comprobacion.

La misma credencial quedo como FIREBASE_SERVICE_ACCOUNT_JSON en el backend de
Cloudflare. Tiene un respaldo age local con descifrado y comparacion verificados.
No se genero otra clave ni se extrajeron secretos no exportables de Vercel.
La entrega real por FCM desde Workers sigue pendiente.

## CPU: no confundir una prueba sintetica con certificacion

El panel real mostro, para todas las versiones en las ultimas 24 horas, 68
invocaciones y 0 errores de ejecucion. Hubo respuestas 4xx de assets: este cero
no significa que todas las respuestas HTTP hayan sido exitosas.

Al aislar la version 83b0c55b, usada para el acceso y Drive, se observaron:

| Percentil | CPU por ejecucion |
| --- | --- |
| p50 | 4.07 ms |
| p90 | 9.98 ms |
| p99 | 16.93 ms |

La muestra es pequena, no una prueba de carga de 1.000 usuarios. No certifica
un p99 inferior a 10 ms ni el envio de notificaciones a proveedores reales.
Cloudflare documenta rollover de CPU: puede haber percentiles por encima del
limite sin errores. No depender de esa tolerancia para justificar el corte.

El ajuste de este PR inicializa la dependencia CommonJS de Google Drive al
arrancar el Worker, sin esperar a la primera peticion de Drive. Es una hipotesis
acotada para reducir CPU de primera invocacion. No cambia rutas, autorizacion,
almacenamiento, algoritmo de cifrado ni comportamiento de las APIs. Las pruebas
comprueban que inicializar el modulo no requiere secretos ni hace red.

Comparar el panel filtrando la nueva version despues del despliegue; conservar
Vercel y PUSH_DISPATCH_ENABLED=false hasta completar medicion, proveedores,
transicion VAPID y dispositivos instalados.

Referencias:
https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution
https://developers.cloudflare.com/workers/platform/limits/
