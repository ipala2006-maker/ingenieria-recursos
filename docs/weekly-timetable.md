# Horarios dentro del calendario

- El calendario es la unica vista de los horarios. Ya no hay un apartado Mi semana, un tablero semanal duplicado ni un acceso independiente en la barra superior o Inbox.
- Desde el + del calendario elegir **Horario fijo**. El editor compacto permite guardar y volver directamente al calendario.
- Escribir la materia/actividad, seleccionar todos sus dias y elegir inicio y fin. El lugar y el color son opcionales.
- Cada horario se repite en la semana habitual sin crear cientos de notas ni alarmas. Una misma materia con horas diferentes puede tener varios horarios.
- **Editar horario** en el detalle de una actividad cambia el horario en todos sus dias. Su papelera elimina solo ese horario, sin tocar otras materias ni fechas puntuales.
- Las actividades con fecha y las alarmas siguen en Calendario e Inbox. Los datos anteriores no se migran ni eliminan automaticamente.
- **Configurar calendario** abre una lista de configuracion, con el nombre, dias, horas y color de cada horario. No es otra vista del calendario.
- `bandeja_horarios` forma parte de la sincronizacion privada existente de la cuenta. Usa el mismo control de propietario y limpieza al cerrar sesion. Sin sesion queda solo en el dispositivo.
- No requiere IA, servicios nuevos, pagos, permisos adicionales ni migracion de base de datos.

## Calendario integrado

- Los mismos horarios aparecen en las vistas Dia, Semana y Mes del calendario y en el detalle de Inbox, conservando el color elegido y la etiqueta Horario fijo.
- El boton + del calendario permite elegir Anotacion con fecha u Horario fijo. La anotacion usa el dia seleccionado, sin activar una alarma automaticamente. Las fechas y alarmas siguen siendo opcionales en las anotaciones normales de Inbox.
- El selector Todo / Horarios fijos / Anotaciones cambia solo la vista; no modifica ni borra datos. Colores muestra la referencia de cada materia y los tipos de actividades puntuales.
- Editar horario abre el editor del calendario. Guardar o eliminar se refleja en todos los dias, dispositivos y calendarios web, incluidos los widgets de escritorio, sin duplicar tareas ni generar alarmas.
- Los horarios son proyecciones locales de hasta 62 dias por vista. Nunca se guardan como notas fechadas ni se completan como pendientes.
- Las alarmas de tareas y los recordatorios del objetivo diario no se modifican en esta integracion.

## Limpieza recuperable

- Configurar calendario > Vaciar calendario pide confirmar la limpieza. No se ejecuta nunca al cargar la app, actualizarla ni iniciar sesion.
- Quita todas las anotaciones con fecha y los horarios fijos de esa cuenta. Las notas sin fecha (incluso con alarma propia), racha, objetivo, progreso, amigos y disposicion del inicio se conservan.
- Antes de vaciar se guarda una sola copia privada en `bandeja_calendario_papelera`. Se sincroniza y se limpia al cambiar de cuenta como los demas datos privados. No se publica ni crea permisos nuevos.
- Recuperar ultima limpieza permite restaurar esa copia, incluso tras recargar. Se combinan las entradas por ID conservando las ediciones actuales; si se superan los limites no se descarta contenido silenciosamente. La siguiente limpieza reemplaza la copia anterior.
- La operacion verifica la cuenta antes y despues de sincronizar y revierte fallos parciales de almacenamiento antes de notificar cambios. Una sincronizacion fallida se muestra como pendiente, nunca como exito remoto.

## Verificacion

`node --test tests/timetable.test.js` valida limites, horas, dias, superposiciones y el contrato de sincronizacion.

`node tests/timetable.smoke.cjs` prueba crear varios dias, editar, borrar, recargar, contenido como datos y cambio de cuenta, en 1440/1024/390/320 px, oscuro y claro. `TEST_WEBKIT=1` ejecuta el mismo recorrido en WebKit.

`node tests/calendar-timetable.smoke.cjs` recorre proyecciones, colores, filtros, crear y editar desde el calendario, fecha de la anotacion, cambios en vivo, Inbox y widget PC. `TEST_WEBKIT=1` prueba WebKit; `TEST_BASE_URL` permite probar la publicacion con APIs simuladas, sin cuentas reales.
