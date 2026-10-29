# Origen estable de Cloudflare

Origen principal: https://estudiemos.estudiemos-services.workers.dev.
Supabase Auth, clientes nuevos y enlaces publicos usan este origen. Vercel se
conserva temporalmente para instalaciones y suscripciones web anteriores.
La entrega real de notificaciones en celulares todavia debe comprobarse.

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
- Turnstile: hostname nuevo y legacy autorizados y verificados en el panel.
  Supabase mantiene CAPTCHA activo; una prueba sin token fue rechazada con
  captcha_failed. No desactivar CAPTCHA ni aceptar comodines.
- Sesiones, datos locales, instaladores Android/Windows y PWA: no asumir que un
  cambio de origen copia almacenamiento, permisos o la identidad de instalacion.
- Firebase: recuperada una copia local de la credencial original, validada ante
  Google y guardada como Secret en Cloudflare con respaldo age verificado.
  No se creo otra clave ni se exportaron secretos de Vercel. Falta probar la
  entrega real desde el Worker; autenticar ante Google no equivale a entregarla.
- Web Push: conservar las suscripciones legacy y su despacho hasta validar la
  seleccion de claves/colas del origen nuevo; no reemplazar VAPID a ciegas.
- PUSH_DISPATCH_ENABLED conserva en codigo la activacion ya autorizada en el
  entorno real. El unico cron distingue origen y clave, sin mezclar colas.
  La entrega real y CPU con proveedores siguen pendientes de certificacion;
  no apagar el transporte anterior por una compilacion o una cola vacia.
- Probar cuenta, catedra, Drive, calendario, Pomodoro y notificaciones antes
  de anunciar el nuevo sitio. Conservar Vercel como respaldo compatible.

## Comprobacion de acceso del 29 de octubre de 2026

El navegador devolvio Turnstile 300030, un fallo generico de desafio. No es el
codigo de hostname no autorizado (110200). No interpretar el script cargado
como una verificacion completada ni emitir tokens ficticios en produccion.

El formulario ahora carga el control al mostrarse, mantiene visible su estado
y ofrece un reintento manual sin limpiar las credenciales. Los fallos de carga
tienen timeout y eliminan el script fallido para permitir una solicitud nueva.
En formularios menores de 300px se usa el modo compacto oficial, sin recortar
el desafio. Los errores, vencimientos y timeouts invalidan el token; la API de
Auth no se llama si falta. No se modifico la validacion del servidor.

Las pruebas locales usan solo un proveedor simulado y no acreditan una solucion
del desafio real. Luego el titular completo el acceso en el origen nuevo: la UI
confirmo cuenta conectada y datos sincronizados. Mi espacio listo y actualizo
las carpetas reales de Drive, y Materias cargo la catedra y sus permisos.
El presupuesto de CPU y la entrega de notificaciones siguen siendo puertas de
corte; ver cloudflare-runtime-readiness.md.

Referencia de errores y configuracion oficial:
https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
