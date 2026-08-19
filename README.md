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
- `android-app/`: aplicación Android y widget nativo de la agenda.

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

## Aplicación y widget de Android

La PWA instalada desde Chrome no puede crear widgets del sistema. La carpeta `android-app/` contiene una aplicación Android nativa que abre Estudiemos y sincroniza la agenda localmente con el widget, sin base de datos ni permisos sensibles.

Cada cambio relacionado con Android genera un APK de prueba en GitHub:

1. Abrir la pestaña **Actions** del repositorio.
2. Entrar en la ejecución **Build Android app** más reciente.
3. Descargar el archivo **Estudiemos-Android** en la sección de artefactos.
4. Descomprimirlo e instalar `app-debug.apk` en Android.
5. Abrir la aplicación Estudiemos al menos una vez.
6. Mantener presionada la pantalla de inicio, elegir **Widgets** y agregar **Agenda de Estudiemos**.

La agenda se guarda solo en el dispositivo. Al crear, editar o eliminar una anotación desde la aplicación Android, el widget se actualiza automáticamente. Los cambios visuales de la web llegan sin reinstalar; los cambios del código Android requieren instalar un APK nuevo.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
