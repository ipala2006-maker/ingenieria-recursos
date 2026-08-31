# Seguridad de Estudiemos

Estudiemos usa una función de Vercel para el asistente de Inbox y calendario, y Supabase para las cuentas y la sincronización entre dispositivos.

## Reglas para mantenerlo seguro

- No subir claves privadas, tokens, contraseñas ni archivos `.env` al repositorio.
- Mantener activada la verificación en dos pasos en GitHub, Vercel y Supabase.
- Guardar `GEMINI_API_KEY` solamente en las variables privadas de Vercel.
- `SUPABASE_PUBLISHABLE_KEY` puede llegar al navegador y queda limitada por las políticas de acceso por usuario.
- Nunca colocar `SUPABASE_SECRET_KEY` ni una clave `service_role` en HTML, JavaScript público, GitHub o `api/account-config.js`.
- Mantener habilitado Row Level Security en `public.user_states`.
- Mantener aplicadas las políticas de `supabase/workspace.sql`, `supabase/plans.sql` y el rate limit de `supabase/security.sql`.
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

Los reportes de seguridad pueden enviarse mediante el [formulario oficial](https://docs.google.com/forms/d/e/1FAIpQLSc8KLH9N0kcYRryZa0tNtLSRIMe0ol_wKWVUwBt9T-3m9WD1A/viewform?usp=header). No incluyas contraseñas, tokens ni archivos privados en el primer mensaje.

## Revisión antes de publicar

- Ejecutar la revisión estática de secretos y las pruebas de rutas, formularios y cabeceras.
- Ejecutar Strix sobre un entorno de prueba con una cuenta creada exclusivamente para la auditoría.
- Excluir pagos, mensajería real y acciones destructivas del alcance salvo autorización expresa.
- Corregir cada hallazgo validado y repetir el mismo caso antes de desplegar.
- Un resultado sin hallazgos reduce el riesgo, pero no demuestra que una aplicación sea imposible de vulnerar.

## Variables utilizadas

- `GEMINI_API_KEY`: privada, solo en Vercel.
- `GEMINI_MODEL`: configuración no sensible.
- `SUPABASE_URL`: pública.
- `SUPABASE_PUBLISHABLE_KEY`: pública y restringida por Row Level Security.
- `SUPABASE_SECRET_KEY`: privada, solo en funciones de servidor.
- `RATE_LIMIT_SECRET`: privada y opcional; se usa únicamente para anonimizar las claves del rate limit.
- `WHATSAPP_APP_SECRET` y `WHATSAPP_ACCESS_TOKEN`: privadas, solo en funciones de servidor.
