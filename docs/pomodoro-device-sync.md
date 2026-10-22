# Pomodoro entre dispositivos

Usa la misma cuenta de Estudiemos en PC, tablet y celular. Iniciar, pausar,
cambiar duraciones o cantidad de bloques, saltar de estudio a descanso y ajustar
el aro actualizan una sola sesion compartida.

## Como funciona

- Se utiliza el almacenamiento privado de la cuenta ya existente en Supabase.
  No hay un servicio nuevo, pagos, claves adicionales ni migraciones.
- Solo se publica un control cuando cambia la sesion. No se envia el reloj
  cada segundo. Cada pantalla calcula el restante desde la misma hora de fin.
- Los avisos de sincronizacion existentes entregan los cambios; la consulta
  periodica y la reentrada a la app recuperan cambios si se pierde un aviso.
  No se garantiza entrega instantanea ni mientras una app esta suspendida.
- La revision del control, no la fecha de un cambio en el calendario o en las
  estadisticas, decide que Pomodoro es mas reciente.
- La cuenta se hidrata antes de publicar el reloj. Un temporizador guardado
  de un dispositivo suspendido no reemplaza automaticamente al compartido.
- El volumen y sonido de alarma, la posicion de ventanas y el diseno siguen
  siendo locales a cada dispositivo.
- Las pantallas remotas son observadoras: no vuelven a acreditar minutos
  pendientes del dispositivo que controla la sesion. Al cambiar de controlador,
  el anterior cierra el tramo al recibir el cambio si se conserva su revision.
  Si el dispositivo controlador permanece cerrado, su progreso pendiente puede
  no quedar registrado hasta que vuelva a conectarse.
- No se cambia el funcionamiento independiente de los widgets nativos cerrados.
  El widget Android recibe el reloj compartido al sincronizar la app abierta.
  Esta entrega sincroniza las apps y el temporizador flotante de la app.

Los cambios requieren conexion para llegar al resto. Al volver a abrir la app,
se recupera el control compartido mas reciente. Sin cuenta, el Pomodoro sigue
siendo local. Cerrar sesion o cambiar de usuario limpia el reloj privado.

## Verificacion

- `node --test tests/pomodoro-device-sync.test.js tests/pomodoro-sync.test.cjs`
- `node tests/pomodoro-device-sync.smoke.cjs`: dos contextos independientes,
  interfaz y cuenta reales con autenticacion, nube y avisos simulados.
- Pendiente la comprobacion fisica conjunta en los dispositivos de Ian.
