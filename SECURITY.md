# Seguridad de Estudiemos

Estudiemos es un sitio estatico: no usa login, base de datos, backend ni claves privadas dentro del codigo.

## Reglas para mantenerlo seguro

- No subir claves, tokens, contrasenas ni archivos `.env` al repositorio.
- Hacer cambios solamente desde GitHub/Codex/Vercel usando la cuenta de Ian.
- Mantener activada la verificacion en dos pasos en GitHub y Vercel.
- Revisar los cambios antes de publicarlos si en el futuro se agregan login, pagos, base de datos o APIs.
- Guardar cualquier secreto futuro solamente en Vercel, dentro de Environment Variables.

## Si aparece un problema

1. Pausar cambios nuevos.
2. Revisar el ultimo commit publicado.
3. Volver al deploy anterior desde Vercel si la pagina quedo inestable.
4. Cambiar cualquier token o clave que se haya expuesto por error.

## Estado actual

- No hay backend.
- No hay base de datos.
- No hay cuentas de usuarios.
- No hay variables de entorno requeridas.
- La publicacion automatica se realiza desde la rama `main` conectada a Vercel.
