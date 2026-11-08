# Recuperacion de contrasena por correo

Supabase Auth emite el OTP con `resetPasswordForEmail` y lo valida con
`verifyOtp({ type: "recovery", email, token })`. La PWA actualiza la
contrasena desde un cliente de recuperacion temporal en memoria y vuelve al
ingreso normal. No hay migracion SQL, campos en perfiles ni credenciales nuevas.
Solicitar un codigo no cierra sesiones. Al cambiar la contrasena se aplica la
politica de sesiones de Supabase; puede ser necesario volver a ingresar.

## Configuracion de Supabase

1. Publicar primero la PWA nueva. Mientras se usa la plantilla anterior, el
   enlace de recuperacion existente sigue funcionando.
2. En Supabase, ir a **Authentication > Email > Templates > Reset password**.
   Guardar una copia de la plantilla anterior para poder restaurarla.
3. Poner como asunto `Tu codigo de recuperacion de Estudiemos` y como cuerpo
   el contenido de `supabase/auth/password-recovery.html`. La variable
   `{{ .Token }}` debe quedar literal en la plantilla. No cambiar el SMTP,
   Turnstile, las URL permitidas ni las plantillas de registro. Estudiemos
   produccion usa OTP de 8 digitos; la PWA tambien admite 6. No cambiar la
   longitud global de Auth para esta activacion.
4. Probar con una cuenta de prueba: pedir el correo, probar un codigo
   incorrecto, pegar el correcto y guardar la contrasena. Comprobar que la
   anterior no ingresa, la nueva si, y que el codigo usado no sirve otra vez.
5. Confirmar que un correo inexistente recibe el mismo mensaje generico
   de solicitud y que el reenvio queda bloqueado 60 segundos en la PWA.
   Los limites efectivos y el vencimiento se aplican en Supabase.

Si se revierte el frontend, restaurar primero la plantilla anterior.
