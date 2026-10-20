# Actualizaciones Android

## Flujo

En **Perfil > Actualizar Estudiemos**, la app descarga el APK oficial con
DownloadManager. Muestra progreso, espera de conexion, permiso y errores.
Android abre su instalador al terminar: el usuario confirma **Actualizar**.
No se desinstala, no se pierde la cuenta y no se omite la seguridad de Android.

Desde 1.6.5 (33), el seguimiento consulta el estado de la descarga propia,
sin depender de que llegue un broadcast. Su identificador se conserva durante
rotaciones o cierres; al volver a la app se revisa y abre el instalador si termino.
Las consultas de progreso paran con la app fuera de pantalla. La descarga sigue
a cargo del sistema; la app no abre instaladores mientras esta en segundo plano.

## Recuperacion de versiones anteriores

El perfil web muestra **Descarga alternativa para Android** al pedir actualizar,
tambien dentro de APKs anteriores. El enlace abre el APK oficial en el navegador,
solo al tocarlo. No hay redireccion automatica ni espera infinita por una
confirmacion de inicio sin progreso.

Puede ser necesario usar esa alternativa una vez para instalar 1.6.5 sobre una
version cuyo actualizador nativo estaba trabado. Las actualizaciones siguientes
usan el flujo interno corregido.

## Pruebas

- `node --test tests/android-update.test.js`: progreso, error, permiso denegado,
  puente antiguo o ausente, tiempo de espera, doble toque y contratos nativos.
- CI Android compila el APK de prueba y el firmado con la clave existente.
- Verificacion fisica pendiente en cada fabricante: permiso aceptado/rechazado,
  descarga sin red, rotacion, volver desde segundo plano e instalador Android.
