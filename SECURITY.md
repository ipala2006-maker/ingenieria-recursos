# Seguridad de Estudiemos

Estudiemos usa una función de Vercel para el asistente de Inbox y calendario, y Supabase para las cuentas y la sincronización entre dispositivos.

## Reglas para mantenerlo seguro

- No subir claves privadas, tokens, contraseñas ni archivos `.env` al repositorio.
- Mantener activada la verificación en dos pasos en GitHub, Vercel y Supabase.
- Guardar `GEMINI_API_KEY` solamente en las variables privadas de Vercel.
- `SUPABASE_PUBLISHABLE_KEY` puede llegar al navegador y queda limitada por las políticas de acceso por usuario.
- Nunca colocar `SUPABASE_SECRET_KEY` ni una clave `service_role` en HTML, JavaScript público, GitHub o `api/account-config.js`.
- Mantener habilitado Row Level Security en `public.user_states`.
- No modificar las políticas de `supabase/schema.sql` para permitir acceso anónimo.

## Protección de los datos

- Cada registro está asociado al identificador interno de su usuario.
- Las políticas permiten seleccionar, crear, actualizar o eliminar únicamente el registro propio.
- La contraseña es administrada por Supabase Auth y nunca se guarda en el repositorio ni en la tabla de Estudiemos.
- La copia local permite seguir usando la plataforma cuando no hay conexión.

## Si aparece un problema

1. Pausar cambios nuevos.
2. Revisar el último commit y el último despliegue.
3. Volver al despliegue anterior desde Vercel si la página quedó inestable.
4. Cambiar inmediatamente cualquier clave privada expuesta.
5. Revisar los usuarios y registros desde Supabase.

## Variables utilizadas

- `GEMINI_API_KEY`: privada, solo en Vercel.
- `GEMINI_MODEL`: configuración no sensible.
- `SUPABASE_URL`: pública.
- `SUPABASE_PUBLISHABLE_KEY`: pública y restringida por Row Level Security.
