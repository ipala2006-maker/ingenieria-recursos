# Activar los SMS de Estudiemos

Guía revisada el 7 de septiembre de 2026. No se compró un número ni se activaron cobros.

## Qué falta

La app pide la verificación a Supabase. Supabase necesita un proveedor de SMS
configurado para poder enviarla. Eliminar el campo de invitación no elimina el
código SMS: ese código comprueba que el teléfono pertenece al usuario.

## Pasos

1. Creá tu cuenta en [Twilio](https://www.twilio.com/try-twilio) y completá la
   verificación que te pida. En la prueba, solo podés enviar a destinatarios
   previamente verificados. Revisá las restricciones que muestre tu cuenta;
   la prueba no equivale a un servicio listo para todos los estudiantes.
   [Condiciones de la prueba](https://www.twilio.com/docs/usage/trials).
2. En la consola, entrá a **Messaging > Services > Create a Messaging Service**.
   Llamalo `Estudiemos`. Agregá un remitente compatible con SMS en **Sender Pool**.
   Un servicio sin remitente no puede enviar. No compres un número antes de
   confirmar que sirve para el destino y conocer su costo.
   [Configuración oficial](https://www.twilio.com/docs/messaging/tutorials/send-messages-with-messaging-services).
3. Habilitá Argentina en **Messaging Geographic Permissions**. Para empezar,
   dejá habilitados solo los países donde vas a operar. Twilio admite envíos
   internacionales a Argentina; no hace falta que el remitente sea tu celular
   personal. [Reglas para Argentina](https://www.twilio.com/en-us/guidelines/ar/sms).
4. Abrí tu proyecto en **Supabase > Authentication > Sign In / Providers > Phone**.
   Elegí **Twilio**, no Twilio Verify para esta configuración. Completá
   **Account SID**, **Auth Token** y **Messaging Service SID** (el del servicio
   empieza con `MG`). Habilitá Phone y guardá. Pegá el token solamente en ese
   panel privado, nunca en el código, Excel, Git ni en este chat.
   [Integración de Supabase](https://supabase.com/docs/guides/auth/phone-login?showSmsProvider=Twilio).
5. Como configuración inicial, recomiendo códigos de seis dígitos, vencimiento
   de cinco minutos y al menos 60 segundos entre reenvíos. Conservá CAPTCHA y
   los límites de autenticación. Mensaje sugerido:
   `Tu codigo de Estudiemos es {{ .Code }}. No lo compartas.`
6. Probá con una cuenta y un teléfono tuyos: recibí el SMS, ingresalo, revisá el
   perfil y volvé a abrirlo. Después probá el enlace de invitación en otro perfil
   de navegador. Revisá **Messaging Logs** de Twilio si no llega: que la app
   diga "enviado" no prueba por sí solo que el operador lo entregó.

## Antes de abrirlo al público

No anuncies referidos con teléfono verificado hasta comprobar recepción real,
código incorrecto, vencimiento, reenvíos y rechazo de teléfonos repetidos.
Pasar a producción puede implicar habilitar facturación, cargos por mensajes
y por el remitente elegido. Revisá el precio mostrado por Twilio antes de aceptar.
Configurá alertas de gasto; una alerta no es un tope automático de consumo.

La invitación se guarda desde el enlace y se aplica tras verificar la identidad.
No requiere escribir un código de invitación ni hacer el primer pago.
