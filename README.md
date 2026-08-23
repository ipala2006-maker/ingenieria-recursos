# Estudiemos

Aplicación de productividad para organizar archivos, Inbox, calendario y sesiones de estudio.

Sitio público: [https://estudiemos-app.vercel.app](https://estudiemos-app.vercel.app)

## Estructura

- `index.html`: página principal.
- `scripts/workspace.js`: espacio privado de carpetas y archivos.
- `data/data.js` y `pages/`: contenido educativo anterior conservado para no romper enlaces existentes.
- `scripts/`: espacio personal, Inbox, calendario, cuenta, temporizador y navegación.
- `styles/`: estilos visuales.
- `pdfs/`: material descargable.
- `android-app/`: soporte Android para los widgets nativos de Inbox y calendario.

El proyecto usa HTML, CSS y JavaScript sin framework ni dependencias. Vercel publica los archivos estáticos y ejecuta funciones pequeñas para los asistentes inteligentes.

## Seguridad

- `vercel.json` agrega headers de seguridad para proteger la página publicada.
- `.gitignore` evita subir archivos locales sensibles como `.env` o `.vercel`.
- `SECURITY.md` resume las reglas simples para mantener el proyecto seguro.
- GitHub y Vercel deben mantenerse con verificación en dos pasos activada.
- La clave de Gemini se usa únicamente en las funciones de `api/` y debe guardarse como variable secreta de Vercel.

## Ejecutar localmente

No hace falta instalar paquetes ni generar un build.

1. Abrir una terminal en la carpeta del proyecto.
2. Ejecutar `python -m http.server 8000`.
3. Abrir `http://localhost:8000` en el navegador.

## Build

No existe un paso de build. Vercel publica directamente los archivos del repositorio.

Antes de publicar, se puede comprobar la sintaxis de JavaScript con:

```powershell
Get-ChildItem scripts -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Publicación en Vercel

Configuración del proyecto:

- Framework Preset: `Other`.
- Root Directory: `./`.
- Install Command: vacío.
- Build Command: vacío.
- Output Directory: vacío.
- Production Branch: `main`.

Vercel está conectado al repositorio de GitHub. Cada cambio enviado a `main` inicia automáticamente una nueva publicación.

## Asistentes inteligentes

La interpretación natural de órdenes usa Gemini desde `api/agenda-ai.js` y `api/workspace-ai.js`. La clave nunca se envía al navegador. El asistente del espacio personal recibe solamente nombres, tipos y ubicaciones; no recibe el contenido de los archivos y muestra un plan antes de mover o renombrar elementos.

Variables de Vercel:

- `GEMINI_API_KEY`: requerida. Se crea en Google AI Studio.
- `GEMINI_MODEL`: opcional. Por defecto se usa `gemini-3.5-flash-lite`.

Para configurarla: Vercel → proyecto Estudiemos → Settings → Environment Variables. Agregar `GEMINI_API_KEY` para Production y volver a desplegar el último commit.

El archivo `.env.example` muestra los nombres esperados sin contener secretos reales.

## Cuentas y sincronización

Las cuentas usan Supabase Auth y tablas privadas protegidas con Row Level Security. Se sincronizan Inbox, el calendario, las preferencias y el tema visual. Los archivos se guardan aparte en almacenamiento privado para que sigan disponibles en todos los dispositivos.

Configuración inicial:

1. Crear un proyecto gratuito en Supabase.
2. Abrir **SQL Editor**, pegar el contenido de `supabase/schema.sql` y ejecutarlo una vez.
3. En el mismo editor, ejecutar `supabase/workspace.sql` para crear el espacio privado de archivos y sus reglas de acceso.
4. En **Authentication → URL Configuration**, usar `https://estudiemos-app.vercel.app` como Site URL y agregar `https://estudiemos-app.vercel.app/**` a Redirect URLs.
5. Copiar la Project URL y la Publishable key desde **Project Settings → API Keys**.
6. En Vercel agregar para Production las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
7. Volver a desplegar el último commit.

La Publishable key está diseñada para usarse en el navegador y queda limitada por las políticas de la tabla. No se debe usar ni publicar una Secret key o `service_role`.

Los archivos se guardan en el bucket privado `workspace-files`, con un máximo de 50 MB por archivo. Cada ruta comienza con el ID de la cuenta y las políticas RLS impiden acceder a archivos de otra persona.

### Registro administrativo de usuarios

El archivo privado de Google Sheets puede mostrar un registro de cuentas en una hoja llamada `Usuarios`. La fuente real sigue siendo Supabase Auth y solamente se exportan ID, correo y fechas de registro, confirmación y último acceso. Nunca se exportan contraseñas, agenda ni recursos guardados.

- `supabase/user-registry.sql` crea una copia administrativa bloqueada y una exportación protegida por un token privado.
- `api/user-registry.js` entrega el registro como CSV para la función `IMPORTDATA` de Google Sheets.
- El token de exportación se guarda únicamente en la hoja privada y no debe publicarse ni agregarse al repositorio.

## Widgets de Android

La PWA instalada desde Chrome sigue siendo la aplicación principal. Como Android no permite que una PWA cree widgets del sistema por sí sola, la carpeta `android-app/` contiene un complemento nativo liviano que habilita tres widgets:

- **Inbox:** muestra únicamente tareas, parciales, exámenes, entregas y trabajos pendientes, incluso cuando no tienen fecha.
- **Calendario académico:** muestra únicamente clases que tengan hora de inicio y hora de finalización.
- **Racha de estudio:** registra presencia al completar 25 minutos de Pomodoro, muestra la actividad de los últimos siete días y abre el temporizador al tocarlo.

Cada cambio relacionado con Android genera un APK de prueba en GitHub:

1. Abrir la pestaña **Actions** del repositorio.
2. Entrar en la ejecución **Build Android app** más reciente.
3. Descargar el archivo **Estudiemos-Android** en la sección de artefactos.
4. Descomprimirlo e instalar `app-debug.apk` en Android.
5. Abrir el perfil dentro de la aplicación y, en **Widgets de Android**, elegir **Inbox**, **Calendario** o **Racha**. Android mostrará la confirmación para colocarlo en la pantalla de inicio.
   Si el teléfono no admite esa confirmación directa, mantener presionada la pantalla de inicio, elegir **Widgets** y buscar **Estudiemos**.
6. Abrir Estudiemos desde Chrome o desde la PWA instalada.
7. Entrar en Inbox y tocar **Widgets** cada vez que se quieran enviar Inbox, el calendario y la racha desde la PWA a los widgets del teléfono.

Los datos se copian localmente entre la PWA y los widgets. La racha también se sincroniza entre dispositivos cuando el usuario inició sesión. Desde la configuración del Pomodoro se puede activar un único recordatorio diario a las 20:00; nunca se envía si la presencia del día ya está completa. Los cambios visuales de la web llegan sin reinstalar; los cambios del código Android requieren instalar un APK nuevo.

El widget **Inbox** usa una lista desplazable: muestra todas las tareas pendientes y permite marcarlas como hechas directamente, sin el límite anterior de tres elementos.

## Widgets de escritorio

En Chrome y Edge para computadora, el perfil incluye **Widgets de escritorio**. Inbox, calendario y racha se abren en una ventana compacta ajustable que permanece encima de las demás ventanas mientras el navegador está abierto. Los tres comparten los datos de la cuenta y se puede cambiar de vista desde la misma ventana.

Windows 11 también está preparado con tres widgets nativos para su panel de Widgets:

- **Inbox:** cantidad y próximas tareas pendientes.
- **Calendario:** próximas anotaciones académicas.
- **Racha:** progreso diario y acceso al Pomodoro.

La integración vive en `site.webmanifest`, `widgets/` y `service-worker.js`, usando las Adaptive Cards requeridas por Windows. Los datos se copian al service worker cuando cambia Inbox, el calendario o la racha.

Para probar los widgets nativos durante el desarrollo se necesita Windows 11, WinAppSDK y Modo de desarrollador. Para que cualquier usuario pueda agregarlos sin esa preparación, Estudiemos debe publicarse como PWA en Microsoft Store mediante PWABuilder y una cuenta de Microsoft Partner Center. La ventana compacta continúa disponible sin ese trámite.

## Descarga permanente

La página [https://estudiemos-app.vercel.app/instalar.html](https://estudiemos-app.vercel.app/instalar.html) es el punto único para instalar Estudiemos. El botón Android usa siempre la dirección permanente `android-latest`; cada compilación nativa reemplaza el APK anterior sin cambiar el enlace. Los cambios solamente web se actualizan automáticamente y no requieren reinstalar la aplicación.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
