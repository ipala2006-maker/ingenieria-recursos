# Estudiemos

Sitio estatico de recursos de estudio con un MVP de Diario / Inbox para Ian OS.

## Correr localmente

Para ver las paginas estaticas:

```bash
python -m http.server 8080
```

Abrir `http://127.0.0.1:8080/`.

La pagina del diario esta en:

```text
http://127.0.0.1:8080/pages/diario.html
```

En modo local sin backend, el diario guarda borradores en `localStorage` si la API no esta disponible.

## Diario / Inbox

El MVP permite:

- capturar una entrada rapido desde celular;
- elegir categoria opcional: Facultad, Estudiemos, Finanzas, Proyectos o Personal;
- guardar fecha y hora automaticamente;
- revisar Inbox, Procesado, Descartado o Todos;
- marcar entradas como `inbox`, `procesado` o `descartado`.

Para que funcione en la nube aunque la PC este apagada, desplegar en Vercel. El endpoint `api/diario.js` guarda cada entrada como un GitHub Issue del repositorio.

## Variables de entorno

Configurar estas variables en Vercel:

```text
DIARIO_GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=ipala2006-maker
GITHUB_REPO=ingenieria-recursos
DIARIO_SHARED_KEY=una-clave-simple-opcional
```

`DIARIO_GITHUB_TOKEN` debe ser un fine-grained token con permisos de Issues en este repositorio. `DIARIO_SHARED_KEY` es opcional; si se configura, hay que poner la misma clave en la seccion Configuracion de la pagina del diario.

## Desplegar en Vercel

1. Importar el repositorio `ipala2006-maker/ingenieria-recursos` en Vercel.
2. Framework preset: `Other`.
3. Build command: dejar vacio.
4. Output directory: dejar vacio o usar la raiz del proyecto.
5. Agregar las variables de entorno anteriores.
6. Deploy.

Luego abrir:

```text
https://TU-PROYECTO.vercel.app/pages/diario.html
```

## Checks

Este proyecto no tiene dependencias ni build configurado. Para validar sintaxis JavaScript:

```bash
node --check scripts/global-search.js
node --check scripts/bandeja.js
node --check scripts/diario-inbox.js
node --check api/diario.js
```
