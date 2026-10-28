# Migracion de hosting a Cloudflare: estado y puertas de corte

Fecha: 28 de octubre de 2026. Supabase BD/Auth y Google Drive se conservan.
No se contrataron servicios, activaron pagos ni cambiaron las claves originales.

## Estado real

- Candidato desplegado: https://estudiemos-candidate.estudiemos-services.workers.dev
- Workers HTTP adapta los 12 endpoints existentes, sin rehacer permisos/RLS.
- Estatica por CDN y binding ASSETS, sin invocar JavaScript en cada asset.
- Invitaciones `/materia/:code` y `/amistad/:token` conservan HTML y Open Graph.
- Fuentes, .env, respaldos, pruebas y herramientas operativas no son assets.
- CPU probe aislado: `estudiemos-cpu-probe`. No contiene claves de produccion.
- Despachador aislado desplegado, desactivado: `estudiemos-push-candidate`.
  No carga HTML, clases, SDK de Drive ni el transporte Node de web-push.
- El candidato sigue SIN secretos de produccion. No es el sitio para registrar
  alumnos, instalar una nueva PWA ni conectar cuentas durante esta etapa.
- Produccion, cron, callbacks, instaladores y sesiones actuales siguen en Vercel.
  No se aplico todavia el SQL preparado ni se publicaron APKs con otro origen.

## Compatibilidad y seguridad

`cloudflare/http-adapter.mjs` conserva metodos, JSON, query repetida, cookies,
redirecciones, HEAD y bytes originales del webhook. Limita el cuerpo antes de
parsearlo y elimina cabeceras forwarded falsificables. Usa Host de la URL y
CF-Connecting-IP de la plataforma para los controles existentes.

Workers no implementa `redirect: 'error'`. El ensayo real detecto este quiebre:
el transporte usa `manual` y rechaza respuestas no exitosas sin seguirlas.
No agrega reintentos HTTP invisibles ni expone errores/credenciales al cliente.

Templates HTML via import de texto en Workers; lectura de disco solo en Node.
Vercel incluye explicitamente ambos templates en el empaquetado de la funcion.
Los secretos se leen en runtime, no se sustituyen en JS publico durante build.
Los logs de invocacion del candidato estan desactivados para no almacenar
URLs con codigos OAuth, invitaciones o tokens; los contadores no incluyen tareas.
La telemetria completa del probe solo observa datos ficticios.

## CPU y capacidad de despacho

Se ejecutaron dos ensayos completos de 100 lotes de cuatro avisos ficticios,
en Workers real, con cifrado Web Push y seis fetches a un binding estatico.
El segundo dio p95 HTTP 100,71 ms. Esto NO es tiempo de CPU ni entrega real.
El panel de Cloudflare mostro percentiles/picos sobre 10 ms en las primeras
versiones del ensayo: no se certifico el perfil de cuatro para Workers Free.

Se preparo un perfil conservador separado `cloudflare-free-small`: dos avisos,
dos envios simultaneos y cuatro subpeticiones logicas por llamada. El perfil de
cuatro del PR #102 queda intacto para comparacion; Vercel sigue con su perfil.
El ensayo Node de 100 lotes de dos termino sin errores HTTP y dio p95 HTTP
93,22 ms, CPU p50 3,09 ms y p99 12,11 ms en la version fada1347: tampoco paso
la puerta estricta de 10 ms. Por eso el candidato usa ahora WebCrypto nativo
mediante `@block65/webcrypto-web-push@2.0.0`, sin cambiar el transporte Vercel.
Se valido descifrando su mensaje con la implementacion independiente http_ece.
El primer ensayo nativo de dos completo 100 lotes (p95 HTTP 102,01 ms).
La primera entrada nativa aun incluia todas las APIs. Se separo una entrada
exclusiva para push: bundle 23,91 KiB (7,13 KiB gzip), arranque 8 ms; probe
26,25 KiB (7,67 KiB gzip), arranque 7 ms. No son CPU por peticion.
El ensayo independiente tambien completo 100 lotes (p95 HTTP 103,81 ms).
La API oficial de Analytics para esa version aislada `0a141c3e` devolvio CPU
p50 4,709 ms y p99 10,752 ms: aun sin margen suficiente para el objetivo estricto.

**Perfil actual: `cloudflare-free-single`, un aviso y tres subpeticiones.**
El ensayo final de 100 peticiones verifico la revision de codigo y la version
`d41540d3-206d-4fba-bc8d-257378687b8c` en cada respuesta. Ventana del cliente:
28/10/2026 16:59:01-16:59:09 UTC. Su p95 HTTP fue 96,94 ms, no CPU.
Cloudflare GraphQL Analytics, con unidades comprobadas por introspeccion del
esquema, devolvio CPU p50 **2,038 ms** y p99 **3,736 ms**, cero errores de runtime
y 297 subpeticiones para 99 invocaciones contabilizadas en la consulta del
proveedor. El cliente completo 100/100; los agregados adaptativos/ventanas del
proveedor no se sustituyen por el contador del cliente. No se envio ningun aviso
real ni se leyo la base de datos. Estos percentiles cumplen el presupuesto en
este ensayo, no certifican todos los futuros casos de produccion ni un SLA.
La CPU debe leerse en Metrics, filtrando por la version medida, sin mezclar
ensayos anteriores ni peticiones 401 durante propagacion del secreto temporal.
El resultado anonimizado queda en `tmp/cloudflare-cpu-probe.json`.

