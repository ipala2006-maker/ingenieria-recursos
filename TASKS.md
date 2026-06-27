# Tareas para Codex

Escribi tareas desde GitHub mobile o desde el navegador del celular.

Formato simple:

```md
- [ ] Agregar boton "Diario" en la home
- [ ] Revisar errores del README
```

GitHub Actions completa automaticamente el comentario oculto `codex-task` para guardar estado, rama, PR y trazabilidad.

## Pendientes

Agrega tareas reales debajo de este texto.

## Estados

- `pendiente`: tarea nueva, todavia no procesada por GitHub Actions.
- `en_proceso`: GitHub Actions creo una rama y empezo a ejecutar Codex.
- `ejecutada`: Codex termino y GitHub Actions abrio un Pull Request.
- `error`: GitHub Actions o Codex fallo, o la proteccion bloqueo cambios riesgosos.
- `descartada`: tarea descartada manualmente.
