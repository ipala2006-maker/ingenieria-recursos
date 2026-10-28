# Acceso Free / Pro: implementacion preparada

Estado: rama de revision basada en PR #103. No se activo monetizacion ni se
modifico produccion. `APP_ACCESS_MODE` ausente o distinto de `restricted` mantiene
el piloto completo y no agrega consultas de planes al inicio de sesion.

## Reglas acordadas

| Acceso | Herramientas |
| --- | --- |
| Free | Catedras, crearlas, consultar/guardar sus archivos y calendario con sus funciones |
| Pro activo | Todas las herramientas publicadas |
| Titular real de alguna catedra | Acceso completo, sin llamarlo suscripcion paga |
| Piloto | Todas las herramientas publicadas, sin cobros |

Inbox independiente, Pomodoro, progreso, Amigos, Mi espacio personal y ajustes
del inicio se clasifican como avanzadas. Una nota creada desde el calendario
sigue siendo parte del calendario. Los archivos de una catedra no dependen de
que el alumno compre Mi espacio. IA, WhatsApp y almacenamiento legado siguen
sujetos a sus flags de publicacion: tener Pro NO reactiva servicios retirados.

**Consecuencia comercial expresa:** crear una catedra es gratis y su titular
obtiene acceso completo. Por tanto esta regla permite conseguir acceso completo
sin pagar creando una catedra. No es una proteccion contra esa via de acceso.
Para evitarla habria que cambiar el acuerdo, no esconder una restriccion en el codigo.
Los delegados no heredan Pro global; conservan sus permisos dentro de su catedra.

## Interfaz

Abrir una invitacion o una materia concreta como alumno utiliza una vista
enfocada de pantalla completa. No muestra herramientas personales de fondo.
"Abrir Estudiemos" y Escape permiten salir normalmente; no es un encierro.
El titular y un Pro verificado mantienen la vista normal con toda la app.

En el futuro modo restringido, el inicio muestra calendario y catedras sin
reescribir la distribucion personal guardada. Las herramientas avanzadas quedan
identificadas en el menu con un indicador Pro pequeno. Una accion voluntaria
muestra un estado informativo dentro de la pagina, nunca un modal, cuenta
regresiva, precio, checkout ni aviso automatico para comprar.

## Autoridad y limites de esta etapa

- `get_app_access()` obtiene el usuario de `auth.uid()`, sin aceptar un ID ajeno.
  Consulta por indices de titularidad y plan; no exporta agendas o listado de alumnos.
- Solo `pro` con estado `active` y periodo vigente (o sin vencimiento impuesto
  por el administrador) cuenta como Pro. `test`, `cancelled` y `past_due` no cuentan.
- Elegir "Profesor", editar localStorage o mandar `planId` en un cuerpo HTTP no
  concede permisos. La API devuelve los hechos verificados por la base.
- Las politicas existentes de miembros, moderadores, archivos y RLS no cambian.
- Se consulta acceso una vez por cuenta en modo restringido, reutilizando la
  respuesta por 60 segundos; no se agrega polling. Cambiar titularidad invalida
  esa lectura. Las respuestas de otra cuenta se descartan.
- La ruta de acceso usa 120 peticiones/minuto por identidad autenticada y un
  techo compartido de 1.000 por IP; no hereda el antiguo limite de 60 por IP.
  Se mantiene una admision previa acotada antes de autenticar, sin confiar en
  cabeceras de identidad del navegador.
- Los controles del navegador son presentacion, no DRM: una funcion local/offline
  puede manipularse por su propio usuario. No se promete un paywall inviolable.

## Puertas antes de activar restricciones

1. Revisar y aplicar `supabase/app-access.sql` y probar el endpoint autenticado
   `/api/plan-status?access=1`. La migracion es solo lectura, no crea cobros ni planes.
2. Completar controles de acceso por capacidad en las rutas pagas que consumen
   recursos (especialmente Drive personal, widgets y Amigos), conservando siempre
   la consulta/descarga de materiales de catedra y la desconexion/exportacion propia.
   Esta rama no cambia esos permisos ni restringe tokens OAuth ya emitidos.
3. Definir quien provisiona planes activos desde una pasarela validada, revocacion,
   transicion de usuarios actuales y restauracion de datos al recuperar acceso.
   El boton de autoasignacion de planes sigue desactivado.
4. Probar cuentas Free, Pro, titular, delegado, alumno expulsado y cambio de cuenta,
   incluyendo enlaces directos y clientes Android/Windows de versiones anteriores.
5. Solo entonces cambiar `APP_ACCESS_MODE=restricted` en un despliegue de prueba,
   validar y aprobar la activacion publica. Nunca usar un flag de localStorage.

El PR #103 puede seguir revisandose como migracion de infraestructura. Este
cambio se entrega aparte para no mezclar el corte de hosting con restricciones
comerciales. No se necesita tocar cuotas ni precios del catalogo historico ahora.

## Verificacion de esta entrega

- Regresion completa: 499/499, sin omisiones, con fixtures Windows aislados.
- Despues del ajuste del limite por usuario: 11/11 pruebas enfocadas de acceso,
  configuracion publica y lanzamiento comercial oculto.
- HTTP + SQL reales sobre datos ficticios: alumnos/profesores, permisos,
  invitaciones, archivos, calendario, conflictos y diseno de 390/1440 px.
- Cambio Free -> Pro conserva la distribucion personal; no aparecen modales
  de venta. Respuestas tardias de otra cuenta no conceden acceso.
- Runtime local real de Workers: rutas privadas, headers/CSP, descargas y tema
  claro/oscuro en escritorio/movil aprobados. Seguridad y CSP aprobados.
- Entrega real push: NO confirmada; ver `workers-provider-validation.md`.
