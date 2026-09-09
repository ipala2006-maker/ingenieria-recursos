# Correccion del aro y profundidad de Inicio

## Causas reproducidas

- El control pasaba de 59 a 1 minuto al cruzar las doce. La conversion angular no conservaba el sentido del arrastre.
- El anillo renderizado usaba una perspectiva y un radio distintos del control plano. Su inclinacion respondia al puntero aunque el indicador no se inclinaba.
- El arco de color tenia una reflexion incorrecta y no terminaba en la misma posicion que el indicador.
- Cancelar el arrastre con Escape tambien cerraba el panel por propagacion del evento.

## Cambios

- Ambos temporizadores comparten geometria en pixeles: radio, centro, indicador y arco coinciden. El control no se inclina; la luz aporta el relieve.
- Indicador continuo durante el arrastre, limites sin salto circular y retorno alineado al invertir el movimiento. El tiempo se guarda al soltar; cancelar no lo modifica.
- Grafico Three.js de la racha, con barras basadas en minutos registrados, seleccion de dias, rotacion acotada por arrastre y restablecimiento de la vista.
- Selector de dias accesible con tacto y teclado, incluido en la vista mensual.
- Accesos conectados de IA a Inbox, Calendario y Mi espacio, y superficies con elevacion en controles, carpetas y calendario.
- Renderizado bajo demanda; escenas liberadas al salir y alternativa 2D con movimiento reducido, ahorro de datos o WebGL no disponible. Los campos de escritura y botones principales no se inclinan.

## Pruebas

`tests/depth-interactions.smoke.cjs` comprueba posiciones del cursor, cruce y retorno por las doce, cancelacion, tacto, preservacion del historial, pixeles de barras reales (no solo el fondo), giro, seleccion mensual, ancho movil, navegacion y movimiento reducido. Chrome y WebKit: 1440x900, 390x844 y 320x568.

En Chrome se usan tambien eventos tactiles de entrada del navegador para arrastrar el aro. No equivale a probar todos los modelos de telefonos fisicos. Las pruebas utilizan datos ficticios aislados y no consumen IA, SMS ni pagos.

Se mantienen las 32 pruebas de planes, referidos, protecciones de API y credito de estudio. El recorrido existente de Inicio se verifica por separado mediante `tests/product-ui.smoke.cjs`.

## Publicacion

Son cambios web compartidos por las aplicaciones. No requieren una nueva version nativa de Android ni reinstalar los widgets de Windows. La descarga permanente conserva Android 1.5.4. No se modificaron cuentas, permisos del sistema, pagos ni claves.
