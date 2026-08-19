# Seguridad de Estudiemos

Estudiemos no usa login ni base de datos. La unica parte de servidor es el asistente de agenda, ejecutado como una funcion de Vercel.

## Reglas para mantenerlo seguro

- No subir claves, tokens, contrasenas ni archivos `.env` al repositorio.
- Hacer cambios solamente desde GitHub/Codex/Vercel usando la cuenta de Ian.
- Mantener activada la verificacion en dos pasos en GitHub y Vercel.
- Revisar los cambios antes de publicarlos si en el futuro se agregan login, pagos, base de datos o APIs.
- Guardar `GEMINI_API_KEY` y cualquier secreto futuro solamente en Vercel, dentro de Environment Variables.
- No colocar la clave de Gemini en HTML, JavaScript del navegador ni archivos versionados.

## Si aparece un problema

1. Pausar cambios nuevos.
2. Revisar el ultimo commit publicado.
3. Volver al deploy anterior desde Vercel si la pagina quedo inestable.
4. Cambiar cualquier token o clave que se haya expuesto por error.

## Estado actual

- Hay una funcion acotada en `api/agenda-ai.js`; valida los datos y no guarda la agenda.
- No hay base de datos.
- No hay cuentas de usuarios.
- `GEMINI_API_KEY` es necesaria para la interpretacion inteligente de la agenda.
- La publicacion automatica se realiza desde la rama `main` conectada a Vercel.
