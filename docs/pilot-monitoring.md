# Piloto escalonado: 20, 50 y 100 alumnos

Usar los reportes de Supabase existentes: no agregar un heartbeat por alumno ni
confundir conexiones de PostgreSQL con clientes Realtime. No se activa un plan.

## Paneles privados del proyecto

- Realtime: https://supabase.com/dashboard/project/gxilgicgxhkdjmmyhrdd/observability/realtime
- Auth: https://supabase.com/dashboard/project/gxilgicgxhkdjmmyhrdd/observability/auth
- API: https://supabase.com/dashboard/project/gxilgicgxhkdjmmyhrdd/observability/api-overview
- Consumo: https://supabase.com/dashboard/org/vnnwsinhqgesopxiobgg/usage
- Informe guardado: https://supabase.com/dashboard/project/gxilgicgxhkdjmmyhrdd/observability/6fc7aaf8-8596-467b-8691-0abbdb1278aa

El informe personalizado guardado agrupa solicitudes de conexion Realtime y
solicitudes de Auth. Esos contadores NO son clientes simultaneos ni latencia.
La UI actual no ofrece esas dos tarjetas al personalizar: consultarlas en los
reportes nativos enlazados arriba, en Connected Clients y Auth API Gateway
Response speed/errors. La ventana de 24 horas entra en el plan gratuito; no
habilitar tarjetas que pidan upgrade. El informe personalizado tiene su propio
selector de rango; no mezclar su periodo con el de los reportes nativos.
Registrar diariamente los agregados para poder comparar siete dias: Free no
garantiza una ventana historica de siete dias en Reports.

## Que medir

| Lectura | Interpretacion |
| --- | --- |
| Connected Clients, pico | Conexiones/dispositivos, no personas ni MAU |
| Auth API Gateway Response speed | Latencia del servicio; el promedio no es el p95 |
| Auth API Gateway Response errors | Separar 429/5xx de contrasenas incorrectas y otros 4xx esperados |
| Requests de Auth | Altas, renovaciones y recuperaciones comparten presupuesto |
| Egress y logs del proveedor | Incluir respaldos, clientes nativos y desarrollo, no solo el JSON visible de la app |

Si el panel solo ofrece promedio, registrar promedio y cantidad de muestras.
No rotularlo p95 ni inventar percentiles. Para p95 se necesitan muestras de
latencia del mismo periodo mediante Logs/inspector, sin exportar cuerpos,
contrasenas, correos, tokens ni IPs. Los periodos sin datos son desconocidos, no
pruebas de cero consumo o de latencia perfecta.

## Puertas para avanzar

1. Cohorte 20 durante siete dias, usando PC + Android + iPhone reales.
2. Cohorte 50 solo con sincronizacion, alarmas y recuperacion verificadas.
3. Cohorte 100 al mantener margen y ausencia de perdida de cambios.

Umbrales operativos propuestos, no compromisos del proveedor:

- Avisar al llegar al 70% de las conexiones incluidas; detener la ampliacion al
  85% o si hay rechazos de conexion. Contrastar la cuota del plan en ese momento.
- Revisar Auth si la latencia habitual se duplica o supera 1,5 s; detener la
  ampliacion si supera 3 s sostenidos o hay mas de 1% de 429/5xx con muestra util.
- Mantener al menos 30% de margen del presupuesto mensual proyectado de egress.
- Revisar a diario ultimo backup exitoso y tamano, no solo que el cron exista.
- Ante perdida de tareas, permisos cruzados o alarmas omitidas, no avanzar aun
  cuando los contadores de infraestructura esten en verde.

Registro agregado recomendado: fecha (Buenos Aires), cohorte, dispositivos
activos, pico Realtime, ventana/muestras/latencia de Auth, 429/5xx, egress diario,
bytes del respaldo y resultado de sincronizacion/alarma. Guardarlo en un archivo
privado del piloto, sin datos individuales. No multiplicar MAU por simultaneos.

## Alarmas al reactivar Windows

El foco, pageshow, reconexion y visibilidad reutilizan la misma ruta de cuenta,
con debounce y comprobacion condicional de updated_at. Si no cambio la version
solo vuelve la revision o null; si cambio se solicitan los deltas existentes.
Se comparan revisiones distintas, no solo reloj local, para recuperar tambien
una restauracion o un cliente con reloj atrasado. Se protegen borradores,
conflictos, logout y cambios de cuenta. El aviso no incluye titulos de tareas.

Al abrir de nuevo la app, se hidrata desde el servidor antes de escribir el
archivo local de alarmas. La PC cerrada no recibe cambios nuevos instantaneos:
se actualiza al abrir/enfocar/sincronizar. No se reintroduce el puente oculto.

## Limpieza post-despliegue

`deployment-retention.yml` corre tras una produccion exitosa o manualmente desde
main. Siempre usa codigo de main, nunca el de un PR con secretos, y valida el
commit con la produccion real consultada a Vercel. Conserva la activa y la
produccion READY anterior; no borra durante builds ni si cambia produccion.

Necesita el Secret `VERCEL_CLEANUP_TOKEN`, preferentemente limitado al proyecto
Estudiemos y con vencimiento, y `VERCEL_CLEANUP_ENABLED=true` en variables de
Actions solo despues de configurar y probar el Secret. El permiso de la API puede ser mas amplio que la
operacion de borrado: proteger main, rotar antes del vencimiento y no reutilizar
la credencial personal del CLI. Sin el Secret el workflow falla de forma clara
y no borra nada. No guardar el token en variables publicas, Vercel frontend,
archivos, argumentos ni logs. No activa pagos ni cambia planes.

Fuentes oficiales: https://supabase.com/docs/guides/observability/reports,
https://supabase.com/docs/guides/realtime/reports,
https://vercel.com/docs/git/vercel-for-github.
