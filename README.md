# Estudiemos

Plataforma educativa gratuita con recursos para estudiantes de ingeniería.

Sitio publico: [https://ipala2006-maker.github.io/ingenieria-recursos/](https://ipala2006-maker.github.io/ingenieria-recursos/)

## Estructura

- `index.html`: página principal.
- `data/data.js`: carreras, materias, temas y recursos.
- `pages/`: páginas de carreras, materias y temas.
- `scripts/`: buscador, bandeja, agenda, tema y navegación.
- `styles/`: estilos visuales.
- `pdfs/`: material descargable.

El proyecto es un sitio estático. No usa backend, dependencias, variables de entorno ni secretos.

## Ejecutar en la computadora

No hace falta instalar paquetes ni generar un build.

1. Abrir una terminal en la carpeta del proyecto.
2. Ejecutar `python -m http.server 8000`.
3. Abrir `http://localhost:8000` en el navegador.

También se puede usar cualquier servidor local de archivos estáticos.

## Validación

Antes de publicar, comprobar la sintaxis de los archivos JavaScript:

```powershell
Get-ChildItem scripts -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Luego recorrer Home, Carrera, Materia y Tema en escritorio y celular.

## Publicación automática

El sitio se publica con GitHub Pages desde la rama `main` y la raíz del repositorio.

Cada cambio enviado a `main` inicia automáticamente una nueva publicación. No hace falta ejecutar un build ni copiar archivos a otra rama. GitHub Pages es la opción más simple para este proyecto porque todo el sitio es estático y ya vive en GitHub.

No se requieren variables de entorno. Si en el futuro se agrega una integración que use secretos, deben configurarse en GitHub y nunca escribirse dentro del repositorio.

## Tareas

`TASKS.md` se mantiene como una libreta simple para anotar tareas desde el celular. No ejecuta automatizaciones ni usa la API de OpenAI.
