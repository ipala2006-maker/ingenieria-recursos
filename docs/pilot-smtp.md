# Correo del piloto, sin contratar planes

Investigacion: 26/10/2026. No se creo una cuenta ni se cambio Supabase Auth.
No guardar claves SMTP en Git, archivos publicos, Vercel ni el navegador de la app:
el emisor de confirmacion se configura directamente en Supabase.

## Opciones

| Proveedor | Plan gratuito consultado | Condicion importante |
| --- | --- | --- |
| Brevo | 300 mensajes por dia, sin vencimiento del plan | SMTP transaccional; requiere validar el remitente y la activacion del servicio |
| Resend | 3.000 mensajes/mes, hasta 100 por dia | SMTP requiere un dominio propio verificado |

Para este piloto recomiendo Brevo por el margen diario y porque hoy el contacto
oficial es un Gmail. Gmail no permite que Estudiemos autentique su dominio:
Brevo puede reemplazar el dominio del remitente por `brevosend.com`. Confirmar
esa posibilidad y probar la entrega antes de invitar. Un dominio propio seria
mas profesional, pero no se comprara ninguno ni se promete entrega ilimitada.
El subdominio `estudiemos-app.vercel.app` tampoco es un dominio de correo que
podamos autenticar libremente. Resend es una buena alternativa si ya hay un
dominio bajo control de Ian; no es necesario pagar un plan del proveedor.

## Configuracion de Brevo

1. Usar solo la cuenta oficial de Estudiemos, plan Free, sin tarjeta, prueba paga,
   paquetes de creditos, automatizaciones de marketing ni complementos.
2. Validar `estudiemosapp@gmail.com` como remitente y comprobar que Brevo habilito
   correo transaccional. No subir la lista de estudiantes ni importar contactos.
3. En Brevo, SMTP, obtener el login SMTP y generar una clave SMTP dedicada. No
   confundirla con una clave de API ni con la contrasena del Gmail.
4. En Supabase, Authentication > Email/SMTP, configurar:

| Campo | Valor |
| --- | --- |
| Enable custom SMTP | Activado |
| Sender email | El remitente validado que admita Brevo |
| Sender name | Estudiemos |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | El login que muestra la pantalla SMTP de Brevo |
| Password | La clave SMTP dedicada, solo en este campo protegido |

5. Mantener confirmacion de correo y las protecciones antiabuso existentes.
   Con SMTP externo Supabase comienza con un limite de 30 correos/hora: para
   10-20 amigos alcanza; no ampliarlo sin medir el limite diario de Brevo.
6. Desactivar seguimiento de enlaces/aperturas para mensajes de autenticacion.
   Mantener asunto y plantilla simples; no mezclar confirmaciones con publicidad.
7. Probar registro y recuperacion con dos destinatarios de prueba consentidos,
   incluyendo uno que no pertenezca al equipo de Supabase. Verificar enlace,
   remitente real, carpeta spam e invitacion a materia conservada al confirmar.
8. Medir fallos y cuota en ambos paneles. No desactivar confirmacion para eludir
   limites. Si se agota Free, pausar nuevas invitaciones, no activar sobregiros.

## Alternativa Resend si ya hay dominio

Validar el dominio, sus DNS SPF/DKIM/DMARC y el remitente. Usar
`smtp.resend.com`, puerto `587`, usuario `resend`, y una API key dedicada como
contrasena SMTP de Supabase. Mantener desactivados sobregiros transaccionales,
creditos y cualquier upgrade. No usar el remitente de pruebas de Resend para
dar por habilitado un registro publico.

## Pendiente para considerar listo el piloto

Faltan la cuenta/proveedor elegido, la validacion del remitente, sus credenciales
en Supabase y la prueba real de entrega. Un manual no significa que el SMTP
este activado. No se solicitaran contrasenas o claves por chat.

Fuentes oficiales:
- [SMTP de Supabase y limite inicial](https://supabase.com/docs/guides/auth/auth-smtp)
- [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Configuracion SMTP Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [Remitentes Gmail y reemplazo de dominio](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication)
- [Resend Free](https://resend.com/pricing)
- [SMTP de Resend](https://resend.com/docs/send-with-smtp)
- [Cuota gratuita documentada por Resend](https://www.resend.com/blog/new-free-tier)
