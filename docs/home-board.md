# Inicio adaptable

En escritorio, cada herramienta tiene posicion y tamano independientes dentro
de una sola pantalla. Los espacios vacios se conservan: ocultar o achicar un
apartado no agranda sus vecinos. Las listas largas conservan su desplazamiento
interno para no ocultar tareas o archivos.

- El icono de personalizacion activa la edicion directamente.
- La esquina inferior derecha cambia solo el tamano de esa herramienta.
- El agarre superior mueve la herramienta libremente. Las guias alinean bordes
  cercanos; Alt desactiva esa ayuda. Las herramientas no se superponen: una
  posicion ocupada se marca con borde discontinuo y se cancela al soltar.
- Tambien se puede seleccionar el agarre y tocar un espacio vacio para mover
  la herramienta alli, sin mantener presionado el puntero.
- Escape cancela el movimiento actual. Deshacer recupera el ultimo ajuste.
- Herramientas permite mostrar u ocultar apartados; Listo termina la edicion.
- Los agarres admiten flechas de teclado (8 px; Shift, 1 px). Herramientas
  permite editar posicion y dimensiones numericamente, sin arrastrar.
- En pantallas angostas se mantiene navegacion movil y ajuste de alto.

`shared/home-board.js` conserva el arbol anterior para migracion y restablecer;
calcula tambien posiciones libres, limites, colisiones y alineacion.
`scripts/home-customizer.js` aplica los cambios en cada frame del arrastre.
La preferencia version 4 se guarda en `estudiemos_home_layout`, con `placement`
(ancho y alto de referencia, rectangulos de todas las herramientas). Se escala
proporcionalmente en otras pantallas sin compactar los huecos. La sincronizacion
existente de preferencias conserva ese objeto. No se cambia la base de datos.
Las preferencias v3 mantienen su aspecto hasta el primer ajuste. Ocultar guarda
la posicion; volver a mostrar busca el hueco libre mas cercano. Si no cabe, no
se alteran las otras herramientas y se indica que falta espacio.
En movil se conserva la navegacion apilada y el alto independiente, sin borrar
la distribucion de escritorio. Se respeta el movimiento reducido del sistema.

Pruebas: `node --test tests/home-board.test.cjs tests/home-free-layout.test.cjs`,
`node tests/home-board.smoke.cjs`, `node tests/home-adaptable.smoke.cjs`.
