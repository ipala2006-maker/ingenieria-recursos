# Ajuste de herramientas y revisión visual

## Comportamiento

- Agregar una herramienta no requiere confirmar un reacomodamiento: se busca un hueco, se adapta el tamaño, se divide un panel que tenga espacio y solo al final se usa una distribución compacta.
- Se conservan los huecos y las posiciones de los demás paneles cuando es posible. Quitar una herramienta deja su espacio libre.
- Los ocho bordes y esquinas mantienen el lado opuesto anclado. Al encontrar un vecino, el ajuste se limita progresivamente en lugar de descartar el movimiento entero.
- El botón de quitar aparece solo en modo de edición. No desactiva funciones ni borra datos; modifica únicamente la visibilidad en este dispositivo.
- La barra de edición se mantiene disponible en las distintas vistas móviles. Quitar, agregar y ajustar pueden deshacerse.

## Diseño y movimiento

`styles/surface-motion.css` comparte niveles de elevación, bordes y luz entre paneles y ventanas. No agrega escenas 3D, bucles de animación, peticiones ni dependencias.

Las transiciones nativas de apertura y cierre se habilitan solo si el navegador admite `transition-behavior` y `overlay`. Los demás navegadores conservan el comportamiento anterior. El movimiento reducido sigue teniendo prioridad. Las alarmas de interrupción a pantalla completa y el recorrido inicial quedan fuera de estas transiciones.

El ajuste del escritorio usa animaciones de posición y escala al reacomodar, pero sigue directamente al cursor o dedo durante el arrastre. Un gesto cancelado vuelve a la posición anterior sin guardarse.

## Verificación

- Pruebas puras: huecos pequeños, división mínima de vecinos, redistribución compacta, inserción/restauración repetida de todas las herramientas, geometría inválida y límites de los ocho bordes.
- Inicio: primer ingreso, agregar en un panel lleno, quitar Inbox sin perder tareas, deshacer y persistencia por dispositivo.
- Táctil: gestos reales de Chrome, cancelación, rotación, cuatro bordes e independencia entre el control de mover, quitar y el borde superior en tablet.
- Recorrido visual: anotación, calendario ampliado, sesión y temporizador, Amigos, Cátedras, cuenta, edición, Drive e instalación en 1440, 1024, 768, 390 y 320 px; claro, oscuro y movimiento reducido.
- Cátedras: pruebas HTTP y SQL locales de roles, permisos, archivos, conflictos e invitaciones.

Las comprobaciones locales no modifican cuentas reales ni solicitan permisos de notificaciones. La emulación Chrome/WebKit no sustituye una comprobación posterior en cada modelo físico de teléfono o tablet. No se modifica la autenticación, los binarios de Windows/Android ni el acceso a archivos de Google.

```powershell
node --test tests/home-auto-fit.test.js tests/home-board.test.cjs tests/home-free-layout.test.cjs tests/touch-layout.test.js
node tests/home-starter.smoke.cjs
node tests/touch-layout.smoke.cjs
# Con el servidor local de revisión en 127.0.0.1:8183:
node tests/ui-flow.smoke.cjs
$env:TEST_WEBKIT='1'
node tests/ui-flow.smoke.cjs
```
