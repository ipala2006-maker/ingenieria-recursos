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
- `android-app/`: aplicación Android con carga de archivos y widgets nativos.

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

## Organización desde WhatsApp

La integración usa la API oficial de WhatsApp Business como entrada acotada para Inbox y calendario. Acepta texto y notas de voz, muestra un resumen y solamente aplica cambios cuando el estudiante responde `CONFIRMAR`. No funciona como chatbot general y no conserva los audios.

Preparación técnica:

1. Ejecutar una vez `supabase/whatsapp.sql` desde SQL Editor.
2. En Meta for Developers crear o elegir una aplicación Business, agregar WhatsApp y obtener el número de prueba o definitivo.
3. En Vercel agregar las variables `SUPABASE_SECRET_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_PUBLIC_NUMBER`.
4. Configurar en Meta el webhook `https://estudiemos-app.vercel.app/api/whatsapp-webhook`, usar el mismo valor de `WHATSAPP_VERIFY_TOKEN` y suscribirse al campo `messages`.
5. Volver a desplegar. Desde Perfil, cada estudiante puede generar un código de 15 minutos y enviar el mensaje preparado al WhatsApp oficial.

`WHATSAPP_GRAPH_VERSION` y `WHATSAPP_DAILY_COMMAND_LIMIT` son opcionales. El límite diario predeterminado es 30 órdenes por cuenta. Las claves privadas pertenecen únicamente a Vercel y nunca deben pegarse en HTML, JavaScript del navegador ni GitHub.

El archivo `.env.example` muestra los nombres esperados sin contener secretos reales.

## Planes en vista previa

La pantalla de planes funciona en modo de prueba y todavía no realiza cobros. El plan elegido queda asociado a la cuenta y aplica límites reales: Inicial incluye 250 MB, 20 acciones de IA y 5 órdenes por WhatsApp al mes; Plus incluye 5 GB, 300 acciones de IA y 100 órdenes por WhatsApp; Pro incluye 20 GB, 1.000 acciones de IA y 500 órdenes por WhatsApp. Durante esta etapa se puede cambiar libremente de plan para probar la experiencia. Cuando se integre el sistema de pagos, el cambio manual se reemplazará por el estado de la suscripción.

Para activar los planes en una instalación nueva, ejecutar una vez `supabase/plans.sql` en el editor SQL de Supabase. Esta migración crea el plan por usuario, el consumo mensual y la protección del límite de almacenamiento.

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

La PWA instalada desde Chrome sigue siendo la aplicación principal. Como Android no permite que una PWA cree widgets del sistema por sí sola, la carpeta `android-app/` contiene un complemento nativo liviano que habilita cinco widgets:

- **Inbox:** muestra únicamente tareas, parciales, exámenes, entregas y trabajos pendientes, incluso cuando no tienen fecha.
- **Calendario académico:** abre en la semana actual, muestra las anotaciones de cada día y permite alternar a vista mensual.
- **Temporizador Pomodoro:** muestra el bloque y el tiempo actual, y permite empezar, pausar o reiniciar sin abrir la aplicación.
- **Racha de estudio:** acumula los minutos reales del Pomodoro, registra presencia al llegar a 25 minutos y conserva la actividad de días anteriores.
- **Mi espacio:** muestra las carpetas y archivos principales en una lista y abre directamente el elemento elegido.

Cada cambio relacionado con Android genera un APK de prueba en GitHub:

1. Abrir la pestaña **Actions** del repositorio.
2. Entrar en la ejecución **Build Android app** más reciente.
3. Descargar el archivo **Estudiemos-Android** en la sección de artefactos.
4. Descomprimirlo e instalar `app-debug.apk` en Android.
5. Abrir el perfil dentro de la aplicación y, en **Widgets de Android**, elegir **Mi espacio**, **Inbox**, **Calendario**, **Pomodoro** o **Racha**. Android mostrará la confirmación para colocarlo en la pantalla de inicio.
   Si el teléfono no admite esa confirmación directa, mantener presionada la pantalla de inicio, elegir **Widgets** y buscar **Estudiemos**.
6. Abrir Estudiemos e iniciar sesión una vez. Los widgets se actualizan automáticamente con la misma cuenta.

Los datos se copian localmente entre la PWA y los widgets. La racha también se sincroniza entre dispositivos cuando el usuario inició sesión. Desde la configuración del Pomodoro se puede activar un único recordatorio diario a las 20:00; nunca se envía si la presencia del día ya está completa. Los cambios visuales de la web llegan sin reinstalar; los cambios del código Android requieren instalar un APK nuevo.

El widget **Inbox** usa una lista desplazable: muestra todas las tareas pendientes y permite marcarlas como hechas directamente, sin el límite anterior de tres elementos.

## Widgets de escritorio

En Chrome y Edge para computadora, el perfil incluye **Widgets de escritorio**. Mi espacio, Inbox, calendario, Pomodoro y racha se abren en una ventana compacta ajustable que permanece encima de las demás ventanas mientras el navegador está abierto. Comparten los datos de la cuenta y se puede cambiar de vista desde la misma ventana.

En Windows también aparece **Widgets de escritorio**. Cada botón `+` agrega únicamente el widget elegido. La primera vez descarga un instalador por usuario que no requiere permisos de administrador; reutiliza Rainmeter cuando ya está instalado o prepara una copia portátil aislada. La app comprueba el resultado, repara automáticamente una instalación incompleta y entrega una conexión temporal para que una cuenta ya iniciada no tenga que volver a escribir sus credenciales dentro del widget. Cada widget se puede redimensionar arrastrando su esquina inferior derecha. El paquete `.rmskin` se conserva como alternativa manual.

Windows 11 también está preparado con tres widgets nativos para su panel de Widgets:

- **Inbox:** cantidad y próximas tareas pendientes.
- **Calendario:** próximas anotaciones académicas.
- **Racha:** progreso diario y acceso al Pomodoro.

La racha incluye una métrica de tiempo real: en la aplicación se puede alternar entre los últimos 7 y 30 días, y los widgets muestran el total semanal junto con un gráfico compacto. Los widgets de escritorio instalados con Rainmeter se pueden achicar o agrandar desde los controles discretos que aparecen al pasar el mouse.

La integración vive en `site.webmanifest`, `widgets/` y `service-worker.js`, usando las Adaptive Cards requeridas por Windows. Los datos se copian al service worker cuando cambia Inbox, el calendario o la racha.

Para probar los widgets nativos durante el desarrollo se necesita Windows 11, WinAppSDK y Modo de desarrollador. Para que cualquier usuario pueda agregarlos sin esa preparación, Estudiemos debe publicarse como PWA en Microsoft Store mediante PWABuilder y una cuenta de Microsoft Partner Center. La ventana compacta continúa disponible sin ese trámite.

## Descarga permanente

La página [https://estudiemos-app.vercel.app/instalar.html](https://estudiemos-app.vercel.app/instalar.html) es el punto único para instalar Estudiemos. El botón Android usa siempre la dirección permanente `android-latest`; cada compilación nativa reemplaza el APK anterior sin cambiar el enlace. Los cambios solamente web se actualizan automáticamente y no requieren reinstalar la aplicación.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
