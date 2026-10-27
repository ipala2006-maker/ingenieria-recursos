# Inicio liviano y Cátedras

## Primera instalación

- Un dispositivo sin historial ni distribución previa empieza con Calendario e Inbox.
- En celular, la primera vista es Inbox. Calendario queda en la navegación inferior.
- El recorrido inicial y la elección del objetivo diario siguen disponibles.
- Si no hay tareas, horarios, fechas de cátedras ni Drive conectado, Inbox muestra la bienvenida. Crear una tarea abre el formulario existente; conectar Drive usa la autorización de Google existente, nunca concede permisos automáticamente.
- Pomodoro y Cátedras se sugieren debajo. Las demás herramientas están en **Herramientas del inicio**.

## Distribuciones existentes

La distribución se conserva por dispositivo. No se reemplazan posiciones, tamaños, huecos ni datos de una instalación anterior. Cátedras empieza oculta para esas instalaciones y puede activarse desde las herramientas.

Al agregar una herramienta se aprovecha primero un hueco libre, adaptando su tamaño. Si no alcanza, se divide un panel que tenga espacio suficiente y, como última opción, se redistribuyen las herramientas sin superponerlas ni agregar desplazamiento a la página. El ajuste se puede deshacer desde el modo de edición.

En el modo de edición, el botón de quitar de cada herramienta la retira solo del inicio: no borra tareas, materias, archivos, tiempos ni preferencias de la herramienta. Se puede recuperar desde **Herramientas** o con **Deshacer**. En celular la barra de edición permanece accesible al cambiar de vista.

## Panel Cátedras

Muestra las materias no archivadas de la cuenta actual. Tocar una abre su detalle existente, con sus fechas, archivos y permisos habituales. **Ver mis cátedras** abre la lista para unirse o crear una.

El panel reutiliza el snapshot privado y los eventos de sincronización ya existentes: no agrega cron, sondeos, suscripciones Realtime ni consultas por materia. Cerrar sesión elimina las filas de esa cuenta. Los nombres se insertan como texto, no como HTML.

## Comprobaciones

```powershell
node --test tests/home-start.test.js tests/home-board.test.cjs tests/home-free-layout.test.cjs tests/home-layout-storage.test.cjs
node tests/home-starter.smoke.cjs
$env:TEST_WEBKIT='1'
node tests/home-starter.smoke.cjs
```

Las pruebas de interfaz usan servidor, usuarios y materias locales ficticias. No publican, envían invitaciones ni conectan cuentas reales de Drive.
