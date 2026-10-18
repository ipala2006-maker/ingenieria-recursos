# Mi semana

- Abrir **Mi semana** desde el icono de calendario de la barra superior, el calendario de Inicio o Inbox.
- Escribir la materia/actividad, seleccionar todos sus dias y elegir inicio y fin. El lugar y el color son opcionales.
- Cada horario se repite en la semana habitual sin crear cientos de notas ni alarmas. Una misma materia con horas diferentes puede tener varios horarios.
- El lapiz cambia el horario en todos sus dias. La papelera elimina ese horario, sin tocar otros horarios de la misma materia ni fechas puntuales.
- Las actividades con fecha y las alarmas siguen en Calendario e Inbox. Los datos anteriores no se migran ni eliminan automaticamente.
- En computadora se ven los siete dias. En pantallas pequenas se elige el dia en las pestanas.
- `bandeja_horarios` forma parte de la sincronizacion privada existente de la cuenta. Usa el mismo control de propietario y limpieza al cerrar sesion. Sin sesion queda solo en el dispositivo.
- No requiere IA, servicios nuevos, pagos, permisos adicionales ni migracion de base de datos.

## Verificacion

`node --test tests/timetable.test.js` valida limites, horas, dias, superposiciones y el contrato de sincronizacion.

`node tests/timetable.smoke.cjs` prueba crear varios dias, editar, borrar, recargar, contenido como datos y cambio de cuenta, en 1440/1024/390/320 px, oscuro y claro. `TEST_WEBKIT=1` ejecuta el mismo recorrido en WebKit.
