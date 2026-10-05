# Estudiemos: revision de lanzamiento

Fecha: 5 de octubre de 2026. Revision del codigo y pruebas controladas sobre la version publicada y una copia local aislada. Sin compras, SMS, llamadas a modelos de IA ni cambios en cuentas reales.

## Conclusion honesta

La aplicacion tiene una base de seguridad razonable para un lanzamiento piloto. No es posible garantizar seguridad absoluta ni ausencia de todos los errores. Esta revision encontro problemas concretos, los corrigio y agrego pruebas de regresion. No es una certificacion ni un pentest externo completo; no se utilizo Strix.

Mi recomendacion: empezar con 15-30 estudiantes durante dos semanas, medir uso real y corregir fricciones antes de una promocion masiva. No seguir agregando efectos o herramientas sin comprobar primero que la gente vuelve a estudiar con la app.

## Correcciones aplicadas

| Punto | Problema | Correccion |
| --- | --- | --- |
| Titulos externos | Un titulo recibido de noembed se insertaba como HTML en las paginas de temas. Un titulo malicioso podia introducir elementos y eventos. | Crear el titulo con `textContent` en las 28 paginas y plantillas afectadas; prueba con contenido malicioso. |
| Politica de scripts | La CSP permitia cualquier script inline y cualquier archivo del CDN. | Hashes para el codigo conocido, cuatro handlers de navegacion aprobados y una unica ruta versionada del cliente Supabase. Sin `unsafe-inline` ni `unsafe-eval` en scripts. |
| CDN alternativo | El proxy comprobaba la integridad del cliente Supabase, pero la alternativa directa al CDN no lo hacia. | SRI con el mismo SHA-256 y CORS anonimo en esa alternativa. |
| Configuracion publica | Una clave privada cargada por error en la variable publica podia ser enviada al navegador. | Aceptar solamente `sb_publishable_` o JWT legacy con rol `anon`; devolver 503 sin revelar la clave en cualquier otro caso. |
| Acceso administrativo | Una cadena Unicode con la misma longitud de caracteres pero distinta longitud de bytes hacia fallar `timingSafeEqual`. | Comparar primero la longitud de bytes y limitar el tamano del token. Las entradas invalidas se rechazan sin excepcion. |
| Safari movil | Un pequeno desborde decorativo podia permitir desplazamiento horizontal. | Limitar el desborde horizontal del documento y del cuerpo de la app; probar que no se puede desplazar lateralmente y que los controles quedan dentro de la pantalla. |
| Futuras filtraciones | Algunos formatos de scripts no se escaneaban; faltaban exclusiones para archivos privados de firma y respaldos. | Ampliar formatos y patrones del scanner, excluir material privado de Git y del despliegue, y verificar hashes CSP en CI. |

## Comprobaciones realizadas

- Dependencias Node: `npm audit`, sin vulnerabilidades conocidas encontradas. Dependencias web y Android versionadas: consultas a OSV sin hallazgos.
- Archivos actuales: scanner de secretos ampliado. Historial: Gitleaks en GitHub Actions, con valores redactados. Un resultado negativo no prueba que nunca haya existido otra copia de una credencial.
- Produccion: respuestas privadas con 401, sin cache; HTTPS y cabeceras de proteccion presentes.
- Produccion: acceso anonimo a `user_states`, `workspace_items`, `user_registry`, Amigos, snapshot de alarmas Windows y limitador distribuido rechazado.
- Produccion: intento ficticio de login sin CAPTCHA rechazado por Supabase por falta de CAPTCHA; no se creo ninguna cuenta ni se envio correo.
- PostgreSQL local con las reglas reales: un alumno no puede leer, actualizar, borrar ni apropiarse del estado de otro. Esto prueba las migraciones del repositorio; no sustituye una prueba con dos cuentas reales contra produccion.
- Amigos: flujo completo con dos usuarios ficticios, solicitudes por usuario/correo/enlace, aceptacion, bloqueo, privacidad y ranking.
- Alarmas: fechas, recurrencias, deduplicacion, adelanto de 30 segundos, feed limitado al propietario, credenciales protegidas y ejecucion oculta de Windows.
- Interfaz: Chromium y WebKit, anchos 1440, 390 y 320, temas claro y oscuro, tarea manual, alarma, Pomodoro, Amigos y texto malicioso tratado como texto.
- Instalacion y visuales: anchos 1440, 1024, 390 y 320, enlace Windows unificado, aro por cursor/teclado y pixels/movimiento de los graficos. Calendario e importacion de tareas compartidas comprobados.
- IA y Mi espacio permanecen en Proximamente; pruebas confirman que no llaman al modelo ni consumen cuotas al usar las superficies desactivadas.

## Claves publicas no son claves privadas

Es normal que el navegador vea la clave publishable/anon de Supabase y, si se configura Android, el identificador API publico de Firebase. La proteccion depende de autenticacion, RLS, reglas y restricciones del proyecto, no de esconder esos identificadores. Nunca deben llegar al navegador claves `service_role`, `sb_secret_`, Gemini, tokens administrativos ni claves privadas de firma o de Web Push.

