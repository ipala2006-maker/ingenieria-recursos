# Fechas y repeticion personalizada

En **Calendario > Programar > Repetir > Personalizar**, elegi el numero y la
unidad: por ejemplo, **Cada 13 Dias**, con una fecha de inicio. Se pueden usar
dias, semanas, meses o anos, con un intervalo entero entre 1 y 999.

- Las semanas permiten elegir varios dias y cuentan desde la semana del inicio
  (lunes a domingo). Por ejemplo, cada dos semanas, lunes y miercoles.
- En meses y anos se conserva el dia original. Las fechas que no existen se
  omiten: el dia 31 no se mueve al mes siguiente, ni el 29 de febrero al 1 de marzo.
- **Hasta una fecha** sigue siendo opcional e incluye el ultimo dia elegido.
- Los horarios anteriores, sus colores y la sincronizacion de cuenta se conservan.
  No se crean cientos de notas: el calendario calcula solo su ventana visible.
- Esto programa actividades de calendario, no nuevas alarmas. La configuracion
  de alarmas de Inbox no cambia.

La validacion de Inicio, Inbox y widgets rechaza fechas imposibles en vez de
convertirlas silenciosamente en otro dia. No borra anotaciones anteriores:
si una fecha previa es invalida, se indica como tal al mostrarla en Inbox.

## Pruebas

- `node --test tests/calendar-custom-repeat.test.js tests/timetable.test.js`
- `node tests/calendar-timetable.smoke.cjs`
- La prueba de interfaz permite `TEST_WEBKIT=1` para el motor de Safari.
- Incluye fechas inexistentes, anos bisiestos, intervalos de 13 dias, semanas
  alternas, meses/anos, cambios de horario de verano, edicion, recarga, colores
  y widget de calendario con datos simulados. No solicita permisos ni modifica
  las alarmas de Windows o los datos reales del usuario.
