# Sistema de referidos

## Reglas

- Cada cuenta conserva un correo único en Supabase Auth.
- Para compartir o usar un código se exige un teléfono único confirmado por SMS.
- Un usuario que llega desde un enlace y verifica correo y teléfono obtiene 35% durante ese mes.
- El invitador obtiene 45% durante el mes en que consigue tres registros verificados.
- Uno o dos invitados no generan descuento para el invitador.
- Los descuentos no se acumulan, vencen al terminar el mes y siempre se aplica el mayor beneficio vigente.
- Un referido se califica al registrarse desde el enlace de invitación y confirmar correo y teléfono únicos.

## Estados

1. `verified`: estado heredado de versiones anteriores, convertido automáticamente cuando ambas identidades están verificadas.
2. `qualified`: correo y teléfono confirmados; el beneficio ya está activo.
3. `rejected`: reservado para fraude, devolución o revisión manual.

## Activación de producción

1. Ejecutar `supabase/referrals.sql` en el proyecto de Supabase.
2. Habilitar Phone Auth y conectar un proveedor SMS compatible en Supabase.
3. Crear `REFERRAL_PHONE_HASH_SECRET` con al menos 32 caracteres en Vercel.
4. Al reclamar el código después de verificar el teléfono, la relación queda calificada automáticamente.
5. Aplicar `discount_percent` al crear o renovar la suscripción. Nunca aceptar el porcentaje enviado por el cliente.

La consulta y las acciones de referidos comparten `/api/plan-status` para respetar el límite de funciones del plan actual de Vercel sin agregar costo.

Mientras los cobros sigan deshabilitados, el porcentaje queda guardado y visible. Se aplicará automáticamente al precio cuando se habiliten las suscripciones.
