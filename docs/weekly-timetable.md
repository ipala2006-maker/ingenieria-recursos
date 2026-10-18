# Horarios dentro del calendario

- El calendario es la unica vista de los horarios. Ya no hay un apartado Mi semana, un tablero semanal duplicado ni un acceso independiente en la barra superior o Inbox.
- **Programar** o el + abre el programador dentro del calendario, junto a su vista, no en una ventana independiente. Actividades / Programar cambia el panel lateral; en celular el editor usa el espacio completo.
- Escribir la materia/actividad, seleccionar todos sus dias y elegir inicio y fin. El lugar y el color son opcionales.
- Se puede elegir **No repetir**, **Cada dia** o **Cada semana**. Una actividad puntual admite todo el dia o inicio y fin; una semanal permite marcar varios dias de una vez. El periodo tiene fecha inicial opcional y, si se activa Hasta una fecha, un ultimo dia incluido. Los horarios antiguos sin limites conservan ese comportamiento.
- La vista previa aparece en el calendario con borde discontinuo y sin guardar. Cancelar, cerrar o cambiar de cuenta descarta esa vista sin modificar datos.
- Cada horario se repite sin crear cientos de notas ni alarmas. Una misma materia con horas diferentes puede tener varios horarios.
- **Editar horario** en el detalle de una actividad cambia el horario en todos sus dias. Su papelera elimina solo ese horario, sin tocar otras materias ni fechas puntuales.
- Las actividades con fecha y las alarmas siguen en Calendario e Inbox. Los datos anteriores no se migran ni eliminan automaticamente.
- **Configurar calendario** abre una lista de configuracion, con el nombre, dias, horas y color de cada horario. No es otra vista del calendario.
- `bandeja_horarios` forma parte de la sincronizacion privada existente de la cuenta. Usa el mismo control de propietario y limpieza al cerrar sesion. Sin sesion queda solo en el dispositivo.
- No requiere IA, servicios nuevos, pagos, permisos adicionales ni migracion de base de datos.

## Calendario integrado

- Los mismos horarios aparecen en las vistas Dia, Semana y Mes del calendario y en el detalle de Inbox, conservando el color elegido y la etiqueta Horario fijo.
- El programador usa inicialmente el dia seleccionado. Una actividad sin repeticion se guarda en la agenda y nunca activa una alarma automaticamente. Las notas sin fecha y las alarmas opcionales de Inbox siguen funcionando como antes.
- Tanto actividades puntuales como repetitivas admiten los cinco colores. El color se conserva en Dia, Semana, Mes, Inbox y widget PC, incluso al completar una tarea desde Inbox.
- Se pueden convertir actividades entre puntuales y repetitivas, guardando ambas listas antes de emitir cambios y revirtiendo fallos de almacenamiento. Si la actividad puntual tiene alarma, se pide quitarla antes de convertirla: no se descarta silenciosamente.
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

`node --test tests/timetable.test.js` valida limites, horas, dias, periodos inclusivos y fechas invalidas, colores, superposiciones y el contrato de sincronizacion.

`node tests/timetable.smoke.cjs` conserva el acceso al recorrido completo del calendario.

`node tests/calendar-timetable.smoke.cjs` recorre actividades puntuales, diarias y semanales; limites del periodo; vista previa no persistida; crear, editar, convertir y cancelar; preservacion de alarmas; colores, filtros, Inbox, limpieza recuperable, cambio de cuenta y widget PC en 1440/1024/390/320 px, claro y oscuro. `TEST_WEBKIT=1` prueba WebKit; `TEST_BASE_URL` permite probar la publicacion con APIs simuladas, sin cuentas reales.
