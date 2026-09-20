# Inicio adaptable, alarmas y graficos

## Cambios

- Inicio: Personalizar > Ajustar tamanos muestra tiradores en las esquinas.
  Arrastrar ajusta alto y ancho; la grilla reubica las herramientas. Listo
  guarda la distribucion. Las flechas del teclado tambien ajustan el tamano.
- El dialogo conserva visibilidad, ancho y alto por herramienta, y restablecer.
  En celular el ancho es completo y se personaliza el alto por separado.
- iPhone: herramientas legibles en Inicio, navegacion inferior estable y
  pantallas separadas para Mi espacio, calendario e Inbox. Se corrigieron
  escrituras sincronas en ResizeObserver y la transicion del color heredado.
- Progreso: Linea, Barras y 3D, eje Y desde cero en horas, seleccion del dia
  y totales reales. Widgets pequenos redistribuyen controles. Android agrega
  alternancia Linea/Barras por widget, version 1.5.6 (codigo 24).
- IA: el modelo interpreta primero; las reglas simples quedan como respaldo
  acotado si falla. Aclaraciones conservan el contexto pendiente. Una fecha
  valida del modelo no se reemplaza por la primera fecha encontrada en texto.
- Windows 1.6.0: conexion consentida de alarmas independiente de widgets.
  Ver `inbox-alarms.md` para instalacion, privacidad y limites reales.

## Verificacion

- 66 pruebas Node: estado, IA con proveedor simulado, permisos, validacion,
  seguridad, sincronizacion Pomodoro, alarmas y feed Windows con DPAPI.
- Inicio adaptable en Chromium y WebKit: 1440x900, 1366x768, 1024x768,
  390x844, 320x568 y 844x390; redimensionado, persistencia, modos del grafico,
  pixeles del canvas, navegacion movil y ausencia de errores JavaScript.
- 25 combinaciones widget/tamano y fallback con movimiento reducido.
- Personalizacion de inicio y aviso web de alarma.
- Validador nativo Android: 11 layouts y 5 controladores de redimensionado.
- Instaladores Windows compilados con Rainmeter oficial verificado.

No equivale a una prueba en un iPhone fisico ni a escuchar el sonido en otra
PC. No promete alarmas con iOS/Android cerrados. El comprobador Windows requiere
PC encendida, sesion iniciada, sonido habilitado y conexion nativa confirmada.
El feed consulta cada minuto y conserva el ultimo snapshot si no hay Internet.
No se activan planes pagos, anuncios ni servicios nuevos.
