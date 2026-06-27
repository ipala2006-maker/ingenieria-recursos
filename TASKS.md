# Tareas para Codex

Escribi tareas desde GitHub mobile o desde el navegador del celular.

Formato simple:

```md
- [ ] Agregar boton "Diario" en la home <!-- codex-task:id=33d7ef30dd90 estado=error branch=codex/task-33d7ef30dd90 pr=https://github.com/ipala2006-maker/ingenieria-recursos/pull/7 updated=2026-06-27T20:29:27.282Z error=codex_action_failed -->
- [ ] Revisar errores del README <!-- codex-task:id=445def4e8d7b estado=error branch=codex/task-445def4e8d7b pr=https://github.com/ipala2006-maker/ingenieria-recursos/pull/9 updated=2026-06-27T21:57:59.483Z error=codex_action_failed -->
```

GitHub Actions completa automaticamente el comentario oculto `codex-task` para guardar estado, rama, PR y trazabilidad.

## Pendientes
Ajusta el tamaño de la card clickeable de "carreras" para que se vea mas uniforme y no sobre espacio en la card

## Estados

- `pendiente`: tarea nueva, todavia no procesada por GitHub Actions.
- `en_proceso`: GitHub Actions creo una rama y empezo a ejecutar Codex.
- `ejecutada`: Codex termino y GitHub Actions abrio un Pull Request.
- `error`: GitHub Actions o Codex fallo, o la proteccion bloqueo cambios riesgosos.
- `descartada`: tarea descartada manualmente.
