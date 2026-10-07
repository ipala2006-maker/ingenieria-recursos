# Herramientas guardadas para una etapa posterior

IA y Mi espacio no se muestran en el inicio, la personalizacion, los accesos
rapidos ni las opciones de widgets mientras sus funciones estan desactivadas.
No se borran implementaciones, preferencias ni datos de usuarios.

## Conservado

- Implementaciones: `scripts/workspace.js`, `scripts/study-home.js` y las rutas
  `api/agenda-ai.js`, `api/assistant-router.js`, `api/workspace-ai.js`.
- Disenos, modelos y formularios originales en HTML, CSS y scripts de profundidad.
- Carpetas y archivos existentes en Supabase; no hay migraciones destructivas.
- Preferencias de visibilidad, tamanos y posiciones anteriores de las herramientas.
- Catalogo de planes y descuentos, todavia sin activar facturacion.
- Implementacion del widget de Mi espacio para Android.

## Reactivacion

La disponibilidad web se decide en `shared/release.js`, nunca con una preferencia
del usuario. Al habilitar `workspace` o `ai` en una futura version, vuelven los
controles originales y se reutilizan los datos conservados. Antes de publicarla,
revisar permisos, limites del servidor y pruebas de la herramienta correspondiente.
La version nativa de Android tiene su propia configuracion `ReleaseFeatures.java`
y requiere una compilacion nueva si tambien se reactiva su widget de Mi espacio.

Ocultar herramientas no habilita pagos ni cambia los planes guardados.
