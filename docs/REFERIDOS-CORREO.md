# Referidos por correo confirmado

Actualizado: 2026-09-08.

- No se solicita telefono ni se envian SMS para registrarse o participar.
- El enlace de instalacion conserva la invitacion. Al confirmar el correo e ingresar, la app reclama el beneficio automaticamente.
- Invitado: 35% durante el mes calendario en que confirma la invitacion.
- Invitador: 45% al completar tres registros confirmados durante ese mismo mes.
- Los descuentos no se suman. Vencen al comenzar el mes siguiente, hora de Buenos Aires.
- No se requiere primer pago. El cobro real sigue sujeto a la futura integracion de pagos.
- El servidor consulta `auth.users.email_confirmed_at`; no confia en campos enviados por el cliente.
- Se conservan autenticacion, CAPTCHA, limites de solicitudes, RLS, un invitador por cuenta y bloqueo de autorreferidos.
- Los correos distintos no garantizan personas distintas. Este riesgo comercial fue aceptado; no se presenta como verificacion de identidad personal.

## Despliegue

La migracion incremental es `supabase/referrals-email-20260908.sql`. Actualiza tres funciones sin borrar datos ni cambiar permisos existentes. `supabase/referrals.sql` contiene las definiciones para nuevas instalaciones. Los campos telefonicos antiguos permanecen por compatibilidad, pero no habilitan los nuevos beneficios.

## Verificacion realizada

Se ejecuto una simulacion en la base de datos dentro de una transaccion revertida: un invitador, tres invitados confirmados y uno sin confirmar. Se comprobaron descuentos 0/0/45 para el invitador, 35 para cada invitado, rechazo de correo sin confirmar, duplicados y autorreferidos, vencimiento mensual y permisos. No quedaron cuentas ni registros de prueba guardados. No se enviaron SMS, correos de prueba ni cobros.

Las pruebas de interfaz cubren captura automatica, ausencia del formulario telefonico, bloqueo de correo sin confirmar y cambios de sesion durante la consulta. El envio real del correo y la continuidad del enlace en una instalacion nueva de cada sistema no quedan demostrados por esta simulacion.