Firebase recomienda restringir esas claves a las APIs necesarias y usar otra clave privada para servicios como Gemini. Fuentes: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Firebase API keys](https://firebase.google.com/docs/projects/api-keys).

## Pendientes que no se deben dar por resueltos

1. Notificaciones Web Push: el endpoint publicado `api/widget-push?mobilePush=1` devuelve `enabled: false`. El RPC de disponibilidad no esta accesible en la comprobacion publica. No se debe prometer que iPhone avisa con la app cerrada hasta activar y comprobar el servicio, su heartbeat y un telefono real. Android usa otra entrega nativa y tambien requiere prueba fisica aparte.
2. Recuperacion: verificar un respaldo privado completo y ensayar restaurarlo en un entorno separado. El Excel de usuarios no respalda tareas, configuraciones ni archivos. En Free, Supabase recomienda exportaciones periodicas fuera del proyecto: [backups](https://supabase.com/docs/guides/platform/backups). No se activo ningun complemento pago.
3. Cuentas del dueno: confirmar 2FA en Google, GitHub, Vercel y Supabase, y que la hoja de usuarios no este compartida publicamente. Esta revision no pudo comprobar esos ajustes: el conector Vercel no tenia acceso al proyecto. No se deben marcar como hechos.
4. Pruebas fisicas: instalacion desde cero y alarma con la app cerrada en otra PC, un Android real y un iPhone real. WebKit no reproduce todos los permisos, ahorro de bateria ni notificaciones de iOS.
5. Autenticacion completa: confirmar recepcion de verificacion y recuperacion de correo con cuentas piloto. CAPTCHA se comprobo en servidor, pero no se automatizo el desafio humano ni se enviaron correos reales.
6. Politicas y uso de datos: revisar que la declaracion de privacidad describa los proveedores y el registro de correos en la hoja. La app no ofrece cifrado de extremo a extremo de las tareas: los administradores autorizados del backend tienen acceso privilegiado.
7. Hosting: comprobar el plan y uso permitido antes de promocionar como negocio. No cobrar todavia no convierte automaticamente un proyecto empresarial en no comercial. Hobby es para uso personal no comercial: [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines). No se contrato ni cambio ningun plan.

## Prioridades de producto

- Reducir el primer recorrido a crear una tarea, programar una alarma y completar una sesion. Ayuda contextual corta; permisos solamente al activar la funcion correspondiente.
- Una experiencia inicial simple, y personalizacion avanzada opcional. Respetar movimiento reducido y evitar animacion permanente que compita con estudiar o consuma bateria.
- Medir registro confirmado, primera tarea, primer Pomodoro y regreso a los 7 dias. Nunca enviar titulos de tareas, correos, tokens ni contenido de apuntes como eventos analiticos.
- Obtener comentarios de alumnos de ingenieria sobre un problema concreto: olvidos, falta de constancia o semana desordenada. No medir exito solamente por descargas.
- Como futuras funciones: plan de repaso ligado a la fecha de parcial, repeticion espaciada y simulacros con seguimiento. Un futuro plan pago deberia aportar valor recurrente, no depender principalmente de almacenamiento o de configurar la rutina una sola vez con IA.

## Marketing organico recomendado

Usar solo cuentas oficiales y una cuenta piloto sin datos personales. Videos verticales de 12-25 segundos, una dificultad y una funcion real por video; tres conceptos semanales adaptados a Reels, TikTok y Shorts, sin boosts ni herramientas pagas. Es una propuesta de trabajo, no una garantia de viralidad.

| Concepto | Demostracion real | Cierre |
| --- | --- | --- |
| Me acorde del parcial demasiado tarde | Tarea y alarma programada | Probala gratis. |
| Cerre la app y la alarma igual aparecio | Alarma de Windows sobre otra aplicacion | Organizate antes del proximo parcial. |
| Asi organizo mi semana en 15 segundos | Calendario e Inbox | Mandaselo a tu companero. |
| Estudie o solo tuve el PDF abierto | Pomodoro y minutos reales del progreso | Proba una sesion hoy. |
| Mi grupo tambien esta estudiando | Amigos y racha compartida por eleccion | Invita a tu grupo. |

Probar dos ganchos por concepto. Comparar retencion inicial, finalizaciones, compartidos y registros confirmados, no solo vistas. Usar las estadisticas nativas de las cuentas; no hace falta sumar una suscripcion de marketing. No anunciar IA, archivos, WhatsApp, chat o llamadas mientras esas funciones no esten disponibles.

## Mantenimiento

Mantener las comprobaciones de seguridad por PR y semanales ya configuradas. Revisar alertas accionables en lugar de generar monitoreo excesivo. Rotar una credencial si aparece evidencia de filtracion; no rotar todas sin motivo ni romper dispositivos conectados innecesariamente.

Si cambia codigo inline: ejecutar `node scripts/csp-check.js --write`, revisar el diff y volver a comprobar en navegador. Para repetir esta revision, usar `tests/security-*.test.js`, `tests/launch-audit.smoke.cjs` y `tests/security-public.smoke.cjs`. Los tests de navegador requieren el Playwright local existente en `tmp/ui-check`; los artefactos quedan fuera de Git y del sitio publicado.
