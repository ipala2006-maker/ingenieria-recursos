# Widgets: consola adaptable

## Cambios

- PC: los cinco widgets conservan el acceso directo a su herramienta. Relieve, tipografia local, filas de dos lineas y desplazamiento interno estable al refrescar datos.
- Pomodoro: modelo Three.js compartido con el inicio, reloj y botones persistentes. Distribucion horizontal en ventanas anchas y bajas.
- Racha: barras tridimensionales con datos reales, seleccion por dia, teclado, perspectiva arrastrable y restablecimiento. Hoy y semana permanecen visibles.
- Movimiento reducido y ahorro de datos: alternativa sin WebGL. Inbox, calendario y archivos no descargan el motor 3D.
- Android 1.5.5 (23): cinco receptores de cambio de tamano, modo compacto, calendario semanal en filas y mes con conteo de eventos. Los controles y enlaces conservan sus acciones.
- Android utiliza RemoteViews nativas y un aro renderizado del mismo modelo, sin motor 3D activo. El progreso real sigue en el indicador y el Chronometer. Racha dibuja sus barras a partir del historial real.
- No se modificaron credenciales, permisos, cobros, sincronizacion ni registro de sesiones.

## Verificacion local

- `tests/widget-console.smoke.cjs`: cinco tipos por cinco tamanos (260x210 a 640x600), Chrome y WebKit. Geometria, pixeles de canvas, grafico, teclado, reloj, listas, modo reducido.
- `tests/widget-popup.smoke.cjs`: Document Picture-in-Picture real en Chrome; temporizador, actualizacion, cambio de tema, racha y cierre.
- `tests/presentation-widgets.smoke.cjs`: instalacion y ventanas pequenas.
- `tests/depth-interactions.smoke.cjs`: regresion de los modelos compartidos con el inicio.
- `tests/android-widget-layouts.ps1`: XML, recursos, controles compatibles con RemoteViews y cinco manejadores de redimensionado.
- 32 pruebas de planes, referidos, seguridad e inicio.

La revision local no sustituye probar los widgets nativos en un telefono Android. La compilacion firmada se verifica aparte en el flujo existente de GitHub Actions. No hay cambios de firma ni de applicationId.

## Actualizacion

- PC: actualizar la app y recargar los widgets existentes desde su menu. No requiere volver a instalar el soporte de escritorio.
- Android: instalar 1.5.5 sobre la version existente desde Perfil / Actualizar o el enlace permanente de instalacion. No desinstalar.
- iPhone: esta entrega no crea widgets nativos de iOS; Estudiemos sigue siendo una PWA alli.

## Referencia

Adaptacion nativa basada en [layouts flexibles de Android](https://developer.android.com/develop/ui/views/appwidgets/layouts) y sus restricciones de RemoteViews. La semana y el mes utilizan layouts distintos para no depender de metodos remotos no admitidos.
