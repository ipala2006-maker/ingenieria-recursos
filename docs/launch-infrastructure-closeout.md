# Cierre de infraestructura del piloto

## Orden de publicacion

1. Ejecutar las pruebas y revisar el PR.
2. Aplicar `supabase/launch-legacy-retirement.sql` en produccion con el sistema de migraciones. Es transaccional e idempotente; no elimina datos.
3. Publicar el codigo nuevo y comprobar las rutas indicadas abajo.
4. Inventariar y limpiar los despliegues, verificando de nuevo el ID de produccion despues del despliegue.

## Alarmas Windows

- `GET /api/widget-link?alarmFeed=1` sin `alarmSetup` recibe una redireccion CDN HTTP 307 hacia un JSON estatico cacheable. No ejecuta la funcion ni consulta Supabase. Al seguir la redireccion, la respuesta estatica es HTTP 200 con `deprecated:true`, no una agenda vacia valida. La redireccion tiene prioridad sobre la ruta API existente; una reescritura comun no la tiene.
- Si se invoca directamente el handler sin la redireccion, responde HTTP 410 antes de autenticacion, cuota o consultas.
- Los RPC antiguos `get_windows_alarm_snapshot` y `get_windows_study_goal` devuelven constantes sin leer `user_states`, por si queda algun cliente anterior.
- La conexion local 2.0.0 conserva el consentimiento, token firmado de dos minutos y comprobante de la misma cuenta. Solo durante esa conexion llama al nuevo RPC privado `get_windows_local_setup_snapshot`, con un maximo de 500 alarmas y el agregado del objetivo del dia. No emite una nueva credencial de sondeo de 90 dias.
- El reloj y la ejecucion local no cambian. Una PC con software viejo debe actualizar y volver a conectar el complemento. Una respuesta del servidor no puede hacer que ese programa deje de realizar peticiones HTTP; estas llamadas ya no llegan a la base de datos.
- Los instaladores anteriores a 2.0.0 reciben una indicacion de actualizacion y no pueden confirmar una conexion nueva.

## Archivos historicos y planes

- El bucket privado `workspace-files` conserva sus objetos y politicas de lectura y eliminacion del propietario. Se niegan INSERT/UPDATE para anon/authenticated mediante politicas restrictivas.
- Se retiran INSERT/UPDATE de la tabla antigua `workspace_items` y permisos innecesarios TRUNCATE/TRIGGER/REFERENCES; no se borran filas ni se mueven archivos. Las subidas nuevas siguen por Drive.
- `set_test_plan` ya no es ejecutable por los clientes ni `service_role`; su cuerpo tampoco permite asignaciones. El API de planes rechaza esa operacion con HTTP 410 antes de consultar servicios. Los planes existentes, catalogo historico y referidos no se alteran.

## Arranque de escritorio

- La fuente y CSS profesional se cargan de forma critica, sin insertar estilos de geometria tarde.
- `home-boot.js` calcula la misma distribucion local con `HomeBoard` antes del primer render del contenido. No sincroniza, escribe preferencias, tapa toda la pagina ni agrega temporizadores.
- El editor completa la inicializacion y retira ese CSS temporal. Se reserva la altura de la barra superior. En movil se mantiene la navegacion existente.
- El service worker existente no cachea los assets de la app; no hay una lista de precache que duplicar ni invalidar.

## Vercel: limpieza segura

La retencion nativa aplicada es un dia para previews/cancelados/errores y 30 dias para produccion. La API no permite ajustar `deploymentsToKeep`: devuelve un minimo de 10 y ademas existen excepciones por alias/ramas. Esta politica por edad no garantiza conservar exactamente dos versiones.

Para obtener exactamente produccion y su respaldo anterior se usa el script de mantenimiento. Usa el CLI oficial autenticado, inventaria todas las paginas, verifica el proyecto y detiene el proceso si cambia produccion, falta un respaldo READY o hay builds en curso. No lee ni cambia variables ni archivos de usuarios.

```powershell
# Reemplazar las rutas y el ID por los verificados en ese momento.
node scripts/prune-vercel-deployments.cjs --cli <RUTA_AL_CLI_OFICIAL> --project prj_BDIVyIanCqTDh32fhWkloZJi9Cbp --team team_hPWQUVpRlY5E5VjE9nBQ1CL2 --expected-production <ID_PRODUCCION_ACTUAL> --report tmp/vercel-prune-plan.json
# Revisar keep/candidates. Solo despues agregar --apply para ejecutar.
```

El modo de escritura usa `--dangerously-skip-permissions` del CLI exclusivamente para los DELETE ya inventariados, tras la autorizacion explicita del propietario. El modo predeterminado no borra nada. Los informes locales no se publican.

Deployment Storage se mide por almacenamiento a lo largo del periodo (GB-mes), no como espacio de usuarios en Supabase. Borrar despliegues evita acumulacion futura; no resta el consumo historico ya medido ni garantiza que el panel baje inmediatamente. Tampoco elimina el codigo de Git.

## Comprobaciones

- Comparar antes/despues cantidad, bytes y huella agregada de `storage.objects` para `workspace-files` sin descargar contenido.
- Revisar ACL de los RPC, cuerpos constantes antiguos y politicas restrictivas.
- Comprobar en produccion la respuesta estatica de alarmas viejas y HTTP 410 para asignaciones de planes.
- Ejecutar `node --test tests/*.test.js` y las pruebas CJS de alarmas, almacenamiento local, interfaz y privacidad de CI.
- Ejecutar `node scripts/security-check.js` y `node scripts/csp-check.js`.
- Con el servidor de fixtures local en 8183: `node tests/home-startup.smoke.cjs` y `node tests/ui-flow.smoke.cjs`. Para WebKit usar `$env:TEST_WEBKIT='1'` en PowerShell. La prueba de arranque retrasa el editor y compara la geometria visible antes/despues; tambien controla CLS, errores JS y overflow.
- No se afirma que las pruebas locales validen entrega fisica de SMS/push ni todos los dispositivos reales. Estas correcciones no activan servicios pagos.
