# Piloto cerrado y notificaciones eficientes

## Estado

Los cambios deben pasar CI y activarse en el orden indicado. Las pruebas locales
no demuestran un despliegue, un correo entregado ni una notificacion en un
telefono real. No se contratan servicios ni se modifican planes.

## Cambios

- La web no llama a `widget-push` si el estado guardado no contiene tokens Android.
  Un Android tampoco se despierta a si mismo si sus widgets ya reciben los datos
  por el puente local; los otros Android vinculados siguen recibiendo el aviso.
- La ruta usa el Bearer del usuario, RLS, filtro de su ID y una proyeccion de
  tokens. Nunca lee `select=state` ni acepta tokens de destino enviados por el
  cliente. `excludeToken` solamente omite un destino que ya era de esa cuenta.
- Android 1.6.8 lee agenda y racha por versiones, y reutiliza los deltas de lista
  existentes. El chequeo de objetivo diario pide solo la racha. La reserva de
  15 minutos no cambia; tampoco cambia la apariencia o el horario de las alarmas.
- Una proyeccion privada normaliza las alarmas solo cuando cambia la agenda de
  una cuenta suscrita. Se materializa la proxima ocurrencia por dispositivo y
  zona horaria, con un indice parcial sobre `due_at`.
- El cron no desarma JSON de agendas. Encola hasta 1.000 ocurrencias por tick y
  despacha hasta cuatro lotes de 100, con 10 envios paralelos por lote. Reconoce
  cada lote con una RPC, no una por entrega. En reposo no invoca HTTP.
- Se mantienen anticipo de 30 segundos, identidad nominal, reintentos, leases,
  cancelaciones y expiracion de destinos. Un cambio de zona cancela pendientes
  viejos. Al caducar el ultimo destino se limpia la proyeccion, no las notas.
- Limites explicitos: 5 suscripciones/cuenta, 500 alarmas activas/cuenta, 20.000
  trabajos diarios, tres intentos, ventana de 10 minutos, historial de dos dias.
  Alcanzar el limite diario no detiene la entrega de los trabajos ya en cola.
  No es una cuota comercial ni una garantia de puntualidad.

## Despliegue seguro

1. Respaldar definiciones de las funciones, triggers y cron que se reemplazan.
   No exportar endpoints, tokens, suscripciones o notas a logs publicos.
2. Aplicar `supabase/mobile-notifications-indexed.sql` despues del esquema base.
   Es aditiva, transaccional y conserva la funcion de claim vieja en lotes de 5
   para que el servidor anterior no intente enviar 100 avisos de forma serial.
3. Aplicar `supabase/android-widget-sync.sql`. Es una lectura bajo RLS;
   `auth.uid()` determina la cuenta. No recibe un ID ajeno.
4. Publicar API/web. El nuevo dispatcher conserva el fallback al claim anterior
   solo ante funcion ausente; no vuelve al camino viejo por un error de red.
5. Aplicar `supabase/mobile-notifications-cron.sql` actualizado. Verificar un solo
   cron `estudiemos-mobile-alarms`, habilitado cada minuto, y Vault ya configurado.
6. Compilar/publicar APK firmada 1.6.8 y actualizar los Android del grupo. La
   optimizacion nativa no llega a una APK antigua solo por actualizar la web.
7. Activar y probar el [SMTP externo gratuito](pilot-smtp.md).

Tablas/ayudantes de la cola siguen sin acceso de `anon` o `authenticated`;
solo el servidor tiene las RPC de entrega. La nueva RPC Android no revela
tokens, correos, favoritos ni datos de otra cuenta. No borrar tablas personales
para retroceder: restaurar API/cron compatibles, no revertir datos del usuario.

## Entorno reproducible, sin trafico real

```
npm ci --ignore-scripts
npm run test:mobile
node tests/notification-capacity.bench.cjs
node tests/launch-audit.smoke.cjs
```

PGlite ejecuta SQL real en una base efimera. HTTP, SMTP y Web Push estan simulados;
no se envian alarmas, correos ni carga a produccion. El benchmark falla si el cron
recurre al parser de agendas o el plan de consulta en reposo no usa el indice.
La prueba de cola simula 1.500 destinos con la misma hora y verifica que todos
se consumen antes de vencer. No mide latencia de Apple, CPU de Supabase ni SLA.

## Grupo de amigos

Primero 10-20 personas durante 7 dias; ampliar a 50 solo despues de revisar:

- Registro, confirmacion y recuperacion, sin perder el link de la materia.
- Invitacion, ingreso, roles, PDFs desde Drive y reprogramacion compartida.
- Notas con/sin fecha y alarma; completar, borrar y reprogramar desde otro equipo.
- Android nuevo, iPhone instalado y PC con archivo local conectado: app cerrada,
  zona horaria correcta, cambios entre dispositivos y prueba tras reiniciar.
- Dos alarmas simultaneas por cuenta y un pico acordado con el grupo, sin forzar
  limites ni simular miles de usuarios contra produccion.
- Objetivo diario completado: no emitir recordatorios de estudio obsoletos.
- Cambio de cuenta/offline: no mostrar titulos ajenos ni perder tareas.

No recopilar textos de notas, PDFs, claves o grabaciones de pantalla sin acuerdo
de sus autores. Reportes de fallos pueden usar alias temporales y conteos.

## Metricas y criterio de salida

Usar `supabase/pilot-metrics.sql` desde el panel administrativo: solo devuelve
agregados. Anotar diariamente Usage de Supabase/Vercel, participantes/DAU,
composicion de dispositivos, horas abiertas, DB, egress, invocaciones, CPU,
conexiones Realtime pico, fallos y demora de notificaciones. Separar desarrollo
y despliegues del uso de alumnos. Medir 7 dias completos y proyectar 30 dias.

Mantener al menos 30% de reserva: para 1.000 MAU, promedio total menor a
3,5 MB/MAU/mes de egress y 700 invocaciones Vercel/MAU/mes; para 1.500,
2,33 MB y 467. Son presupuestos, no pronosticos. Tambien revisar CPU (4 h
mensuales de Hobby), DB retenida (500 MB) y conexiones (200 Realtime).
Un presupuesto de una ruta no demuestra que toda la aplicacion entre.

No aprobar por volumen de registros: exigir cero perdidas de tareas o accesos
cruzados, sin regresiones funcionales, latencias aceptables en dispositivos reales
y reservas en todos los limites. Si falla una condicion, no ampliar la cohorte.
No crear automatizaciones, comprar recursos ni efectuar un upgrade automatico.
