# Tareas para Codex

Escribí tareas desde GitHub mobile o desde el navegador del celular.

Formato simple:

```md
- [ ] Agregar botón "Diario" en la home
- [ ] Revisar errores del README
```

GitHub Actions completa automáticamente el comentario oculto `codex-task` para guardar estado, rama, PR y trazabilidad.

## Pendientes

- [ ] Cambiar el texto del botón principal de la página de inicio por "Prueba Codex".

## Estados

- `pendiente`: tarea nueva, todavía no procesada por GitHub Actions.
- `en_proceso`: GitHub Actions creó una rama y empezó a ejecutar Codex.
- `ejecutada`: Codex terminó y GitHub Actions abrió un Pull Request.
- `error`: GitHub Actions o Codex falló, o la protección bloqueó cambios riesgosos.
- `descartada`: tarea descartada manualmente.
