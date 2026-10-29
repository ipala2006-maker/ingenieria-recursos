# Origen estable de Cloudflare

URL preparada: https://estudiemos.estudiemos-services.workers.dev.
No anunciar ni redirigir Vercel hasta completar las validaciones de corte.

## Distribucion

- estudiemos sirve los mismos assets publicos desde la CDN.
- Solo /api/*, /materia/* y /amistad/* atraviesan la entrada HTTP y su
  service binding BACKEND hacia estudiemos-candidate, dentro de la misma cuenta.
- estudiemos-candidate conserva las claves existentes y ejecuta las APIs.
  Su nombre se mantiene por continuidad, no porque se exporten sus secretos.
- El frontdoor no tiene claves, no reescribe Origin, Cookie ni Authorization,
  y no tiene un proxy HTTP configurable por el usuario. Se preservan cuerpos,
  redirects y cookies tal como los valida el backend existente.
- Los errores de bindings son genericos y no se almacenan en cache.

Los limites de CPU, conexiones y subpeticiones tambien se deben medir con esta
entrada real; un service binding no equivale a presupuesto ilimitado. Referencias:
https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
https://developers.cloudflare.com/workers/platform/limits/

## Operacion

```powershell
npm run cloudflare:check
```

Construye la lista publica y compila ambos Workers sin desplegar. No necesita
secretos ni ejecuta las APIs con credenciales de produccion.

```powershell
npm run cloudflare:deploy
```

Despliega primero las APIs y despues la entrada publica, en la cuenta fijada
en ambos archivos Wrangler. Si falla el primer despliegue, no se publica el
segundo. No usar --keep-vars para conservar un APP_ORIGIN candidato obsoleto:
los dos valores Config proceden de wrangler.jsonc; los Secret existentes se
mantienen por el nombre del Worker. Verificar sus nombres antes y despues.

## Puertas de corte pendientes

- Google OAuth: agregado y verificado por reapertura del cliente el callback
  https://estudiemos.estudiemos-services.workers.dev/api/account-config?drive=callback.
  El callback de Vercel y los dos secretos existentes se conservan intactos.
- Supabase Auth: agregado el hostname exacto nuevo con sus rutas /**, como el
  origen legacy; los enlaces de confirmacion con invitacion conservan su query.
  Site URL permanece en Vercel y los retornos anteriores siguen permitidos.
- Turnstile: autorizar el hostname exacto; no desactivar CAPTCHA ni aceptar comodines.
- Sesiones, datos locales, instaladores Android/Windows y PWA: no asumir que un
  cambio de origen copia almacenamiento, permisos o la identidad de instalacion.
- Firebase: clave adicional coexistente, creada por el titular, como Secret en
  Cloudflare. El control de seguridad detuvo su creacion automatica; la anterior
  sigue intacta y el formulario quedo preparado para la accion del titular.
- Web Push: conservar las suscripciones legacy y su despacho hasta validar la
  seleccion de claves/colas del origen nuevo; no reemplazar VAPID a ciegas.
- PUSH_DISPATCH_ENABLED sigue false en Workers. Cambiar un solo cron despues
  de entrega real, control de deduplicacion y medidas de CPU con proveedores.
- Probar cuenta, catedra, Drive, calendario, Pomodoro y notificaciones antes
  de anunciar el nuevo sitio. Conservar Vercel como respaldo compatible.
