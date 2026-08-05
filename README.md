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

El proyecto es un sitio estático. No usa framework, backend, dependencias, variables de entorno ni secretos.

## Seguridad

- `vercel.json` agrega headers de seguridad para proteger la página publicada.
- `.gitignore` evita subir archivos locales sensibles como `.env` o `.vercel`.
- `SECURITY.md` resume las reglas simples para mantener el proyecto seguro.
- GitHub y Vercel deben mantenerse con verificación en dos pasos activada.

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

No se requieren variables de entorno. Si en el futuro se agrega una integración que use secretos, deben configurarse en Vercel y nunca escribirse dentro del repositorio.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
