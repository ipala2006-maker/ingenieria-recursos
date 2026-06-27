# Estudiemos

Sitio estatico de recursos de estudio.

## Mobile Tasks Runner

Este repositorio incluye una automatizacion simple para capturar tareas desde el celular sin depender de que la PC este prendida.

### Que puede y que no puede hacer

GitHub Actions si puede correr en la nube, leer `TASKS.md`, crear Issues y actualizar el estado del archivo.

Codex no queda invocado automaticamente desde GitHub Actions con la integracion actual de este proyecto. La alternativa implementada es la mas cercana y segura:

1. Ian escribe tareas en `TASKS.md` desde GitHub mobile o el navegador del celular.
2. GitHub Actions corre cada 4 horas en la nube.
3. El workflow crea un Issue por cada tarea pendiente.
4. La tarea queda marcada como `en_proceso` en `TASKS.md`.
5. Codex toma el Issue y hace el trabajo en una rama + Pull Request.
6. Cuando el Issue se cierra como completado, el siguiente workflow marca la tarea como `ejecutada`.
7. Si el Issue se cierra como no planificado, el workflow marca la tarea como `descartada`.
8. Si algo falla al crear o sincronizar el Issue, la tarea queda como `error`.

### Usarlo desde el celular

1. Abrir el repositorio en GitHub mobile o en el navegador.
2. Editar `TASKS.md`.
3. Agregar una tarea bajo `## Pendientes` con este formato:

```md
- [ ] Agregar boton "Diario" en la home
```

4. Guardar el commit desde GitHub.
5. Esperar la proxima corrida del workflow o ejecutarlo manualmente desde Actions > `Mobile Tasks Runner`.

No edites el comentario oculto `<!-- codex-task:... -->` que agrega la automatizacion.

### Estados

- `pendiente`: tarea nueva escrita por Ian.
- `en_proceso`: GitHub Actions ya creo un Issue para que Codex la trabaje.
- `ejecutada`: el Issue fue cerrado como completado.
- `error`: GitHub Actions encontro un problema.
- `descartada`: el Issue fue cerrado como no planificado.

### Como trabaja Codex

Codex debe tomar los Issues con labels `mobile-task` y `codex`.

Reglas para Codex:

- Crear una rama nueva por tarea.
- Abrir Pull Request contra `main`.
- No hacer push directo a `main`.
- No ejecutar tareas peligrosas automaticamente.
- Si la tarea es ambigua, grande o riesgosa, comentar el bloqueo en el Issue.

### Workflow

Archivo: `.github/workflows/mobile-tasks-runner.yml`

Frecuencia:

```text
Cada 4 horas
```

Tambien se puede ejecutar manualmente desde GitHub Actions.

### Script

Archivo: `.github/scripts/mobile-tasks-runner.mjs`

Responsabilidades:

- leer `TASKS.md`;
- detectar tareas checklist sin metadata;
- crear labels si faltan;
- crear un Issue por cada tarea pendiente;
- escribir metadata oculta para evitar duplicados;
- sincronizar tareas `en_proceso` con el estado del Issue;
- marcar `error` si falla una operacion.

### Checks locales

No hay build configurado. Para validar sintaxis del runner:

```bash
node --check .github/scripts/mobile-tasks-runner.mjs
```
