# Mi espacio en la pantalla de inicio de Android

## Para usarlo

1. Actualiza Estudiemos desde **Perfil > Actualizar**. Se necesita Android 1.6.4
   o posterior. Instala la actualizacion sobre la app existente, sin desinstalarla.
2. Abre **Mi espacio** con tu cuenta de Estudiemos. Si Drive no esta conectado,
   usa **Conectar desde el navegador**, autoriza en Google y vuelve a la app.
3. Elige **Mi unidad** o **Estudiemos** y abre su nivel inicial.
4. Agrega **Mi espacio** desde los widgets de Android o desde tu perfil.

El widget muestra hasta 100 carpetas y archivos del ultimo nivel inicial
consultado. Tocar un archivo o carpeta lo abre en Google Drive. Tocar la cabecera,
el mensaje vacio o el pie abre Mi espacio para consultar y actualizar la vista.
Los widgets que ya estaban agregados se actualizan al abrir Mi espacio.

## Alcance y privacidad

- Es una vista guardada, no una sincronizacion de Drive en segundo plano.
  Se renueva al abrir o actualizar Mi espacio en el nivel inicial. Las busquedas
  y las subcarpetas no reemplazan esa vista.
- Sin conexion se conserva la ultima vista completa. Desconectar Drive o cerrar
  sesion la elimina. Al cambiar de cuenta no se muestran archivos de la anterior.
- Solo se guardan identificadores, nombres, tipo y tamano en preferencias
  privadas de Android. El widget no recibe contenido, correo ni tokens de Google.
- No agrega permisos de Drive, servicios pagos ni almacenamiento de archivos en
  Supabase. El almacenamiento anterior y sus widgets de Windows siguen pausados.

## Verificacion

- `node --test tests/drive-widget.test.js tests/free-release.test.cjs`
- `node tests/android-drive-widget.smoke.cjs`
- CI Android: `:app:testDebugUnitTest :app:assembleDebug` y compilacion firmada
  de publicacion. Las claves de firma permanecen en los secretos de CI.
- Comprobacion fisica pendiente en el launcher de cada dispositivo: actualizar,
  abrir Mi espacio, agregar el widget y tocar una carpeta.
