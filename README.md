# Estudiemos

Sitio estatico de recursos de estudio.

## Mobile Tasks Runner

Este repositorio incluye una automatizacion para capturar tareas desde el celular y ejecutarlas en la nube con GitHub Actions + Codex.

### Que puede y que no puede hacer

GitHub Actions corre en la nube, lee `TASKS.md`, crea una rama por tarea, invoca `openai/codex-action@v1`, commitea los cambios en esa rama, abre un Pull Request y lo mergea automaticamente si la tarea termina bien.

Para que funcione, el repositorio necesita el secret `OPENAI_API_KEY` configurado en GitHub Actions.

1. Ian escribe tareas en `TASKS.md` desde GitHub mobile o el navegador del celular.
2. GitHub Actions corre cada 4 horas en la nube.
3. El workflow toma una sola tarea `pendiente`.
4. Crea una rama `codex/task-...`.
5. Marca la tarea como `en_proceso` en esa rama.
6. Ejecuta Codex con `openai/codex-action@v1`.
7. Revisa protecciones basicas contra cambios riesgosos.
8. Commita los cambios en la rama.
9. Abre un Pull Request contra `main`.
10. Si la tarea termino bien, mergea automaticamente el PR a `main`.
11. Si falla Codex, el guard o el merge, deja la tarea en `error` y no mergea.

### Usarlo desde el celular

1. Abrir el repositorio en GitHub mobile o en el navegador.
2. Editar `TASKS.md`.
3. Agregar una tarea bajo `## Pendientes` con este formato:

```md
- [ ] Agregar boton "Diario" en la home
```

4. Guardar el commit desde GitHub.
5. Esperar la proxima corrida del workflow o ejecutarlo manualmente desde Actions > `Auto Codex Runner`.

No edites el comentario oculto `<!-- codex-task:... -->` que agrega la automatizacion.

### Estados

- `pendiente`: tarea nueva escrita por Ian.
- `en_proceso`: GitHub Actions creo una rama y empezo a ejecutar Codex.
- `ejecutada`: Codex termino y el Pull Request se mergeo automaticamente.
- `error`: GitHub Actions o Codex fallo, o una proteccion bloqueo cambios riesgosos.
- `descartada`: tarea descartada manualmente.

### Configurar GitHub antes de usar

1. Ir al repositorio en GitHub.
2. Abrir Settings > Secrets and variables > Actions.
3. Crear un repository secret:

```text
OPENAI_API_KEY=tu_api_key_de_openai
```

4. Verificar en Settings > Actions > General:

- Workflow permissions: `Read and write permissions`.
- Allow GitHub Actions to create and approve pull requests: activado.

Sin estos permisos, el workflow puede fallar al pushear la rama o crear el PR.

### Como trabaja Codex

Codex corre dentro de GitHub Actions mediante `openai/codex-action@v1`.

Reglas incluidas en el prompt automatico:

- implementar solo la tarea seleccionada;
- no hacer commit, push ni abrir PR manualmente;
- no borrar archivos masivamente;
- no tocar secrets, tokens ni credenciales;
- no modificar autenticacion, base de datos, dependencias, configuracion critica ni workflows salvo pedido explicito;
- dejar los cambios en el workspace para que GitHub Actions los commitee en una rama.

El workflow tambien ejecuta una proteccion antes de commitear:

- bloquea mas de 3 archivos borrados;
- bloquea cambios sobre archivos tipicos de secrets o credenciales.

### Workflow

Archivo: `.github/workflows/auto-codex-runner.yml`

Frecuencia:

```text
Cada 4 horas
```

Tambien se puede ejecutar manualmente desde GitHub Actions:

1. Abrir Actions.
2. Elegir `Auto Codex Runner`.
3. Tocar `Run workflow`.

### Ver el PR generado

1. Abrir la pestana Pull requests.
2. Buscar un PR con titulo `[codex] ...`.
3. Si la tarea termino bien, el PR deberia aparecer mergeado.
4. Si algo fallo, el PR queda abierto y `TASKS.md` queda con estado `error`.

### Script

Archivo principal: `.github/scripts/auto-codex-runner.mjs`

Proteccion de cambios: `.github/scripts/guard-codex-changes.mjs`

Responsabilidades:

- leer `TASKS.md`;
- detectar una tarea checklist pendiente;
- evitar repetir tareas que ya tienen rama remota;
- generar el prompt para Codex;
- marcar `en_proceso`, `ejecutada` o `error`;
- guardar en `TASKS.md` la rama y URL del PR.

### Checks locales

No hay build configurado. Para validar sintaxis del runner:

```bash
node --check .github/scripts/auto-codex-runner.mjs
node --check .github/scripts/guard-codex-changes.mjs
```
