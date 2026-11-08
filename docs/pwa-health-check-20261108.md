# Health check de Estudiemos

## Hallazgos

| Prioridad | Hallazgo | Tratamiento |
| --- | --- | --- |
| Alta | El tutorial solicitaba `driver.js.mjs` y produccion devolvia 404. La lista de empaquetado no incluia ese modulo. | Incluir el archivo exacto, con URL versionada y comprobacion publica de MIME/estado. |
| Alta | Un rechazo de Auth podia dejar los controles ocupados. El cierre de sesion podia borrar cambios locales aunque la sincronizacion hubiera fallado. | Liberar los controles en `finally`, diferenciar sesion de sincronizacion y proteger los cambios pendientes antes de cerrar. |
| Media | El formulario de notas podia fallar sin feedback o guardar antes de tener un estado local asociado a la cuenta. Los errores de red de Catedras podian mostrar un mensaje tecnico. | Conservar los borradores del formulario y permitir reintentar. No reintentar automaticamente las escrituras de Catedras. |
| Baja | El enlace directo al Pomodoro intentaba activar Web Audio antes de un gesto. | Esperar activacion del usuario en navegadores que la indican. |
| Baja | Cloudflare Web Analytics inyecta un beacon que la CSP bloquea. El CMP de InMobi tambien emite avisos de proveedor. | No ampliar CSP ni modificar configuracion de privacidad en este PR. Si el beacon no se usa, desactivar solo su inyeccion automatica. |

## Produccion observada

- Inicio, Materias, Mi espacio, Instalar, Inbox, widget Calendario y los accesos
  directos a Agenda/Pomodoro respondieron con HTML 200. Un codigo de catedra
  inexistente devolvio la pantalla propia de invitacion no disponible, con 404.
  La invitacion valida y la incorporacion se ejercitan con una base aislada.
- El service worker no intercepta archivos estaticos. Solo conserva datos
  operativos de widgets y notificaciones, no JS, CSS ni HTML. El worker y el
  manifiesto se revalidan; las vistas HTML y archivos comprobados respondieron
  con `max-age=0, must-revalidate`. La PWA no se convierte en una app que pueda
  abrirse desde cero sin conexion; se conserva el trabajo local ya disponible.
- En Chrome con 4G simulado (4 Mbps, 100 ms) y perfil nuevo, la primera pintura
  de contenido del inicio fue de aproximadamente 1,0 s; el evento `load` fue
  de 2,65 s y los recursos del dominio transfirieron aproximadamente 571 KiB.
  Plus Jakarta Sans se cargo y no se observaron imagenes rotas en las vistas
  inspeccionadas. Es una medicion puntual, no un percentil de usuarios reales.

## Verificacion de la correccion

- `npm run cloudflare:check` y `node scripts/csp-check.js`.
- `node --test tests/pwa-health.test.js tests/public-origin.test.js tests/classroom-sync.test.js`.
- `node tests/onboarding.smoke.cjs --built` prueba el paquete publicado en vez
  del arbol fuente. Las pruebas de Catedras y de recuperacion usan cuentas de
  prueba; no cambian contrasenas, anotaciones ni membresias en produccion.
- Tras publicar, ejecutar `node scripts/verify-public-origin.cjs`. Debe
  comprobar el modulo JS, las fuentes, el HTML, el manifiesto y su
  revalidacion. Antes de publicar esta correccion, el 404 del modulo sigue
  siendo esperado en produccion.
