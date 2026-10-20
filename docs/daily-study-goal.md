# Objetivo diario y recordatorios

- Al entrar por primera vez se elige un objetivo de 1 a 720 minutos. Se puede cerrar el selector y elegirlo mas tarde.
- Racha > Objetivo diario permite modificarlo. El objetivo se sincroniza con la cuenta; la disposicion del inicio sigue siendo local a cada dispositivo.
- El dia cuenta al llegar al objetivo, no por abrir la app ni por adelantar el aro del Pomodoro. Solo se acredita estudio real; los descansos no suman.
- Cada dia conserva su objetivo historico. Los dias anteriores a esta funcion mantienen la regla anterior de 25 minutos.
- Cumplir el objetivo detiene los recordatorios de estudio hasta el dia siguiente. No cancela las alarmas de Inbox.
- Solo hay cinco franjas diarias: 12:00, 14:30, 17:00, 19:30 y 22:00 (hora local). Una tolerancia de cinco minutos cubre la suspension breve del sistema; no se recuperan avisos atrasados al abrir la app.
- Con la conexion de Windows vigente, Windows entrega los recordatorios y la web no los duplica. Sin esa conexion, la web sigue disponible como alternativa si el usuario concedio permisos.
- Android confirma el progreso de la cuenta antes de avisar. Si no se puede consultar, omite ese aviso; no deduce que falta estudiar a partir de un cache desactualizado. Las consultas demoradas no restan minutos ganados en el dispositivo.

## Cambio De Dia

- Los segundos pendientes conservan la fecha local en que se estudiaron. Una sesion que cruza medianoche reparte su tiempo entre los dos dias, incluidos cambios de horario de verano.
- Recuperar una sesion vencida de ayer no acredita una hora hoy. El limite es el final real del bloque, nunca las horas transcurridas con la aplicacion cerrada.
- Si el final de una fase lleva mas de un minuto vencido, la siguiente queda pausada. Se conserva el inicio automatico en terminaciones puntuales y al saltar una fase en marcha.
- Web, PWA y widgets web usan `shared/study-credit.js`. Android 1.6.3 guarda el mismo mapa de segundos por fecha; actualizar el APK para corregir tambien su widget nativo.
- Se conserva el historial ya guardado. No se eliminan minutos antiguos automaticamente: los totales anteriores no permiten distinguir de forma fiable un registro erroneo de estudio real.
- Regresion: `node --test tests/study-credit.test.js tests/study-home.test.js`. `node tests/note-entry.smoke.cjs` comprueba que reabrir una sesion de ayer mantiene hoy en cero y no duplica los minutos al recargar.

## Windows

El instalador 1.6.6.0 registra la identidad `Estudiemos.Study` y un acceso de Inicio para notificaciones nativas ToastGeneric, con el logo de Estudiemos. No usa globos de WinForms ni suplanta a Edge. Windows controla su tipografia y respeta No molestar y los permisos del usuario.

Las cinco tareas de racha mantienen sus horarios y preferencias. `StreakReminder.ps1` consulta el progreso del propietario mediante la conexion de alarmas ya autorizada, cifrada por DPAPI. No usa claves privadas en el instalador. Si no hay conexion, objetivo elegido o progreso reciente, no envia recordatorios basados en datos dudosos. La comprobacion periodica de Inbox retira los recordatorios pendientes al detectar el objetivo cumplido y mantiene las alarmas a pantalla completa.

Aplicar `supabase/study-goals.sql` despues de `supabase/friends.sql` en un proyecto nuevo. La migracion es idempotente, no borra datos y no concede acceso a tablas. La funcion `get_windows_study_goal` solo es ejecutable por el servidor: devuelve dia, minutos, objetivo y si fue configurado; nunca correos, tareas, historial o permisos de escritura. El feed conserva su alcance de propietario y vencimiento existentes.

Los usuarios que ya instalaron el componente de Windows deben actualizarlo con la descarga habitual; una pagina web no puede reemplazar scripts locales sin un instalador. La conexion guardada y los horarios se conservan.

## Verificacion

`node --test tests/study-goal.test.cjs tests/inbox-alarm-feed.test.cjs` prueba umbrales, historial, permisos reales de PostgreSQL y contenido de avisos tratado como datos. En Windows incluye pruebas del evaluador nativo sin mostrar avisos ni cambiar tareas.

`node tests/study-goal.smoke.cjs` recorre primer ingreso, guardado, recarga, cambio desde Racha y widget. `TEST_WEBKIT=1` selecciona WebKit; `TEST_BASE_URL=https://estudiemos-app.vercel.app` prueba la publicacion con datos piloto aislados y sin tocar cuentas reales.

Fuentes de implementacion: [identidad de notificaciones de escritorio](https://learn.microsoft.com/en-us/windows/win32/shell/enable-desktop-toast-with-appusermodelid), [identidad y activador en Inno Setup](https://jrsoftware.org/ishelp/topic_iconssection.htm).