**Todavia falta validar CPU de extremo a extremo con SQL y proveedores reales.**
Los fixtures no miden PostgREST, respuestas reales, FCM, OAuth de Drive, picos
multidispositivo ni garantizan el limite de CPU en todos los centros de datos.
Startup Time de Wrangler tampoco es CPU por peticion. No anunciar un SLA.

El SQL preparado `supabase/mobile-notifications-cloudflare-cron.sql` preserva
Vercel por defecto. Solo cambia destino al configurar en Vault el objeto privado
`estudiemos_mobile_push_dispatch_config`, con URL exacta permitida y batchSize 1.
Un tick vacio no llama Workers. 400 avisos requieren HASTA 400 llamadas, no cuatro.
No redirigir el cron antiguo sin este ajuste: bajaria de 400 a 4 avisos/tick.
El destino del cron es el Worker exclusivo de push, no el Worker de la app.
Se conservan leases, SKIP LOCKED, reintentos y las reglas de ocurrencia originales.
No aplicar ni activar el SQL hasta comprobar cuotas de pg_net y un pico de cola
en un entorno aislado. No ejecutar ambos despachadores sobre la misma cola.

## Secretos: bloqueo para finalizar

La API oficial de Vercel fue consultada sin imprimir valores. Las variables
marcadas `sensitive` no son exportables; Vercel devuelve sus metadatos, no el
secreto. No se agregara una ruta que extraiga secretos de una funcion en marcha.

Para continuar, el titular debe cargar las copias originales directamente en
Cloudflare Settings > Variables and Secrets, o usar Wrangler por stdin. Nunca
pegarlas en chat, commits, argumentos, archivos de build ni capturas.

| Grupo | Variables necesarias |
| --- | --- |
| Cuenta | SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY |
| Drive | GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, DRIVE_TOKEN_ENCRYPTION_KEY |
| Drive configuracion | GOOGLE_DRIVE_APP_ORIGIN, GOOGLE_DRIVE_BROWSE_ENABLED, GOOGLE_DRIVE_PILOT_EMAILS |
| Web Push | WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, MOBILE_PUSH_CRON_SECRET |
| Android | FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID, FIREBASE_SENDER_ID, FIREBASE_ANDROID_APP_ID, FIREBASE_ANDROID_API_KEY |
| Seguridad/operacion | RATE_LIMIT_SECRET, USER_REGISTRY_EXPORT_TOKEN, REFERRAL_PHONE_HASH_SECRET |
| CAPTCHA publico | TURNSTILE_SITE_KEY |

Mantener EXACTAMENTE la clave AES de Drive y el par VAPID. Reemplazarlos sin
migrar datos impediria descifrar autorizaciones o requeriria reinscribir push.
La clave privada de Turnstile se queda en Supabase Auth. La IA y WhatsApp siguen
inhabilitados por release; no es necesario migrar su clave ni activar sus pagos.
La identidad age privada no se mueve. Respaldar los secretos originales tambien
en un gestor seguro independiente: tenerlos solo en un proveedor no es respaldo.

El titular confirmo que NO conserva las copias originales. La continuacion
requiere [el plan de rotacion sin exportar secretos](cloudflare-secret-continuity.md).
No se puede finalizar un corte seguro solo con su autorizacion: no reemplazar
a ciegas la clave AES ni el VAPID, ni introducir una API de extraccion.

## Secuencia del corte

1. Elegir un origen definitivo gratuito y estable. El candidato no es el origen
   de lanzamiento. `estudiemos.estudiemos-services.workers.dev` es una opcion
   prevista, aun no publicada; no anunciar ese enlace como activo.
2. Aprovisionar secretos directamente en el Worker definitivo. `APP_ORIGIN` y
   `GOOGLE_DRIVE_APP_ORIGIN` deben ser ese mismo origen exacto, sin barra final.
3. Google OAuth: agregar ese origen y el redirect exacto
   `ORIGEN/api/account-config?drive=callback`, conservando el anterior durante
   la convivencia. Verificar requisitos de dominio/marca de Google antes del corte.
4. Supabase Auth: agregar redirects exactos para login, registro, recuperacion
   y `widget.html`; conservar anteriores. Cambiar Site URL recien al corte.
5. Turnstile: permitir el nuevo hostname, manteniendo CAPTCHA y el secreto
   existente. No usar comodines globales para resolver errores de callbacks.
