# Correcciones de flujo y sincronizacion

## Sincronizacion

La RPC `supabase/account-sync-delta.sql` es aditiva y usa SECURITY INVOKER:
solo autenticados y el mismo RLS de `user_states`, sin aceptar un user_id ajeno.
Se intercambian las herramientas que cambiaron, no la agenda entera por cada
minuto de estudio. Un control de revision rechaza escrituras concurrentes;
el cliente vuelve a leer y combinar antes de reintentar. Clientes viejos siguen
funcionando. Si falta la RPC, el cliente nuevo vuelve al transporte anterior.

Prueba reproducible: 600 notas, perfil de 41.856 bytes, 60 avances de estudio.
Antes: 2.511.360 bytes enviados por perfiles completos. Ahora: 104.580 bytes,
95,84% menos enviados en esa prueba. No es una promesa de facturacion, ni una
medicion de la cuenta real. No incluye TLS, cabeceras, autenticacion, Drive ni
otros dispositivos. Los contadores antiguos no se borran ni se reinician.

## Invitaciones

El enlace abre la pagina de instalacion y prepara una vista de las fechas
publicadas. Tener el codigo permite consultar titulo, responsable y fechas,
pero no notas detalladas, archivos, miembros, correos ni credenciales.
La vista queda en ese navegador por hasta 7 dias. Al iniciar sesion se realiza
un POST autenticado de inscripcion; no se crea una cuenta ni se instala software
automaticamente. Una cuenta ya conectada se incorpora sin otro boton Aceptar.

El sistema operativo no permite detectar con certeza toda instalacion ni
transferir el almacenamiento de Chrome a un APK o Safari. Despues de instalar
Android, abrir de nuevo el enlace y tocar Abrir app instalada permite recuperar
la invitacion. El codigo tambien sigue siendo util como alternativa.

El alumno puede quitar la materia de su lista. El responsable puede eliminarla
para todo el curso, con confirmacion: se borran fechas, enlaces e inscripciones,
no los PDFs de Drive ni notas personales. La eliminacion no es reversible.

## Tutorial y Drive

El tutorial avanza tocando la mitad derecha y retrocede en la izquierda;
tambien admite flechas y Escape. No muestra Anterior/Siguiente. Evita cerrar
y reabrir paneles cuando no hace falta y reduce el desenfoque para bajar costo
grafico. Conserva Omitir y no modifica tareas ni solicita permisos.

Drive diferencia una conexion no habilitada de un error temporal. La consulta
de configuracion tiene timeout y Reintentar repite la inicializacion si fallo.
Un usuario sin sesion puede abrir el login desde Conectar Drive. Se conserva
la carpeta actual al actualizar y no se borran archivos para recuperar la vista.

## Verificacion

Pruebas unitarias y de SQL con PGlite, regresion de toda la app y recorridos
Chrome/WebKit: tutorial, notas, alarmas, calendario, Pomodoro, layout, Drive,
invitacion, registro simulado, inscripcion automatica, salida y eliminacion.
Los perfiles, permisos y archivos reales no se usan como datos descartables.
