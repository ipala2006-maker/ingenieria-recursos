# Estudiemos

Plataforma educativa gratuita para estudiantes de ingeniería.

Sitio público: [https://estudiemos-app.vercel.app](https://estudiemos-app.vercel.app)

## Estructura

- `index.html`: página principal.
- `data/data.js`: carreras, materias, temas y recursos.
- `pages/`: páginas de carreras, materias y temas.
- `scripts/`: buscador, bandeja, agenda, tema y navegación.
- `styles/`: estilos visuales.
- `pdfs/`: material descargable.
- `android-app/`: soporte Android para los widgets nativos de agenda y calendario.

El proyecto usa HTML, CSS y JavaScript sin framework ni dependencias. Vercel publica los archivos estáticos y ejecuta una función pequeña para el asistente inteligente de la agenda.

## Seguridad

- `vercel.json` agrega headers de seguridad para proteger la página publicada.
- `.gitignore` evita subir archivos locales sensibles como `.env` o `.vercel`.
- `SECURITY.md` resume las reglas simples para mantener el proyecto seguro.
- GitHub y Vercel deben mantenerse con verificación en dos pasos activada.
- La clave de Gemini se usa únicamente en `api/agenda-ai.js` y debe guardarse como variable secreta de Vercel.

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

## Asistente inteligente de agenda

La interpretación natural de órdenes usa Gemini desde la función `api/agenda-ai.js`. La clave nunca se envía al navegador.

Variables de Vercel:

- `GEMINI_API_KEY`: requerida. Se crea en Google AI Studio.
- `GEMINI_MODEL`: opcional. Por defecto se usa `gemini-3.5-flash-lite`.

Para configurarla: Vercel → proyecto Estudiemos → Settings → Environment Variables. Agregar `GEMINI_API_KEY` para Production y volver a desplegar el último commit.

El archivo `.env.example` muestra los nombres esperados sin contener secretos reales.

## Cuentas y sincronización

Las cuentas usan Supabase Auth y una tabla privada protegida con Row Level Security. Se sincronizan la agenda, los horarios, favoritos, guardados, materias elegidas, recientes y tema visual. La copia local se conserva para que Estudiemos continúe funcionando sin conexión.

Configuración inicial:

1. Crear un proyecto gratuito en Supabase.
2. Abrir **SQL Editor**, pegar el contenido de `supabase/schema.sql` y ejecutarlo una vez.
3. En **Authentication → URL Configuration**, usar `https://estudiemos-app.vercel.app` como Site URL y agregar `https://estudiemos-app.vercel.app/**` a Redirect URLs.
4. Copiar la Project URL y la Publishable key desde **Project Settings → API Keys**.
5. En Vercel agregar para Production las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
6. Volver a desplegar el último commit.

La Publishable key está diseñada para usarse en el navegador y queda limitada por las políticas de la tabla. No se debe usar ni publicar una Secret key o `service_role`.

### Registro administrativo de usuarios

El archivo privado de Google Sheets puede mostrar un registro de cuentas en una hoja llamada `Usuarios`. La fuente real sigue siendo Supabase Auth y solamente se exportan ID, correo y fechas de registro, confirmación y último acceso. Nunca se exportan contraseñas, agenda ni recursos guardados.

- `supabase/user-registry.sql` crea una copia administrativa bloqueada y una exportación protegida por un token privado.
- `api/user-registry.js` entrega el registro como CSV para la función `IMPORTDATA` de Google Sheets.
- El token de exportación se guarda únicamente en la hoja privada y no debe publicarse ni agregarse al repositorio.

## Widgets de Android

La PWA instalada desde Chrome sigue siendo la aplicación principal. Como Android no permite que una PWA cree widgets del sistema por sí sola, la carpeta `android-app/` contiene un complemento nativo liviano que habilita dos widgets sin base de datos ni permisos sensibles:

- **Agenda académica:** muestra únicamente tareas, parciales, exámenes, entregas y trabajos pendientes.
- **Calendario académico:** muestra únicamente clases que tengan hora de inicio y hora de finalización.

Cada cambio relacionado con Android genera un APK de prueba en GitHub:

1. Abrir la pestaña **Actions** del repositorio.
2. Entrar en la ejecución **Build Android app** más reciente.
3. Descargar el archivo **Estudiemos-Android** en la sección de artefactos.
4. Descomprimirlo e instalar `app-debug.apk` en Android.
5. Mantener presionada la pantalla de inicio, elegir **Widgets** y agregar **Agenda académica**, **Calendario académico** o ambos.
6. Abrir Estudiemos desde Chrome o desde la PWA instalada.
7. Entrar en la agenda y tocar **Widgets** cada vez que se quieran enviar los cambios a los widgets del teléfono.

Los datos se copian localmente entre la PWA y los widgets; no se envían a un servidor. Al tocar un día o una anotación, se abre la agenda de la PWA. Los cambios visuales de la web llegan sin reinstalar; los cambios del código Android requieren instalar un APK nuevo.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