6. Probar cuenta de piloto: registro/email, login, renovacion, logout, dos
   usuarios aislados, Drive conectar/listar/subir/copiar/desconectar, catedras,
   moderacion, invitaciones y notificacion real en cada plataforma.
7. Android: origen configurable en Gradle, por defecto Vercel. Compilar con
   `-PestudiemosAppOrigin=ORIGEN`, mismo package y keystore, y versionCode nuevo.
   Validar assetlinks contra la firma antes de distribuir. El bridge solo acepta
   el origen configurado, no cualquier dominio de Cloudflare.
8. Actualizar tambien los instaladores/binarios Windows, enlaces de Rainmeter,
   metadatos canonicos, sitemap y URLs residuales de cliente. No basta cambiar
   MainActivity. El candidato aun descarga el paquete actual de Vercel.
9. Antes de cambiar origen, confirmar sincronizacion del dispositivo anterior;
   proteger notas pendientes y ajustes locales. Cookies, localStorage, IndexedDB,
   permisos push y permisos de archivo NO pasan de un origen al otro. Reinstalar
   PWA cuando corresponda y pedir permisos/reconexion una vez en el nuevo origen.
10. Medir CPU de entrega real, timeouts, ACKs perdidos, reintentos y pico de cola.
    Preparar SQL y fan-out; habilitar PUSH_DISPATCH_ENABLED solo tras estas pruebas.
    Cambiar un solo cron, verificar heartbeat y cola drenada. Comparar demora
    de aceptacion del proveedor con recepcion en dispositivo, no confundirlas.
11. Mantener Vercel y sus callbacks como puente/rollback. El dominio vercel.app
    no se puede apuntar por DNS a Cloudflare. No redirigir APIs, magic links o
    OAuth a ciegas ni enviar tokens de sesion en URLs entre origenes.
12. Tras la cohorte 20/50/100 y verificar datos, retirar el puente gradualmente.
    No borrar datos historicos, el proyecto ni sus secretos como parte del corte.

## Operacion local y repeticion

```powershell
npm ci
npm run cloudflare:check
npm run cloudflare:dev
node tests/cloudflare-runtime.smoke.cjs
node --test tests/cloudflare-adapter.test.js tests/app-feedback.test.js tests/push-dispatch.test.js
```

El dev server usa 127.0.0.1:8190 y, sin .dev.vars, no toca cuentas reales.
`npm run cloudflare:deploy` publica SOLO el candidato. Nunca usar el probe como
despachador. `node scripts/measure-workers-cpu.cjs` renueva un secreto exclusivo
del probe por stdin y ejecuta 100 muestras sinteticas; no envia avisos reales.
Si falla HTTPS no desactivar TLS; esperar aprovisionamiento o diagnosticarlo.
`node scripts/read-workers-cpu.cjs` consulta Analytics con la interfaz oficial
OAuth de Wrangler, exclusivamente en memoria y contra Cloudflare. No lee archivos
de credenciales, no imprime tokens ni escribe tokens en disco. Guarda solo las
metricas agregadas en `tmp/cloudflare-cpu-metrics.json`. El CLI se invoca con
`--json`, cuya salida no pasa por su logger de archivos.

## UX incluida

Oscuro por defecto incluso con una preferencia corrupta; conserva la eleccion
explicita de claro. Feedback de tareas solo con gestos reales, pulso breve sin
desplazar el layout y vibracion de 8 ms donde el navegador la admita. No vibra
por sincronizacion, al desmarcar ni con movimiento reducido. iOS no ofrece la
misma API de vibracion que Android: el feedback visual sigue funcionando.

## Archivos y APIs

- `cloudflare/worker.mjs`, `http-adapter.mjs`, `push.mjs`: entrada, adaptador y envio.
- `cloudflare/push-worker.mjs`, `wrangler.push.jsonc`: despachador sin las APIs pesadas.
- `cloudflare/cpu-probe.mjs`, `wrangler.probe.jsonc`, `scripts/measure-workers-cpu.cjs`, `scripts/read-workers-cpu.cjs`: ensayo aislado y metricas.
- `wrangler.jsonc`, `scripts/build-cloudflare.cjs`, ignores y package-lock: build sin fuentes privadas.
- Helpers API app-origin/document-template, invitaciones, Drive, widget-link,
  mobile-push y supabase-admin: origen, templates y transporte compatible.
- Los 12 endpoints conservan nombres y contratos. Incluye subrutas Drive,
  friends y classes de account-config, mobilePush de widget-push y alarmSetup.
- Android Gradle/Manifest/MainActivity/CourseLinks y prueba: origen configurable.
- theme-init/app-feedback/professional.css: UX liviana, sin nueva libreria de UI.
- Tests y CI: adaptador, allowlist, feedback, runtime visual y dos origenes Android.

Fuentes oficiales: [limites Workers](https://developers.cloudflare.com/workers/platform/limits/),
[assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[metricas CPU](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
[Supabase Free](https://supabase.com/pricing).
