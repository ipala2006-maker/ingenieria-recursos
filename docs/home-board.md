# Inicio adaptable

En escritorio, el inicio reparte una sola pantalla entre las herramientas
visibles. No agrega altura a la pagina cuando se agranda una herramienta:
sus vecinas ceden espacio. Las listas largas conservan su desplazamiento
interno para no ocultar tareas o archivos.

- El icono de personalizacion activa la edicion directamente.
- Arrastrar una separacion o esquina cambia el reparto sin saltos de celdas.
- El agarre superior mueve la herramienta al lugar de otra; ambas intercambian
  posiciones. Escape cancela el movimiento actual.
- Herramientas permite mostrar u ocultar apartados; Listo termina la edicion.
- Los agarres y separadores admiten flechas de teclado.
- En pantallas angostas se mantiene navegacion movil y ajuste de alto.

`shared/home-board.js` calcula limites y posiciones con un arbol de divisiones.
`scripts/home-customizer.js` aplica esos limites en cada frame del arrastre.
La preferencia version 3 se guarda en `estudiemos_home_layout`, manteniendo las
herramientas ocultas y la densidad de versiones anteriores. Los tamanos rigidos
anteriores se reemplazan por el reparto inicial adaptable. Se respeta la
preferencia del sistema para reducir animaciones.

Pruebas: `node --test tests/home-board.test.cjs`,
`node tests/home-board.smoke.cjs`, `node tests/home-adaptable.smoke.cjs`.
