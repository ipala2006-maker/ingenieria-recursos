# Pomodoro y organizador 3D - 2026-09-10

## Cambios

- Inicio: empezar/pausar y reiniciar juntos. Ajuste de minutos junto al reloj, sin modificar la geometria del aro ni el motor del temporizador.
- Tu sesion: presets con duraciones, valores grandes, botones de incremento/decremento con pulsacion sostenida, total de estudio y secuencia de bloques. Alarma desplegable, interruptor de continuidad y cierre con Listo o Atras.
- Organizador: tres piezas reales de Three.js con iconos existentes de Inbox, calendario y archivos. Movimiento continuo moderado, arrastre para rotar/desplegar, activacion de la herramienta mediante clic/toque y controles de teclado.
- Pausa de movimiento persistente en el dispositivo. Se detiene al ocultarse la pagina o el modelo, durante la configuracion y al interactuar. Respeta movimiento reducido y ahorro de datos; los enlaces normales siguen disponibles sin WebGL. La vista horizontal de altura muy baja conserva el formulario sin el modelo.
- Corregido un toque que podia abrir un segundo panel: la navegacion del modelo espera al clic, no cambia el contenido debajo del dedo en pointerup.

## Verificacion

- `tests/focus-motion.smoke.cjs`: Chrome/WebKit en 1440x900, 390x844 y 320x568. Pixeles no vacios, cuadros diferentes durante movimiento, pausa real, arrastre, teclado, toque y destino real. Ajustes, pulsacion sostenida, limites, escritura sin sobrescritura, alarma, volumen, inicio/pausa/reinicio y preferencia persistente.
- `tests/home-console.smoke.cjs`: nueve tamanos, distribucion sin desplazamiento de pagina, controles alcanzables, temas claro/oscuro, historial, listas largas y cambio de orientacion.
- `tests/product-ui.smoke.cjs`: sincronizacion entre inicio y panel Pomodoro, configuracion, alarma, IA, calendario, Inbox, archivos, temas y movimiento reducido.
- `tests/depth-interactions.smoke.cjs`: precision del aro, cancelacion, teclado, tacto, grafico y alternativa sin WebGL.
- Pruebas unitarias de planes, referidos, seguridad y estado de estudio; revision de dependencias con OSV y secretos en archivos versionados.
- Las pruebas usan cuentas y contenido simulados, sin mensajes de IA, cobros, correos ni modificaciones a cuentas reales.

## Alcance

Cambio web. No requiere reinstalar ni generar otra APK: recargar la app o usar Perfil > Actualizar carga la interfaz publicada. No modifica los widgets nativos, permisos, autenticacion, pagos ni reglas de acceso.

WebKit es una comprobacion del motor de Safari, no una prueba en un iPhone fisico. Los resultados no constituyen una garantia absoluta de ausencia de errores ni una auditoria integral de seguridad.
