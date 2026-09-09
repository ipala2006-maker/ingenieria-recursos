# Inicio modular - 2026-09-09

## Cambios

- Seis herramientas en una superficie compartida: Pomodoro, progreso, IA, archivos, calendario e Inbox. Relieve contenido y controles estables, con el azul de la marca.
- Escritorio: tres columnas y dos filas. Tableta vertical: dos columnas y tres filas. Celular y ventanas bajas: resumen compacto con navegacion interna.
- La altura disponible se calcula con la barra superior real y las areas seguras del dispositivo. No se desplaza la pagina inicial en los tamanos verificados.
- Las listas largas se desplazan dentro del modulo. No se prometen cientos de archivos o tareas simultaneamente visibles.
- Configuracion Pomodoro en dialogo modal, accesible con teclado y compatible con Atras. Usa los ajustes y el motor existentes.
- Boton Agregar siempre visible en el encabezado de Mi espacio. Inbox ya no recorta a cuatro tareas en escritorio; conserva el limite existente de 500 elementos.
- Grafico Three.js encuadrado segun el espacio del modulo, con seleccion y rotacion existentes. No cambia ni inventa minutos de estudio.

## Verificacion

- `tests/home-console.smoke.cjs`: Chrome y WebKit; 1920x1080, 1440x900, 1366x768, 1024x768, 768x1024, 390x844, 360x640, 320x568 y 844x390. Limites de pagina, modulos sin superposicion, controles visibles y alcanzables, pixeles de barras reales, 35 tareas y 30 carpetas, dialogo/Atras, cambio de orientacion, calendario mensual y tema claro.
- `tests/product-ui.smoke.cjs`: Chrome y WebKit; cuatro tamanos. Ajustes, alarma, temporizador, navegacion, IA, carpetas, Inbox, calendario, temas y movimiento reducido.
- `tests/depth-interactions.smoke.cjs`: Chrome y WebKit; tres tamanos. Arrastre del aro, limites, cancelacion, tacto, seleccion y rotacion de barras, historial sin modificaciones y alternativa sin WebGL.
- 32 pruebas unitarias de planes, referidos, seguridad y estado de estudio.
- Las cuentas son simuladas y aisladas. No se envia IA, SMS, correo ni cobros, ni se modifica informacion real de usuarios.

## Actualizacion y limites

Cambio web; no requiere otra APK ni reinstalar Android, iPhone o PC. La app carga la interfaz publicada al recargar o usar Perfil > Actualizar. No se modificaron los widgets nativos ni su instalacion.

Los ensayos WebKit simulan el navegador de iPhone, no sustituyen una comprobacion fisica de iOS. No es una auditoria de seguridad integral ni una garantia de ausencia absoluta de errores. No se cambiaron permisos, autenticacion, pagos ni reglas de almacenamiento.
