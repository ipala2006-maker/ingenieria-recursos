# Entrada Rapida De Notas

- En el nombre de una nota, Enter guarda con la validacion habitual. En la ventana de nota rapida tambien cierra el formulario.
- Shift+Enter guarda y prepara otra entrada. Conserva fecha (o ausencia de fecha), color y configuracion del horario. El nombre y el detalle quedan vacios.
- El boton con lista y signo mas hace lo mismo en pantallas tactiles. Tiene nombre accesible y no necesita teclado fisico.
- Una alarma pertenece a su tarea: al seguir con otra nota rapida no se copia ni se vuelve a pedir permiso automaticamente.
- En el calendario se puede seguir creando actividades del mismo dia o varios horarios repetitivos. Editar y seguir guarda la actividad original y prepara una nueva con ID distinto.
- IME/composicion y Enter mantenido no crean notas duplicadas; entradas vacias o fechas invalidas no guardan ni cierran el editor. En los campos de detalle, Enter y Shift+Enter conservan su comportamiento de texto normal.

## Verificacion

`node tests/note-entry.smoke.cjs` usa datos locales aislados y comprueba las tres superficies a 1440, 390 y 320 px. `TEST_WEBKIT=1` repite con WebKit; no equivale a probar un iPhone fisico.

`node tests/optional-note.smoke.cjs` mantiene las combinaciones anteriores de fecha, alarma y color. No se modifican cuentas, tareas o permisos reales al ejecutar estas pruebas.
