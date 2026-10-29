# Convivencia de Web Push durante la migracion

Las suscripciones existentes dependen de su clave VAPID original. No se copian
permisos entre origenes ni se eliminan suscripciones para aparentar continuidad.
Vercel conserva su par anterior; Cloudflare usa otro par solo para el origen
https://estudiemos.estudiemos-services.workers.dev y la version cf_20261029.

## Orden de despliegue

1. Conservar Vercel, el cron actual y un respaldo cifrado recuperable.
2. Publicar este codigo con PUSH_DISPATCH_ENABLED=false en Workers. Sin un
   identificador de clave valido el servicio nuevo no se anuncia ni registra.
3. Aplicar supabase/mobile-push-origins.sql. Es aditivo, no crea otro cron y
   deja el origen nuevo deshabilitado. Verificar las cantidades anteriores y
   posteriores de suscripciones/trabajos. No ejecutar los scripts previos por
   separado: sus guardas detienen un rollback de consultas sin filtro.
4. Generar y respaldar con age el nuevo par Web Push. Guardar en Workers como
   Secret WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY y WEB_PUSH_KEY_ID. Usar el
   mismo MOBILE_PUSH_CRON_SECRET de Vault; nunca publicarlo ni cambiarlo en
   Vercel. El token existente puede recuperarse desde Vault por su mecanismo
   autorizado; no se exportan secretos no exportables de Vercel.
5. Activar primero el origen nuevo en SQL y el flag de Workers en un ensayo
   controlado. Comprobar rechazo sin autenticacion, cifrado, entrega real y CPU.
6. Solo con entrega real y codigo/SQL coincidentes, dejar el flag activo en su
   configuracion versionada. Mantener el legado hasta migrar los dispositivos.

Activacion acotada, ejecutada como operador, nunca desde el cliente:

```sql
update public.mobile_push_origins set enabled=true
where source_origin='https://estudiemos.estudiemos-services.workers.dev'
  and vapid_key_id='cf_20261029';
select public.tick_mobile_push();
```

## Aislamiento

- Cada suscripcion lleva source_origin y vapid_key_id. Las anteriores reciben
  defaults legacy, sin alterar endpoint, credenciales, usuario ni agenda.
- La firma anterior de registro siempre corresponde al origen Vercel. No se
  puede reasignar un endpoint a otro usuario, origen o clave.
- Las firmas viejas de claim solo reservan trabajos legacy. Workers llama a
  claim_mobile_push_origin_batch con su par exacto, derivado del servidor.
- Un RPC ausente o un scope invalido falla cerrado, sin fallback a la cola vieja.
- Los nuevos RPC son solo service_role. No se exponen tablas ni secretos a anon
  o authenticated, ni se amplian permisos de los estudiantes.
- Sigue un solo tick, con dos destinos HTTPS fijos. No recibe URLs del usuario.
  En ticks vacios no hay llamadas HTTP; el barrido indexado no relee calendarios.
- El limite total es de 400 trabajos pendientes por tick. Si ambos origenes
  tienen trabajos, cada uno recibe hasta 200. Vercel agrupa 100 por llamada;
  Workers envia uno por invocacion para acotar CPU. SKIP LOCKED y los leases
  existentes conservan la deduplicacion y los reintentos.

## Retorno seguro

Se puede deshabilitar solo el origen Cloudflare y su flag, conservando las filas
para reintentar. No volver al SQL sin origen: una clave equivocada puede consumir
intentos de las suscripciones ajenas. El codigo legado de Vercel puede seguir
activo porque las firmas compatibles ya filtran por legacy.

El ensayo local de picos, la prueba criptografica y los mocks no prueban entrega
en un telefono. La PWA instalada en un origen nuevo requiere su propio permiso
y suscripcion mediante una accion del usuario.

Referencias:
https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
https://web.dev/articles/push-notifications-subscribing-a-user
