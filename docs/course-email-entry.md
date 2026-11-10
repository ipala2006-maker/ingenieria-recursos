# Acceso por correo desde una cátedra

- Una sesión activa pasa directamente al ingreso de la cátedra. El servidor conserva sus verificaciones de identidad, cupos y bloqueos.
- Sin sesión, el formulario pide el correo. Supabase envía un enlace de acceso que conserva `materia` y `unirme` en su retorno, incluso si el usuario lo abre en otro navegador. La opción de usar contraseña sigue disponible.
- No requiere una migración de base de datos ni un proveedor de correo adicional. Se reutilizan Supabase Auth, la comprobación de seguridad y el SMTP actual.

Antes de publicar, comprobar en Supabase **Authentication → Email Templates → Magic Link** que la plantilla use `{{ .ConfirmationURL }}` como enlace. El retorno a `https://estudiemos.ar/` con la consulta debe estar permitido en **URL Configuration**. Después, pedir un único enlace desde una invitación de prueba y abrirlo desde una sesión privada para verificar el correo real y la inscripción automática. No compartir el enlace de verificación.
