# Sistema de referidos

## Reglas

- Cada cuenta conserva un correo único en Supabase Auth.
- Para compartir o usar un código se exige un teléfono único confirmado por SMS.
- Un usuario que llegó referido y luego consigue un referido calificado obtiene 35%.
- Cualquier usuario que consiga tres referidos calificados obtiene 45%.
- Los descuentos no se acumulan; siempre se aplica el mayor beneficio vigente.
- Un referido se califica únicamente después de su primer pago aprobado.

## Estados

1. `verified`: correo y teléfono confirmados; falta el primer pago.
2. `qualified`: el servidor comprobó el primer pago aprobado.
3. `rejected`: reservado para fraude, devolución o revisión manual.

## Activación de producción

1. Ejecutar `supabase/referrals.sql` en el proyecto de Supabase.
2. Habilitar Phone Auth y conectar un proveedor SMS compatible en Supabase.
3. Crear `REFERRAL_PHONE_HASH_SECRET` con al menos 32 caracteres en Vercel.
4. Desde el webhook firmado de Mercado Pago, después de consultar el pago y comprobar que está aprobado, llamar como `service_role` a `qualify_referral_after_first_payment(user_id, payment_id)`.
5. Aplicar `discount_percent` al crear o renovar la suscripción. Nunca aceptar el porcentaje enviado por el cliente.

La consulta y las acciones de referidos comparten `/api/plan-status` para respetar el límite de funciones del plan actual de Vercel sin agregar costo.

Mientras los cobros sigan deshabilitados, la interfaz muestra el recorrido y los referidos quedan esperando el primer pago. No se simulan pagos ni descuentos ganados desde el navegador.
