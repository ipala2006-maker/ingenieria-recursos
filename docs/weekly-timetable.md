# Mi semana

- Abrir **Mi semana** desde el icono de calendario de la barra superior o desde Inbox.
- Escribir la materia/actividad, seleccionar todos sus dias y elegir inicio y fin. El lugar y el color son opcionales.
- Cada horario se repite en la semana habitual sin crear cientos de notas ni alarmas. Una misma materia con horas diferentes puede tener varios horarios.
- El lapiz cambia el horario en todos sus dias. La papelera elimina ese horario, sin tocar otros horarios de la misma materia ni fechas puntuales.
- Las actividades con fecha y las alarmas siguen en Calendario e Inbox. Los datos anteriores no se migran ni eliminan automaticamente.
- En computadora se ven los siete dias. En pantallas pequenas se elige el dia en las pestanas.
- `bandeja_horarios` forma parte de la sincronizacion privada existente de la cuenta. Usa el mismo control de propietario y limpieza al cerrar sesion. Sin sesion queda solo en el dispositivo.
- No requiere IA, servicios nuevos, pagos, permisos adicionales ni migracion de base de datos.

## Calendario integrado

- Los mismos horarios aparecen en las vistas Dia, Semana y Mes del calendario y en el detalle de Inbox, conservando el color elegido y la etiqueta Horario fijo.
- El boton + del calendario permite elegir Anotacion con fecha u Horario fijo. La anotacion usa el dia seleccionado, sin activar una alarma automaticamente. Las fechas y alarmas siguen siendo opcionales en las anotaciones normales de Inbox.
- El selector Todo / Horarios fijos / Anotaciones cambia solo la vista; no modifica ni borra datos. Colores muestra la referencia de cada materia y los tipos de actividades puntuales.
- Editar horario abre el horario original de Mi semana. Guardar o eliminar se refleja en todos los dias, dispositivos y calendarios web, incluidos los widgets de escritorio, sin duplicar tareas ni generar alarmas.
- Los horarios son proyecciones locales de hasta 62 dias por vista. Nunca se guardan como notas fechadas ni se completan como pendientes.
- Las alarmas de tareas y los recordatorios del objetivo diario no se modifican en esta integracion.

## Verificacion

`node --test tests/timetable.test.js` valida limites, horas, dias, superposiciones y el contrato de sincronizacion.

`node tests/timetable.smoke.cjs` prueba crear varios dias, editar, borrar, recargar, contenido como datos y cambio de cuenta, en 1440/1024/390/320 px, oscuro y claro. `TEST_WEBKIT=1` ejecuta el mismo recorrido en WebKit.

`node tests/calendar-timetable.smoke.cjs` recorre proyecciones, colores, filtros, crear y editar desde el calendario, fecha de la anotacion, cambios en vivo, Inbox y widget PC. `TEST_WEBKIT=1` prueba WebKit; `TEST_BASE_URL` permite probar la publicacion con APIs simuladas, sin cuentas reales.
