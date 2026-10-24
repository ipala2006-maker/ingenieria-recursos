# Clases: Profesores y Alumnos

## Uso

1. Abrir **Clases** desde el icono de graduacion en la barra superior.
2. El profesor elige **Crear clase**, indica el nombre, su nombre visible y,
   opcionalmente, la escuela o universidad. Obtiene un codigo y un enlace.
3. Los alumnos inician sesion y eligen **Unirme**. Tambien pueden abrir el enlace;
   el codigo queda preparado mientras completan el inicio de sesion. La union
   requiere pulsar **Unirme y agregar sus fechas**, nunca se realiza por un GET.
4. El profesor publica actividades en **Fechas**, con fecha real, horario o todo
   el dia, color, detalle y repeticion semanal opcional.
5. Las fechas se muestran en el calendario de cada miembro, identificadas por
   clase y en modo lectura. **Ver clase** abre su contenido. El filtro **Mis clases**
   las separa de notas y horarios personales.
6. En **Materiales**, el profesor elige un archivo/carpeta desde su Mi espacio
   conectado, o pega un enlace de Google Drive. Los alumnos lo abren en Drive.

El profesor puede modificar o quitar contenidos, revisar los alias de sus alumnos,
quitar alumnos, cambiar el codigo y archivar/reactivar la clase. Al salir o quitar
una clase, sus fechas desaparecen sin borrar anotaciones personales. Cambiar el
codigo invalida el enlace anterior, sin expulsar a quienes ya estan inscriptos.
El chat no forma parte de esta version y no se muestra un control inactivo.

## Drive y Privacidad

- Solo se publica el titulo y enlace elegidos; nunca tokens ni el resto del Drive.
- No se suben copias de los archivos a Supabase ni se modifica el acceso de Google.
- El profesor debe compartir el archivo en Drive con las cuentas de sus alumnos
  o con la modalidad de enlace que decida conscientemente usar.
- Salir de una clase NO revoca permisos que alguien ya tenga en Google Drive.
- Las escuelas pueden restringir enlaces externos o comparticion desde Workspace;
  Clases no evita esas restricciones.
- Los alumnos no reciben correos ni la lista de otros alumnos. El profesor ve
  solo alias o identificadores genericos, nunca correos ni datos personales ajenos.
- No se verifican titulos docentes ni pertenencia institucional: profesor significa
  creador/administrador de esa clase. El codigo debe distribuirse a su grupo real.
- El horario de cada actividad se conserva en la zona horaria de la clase, indicada
  en su agenda y detalle del calendario; no se crean alarmas por defecto.

## Arquitectura

- `supabase/classrooms.sql`: tablas propias con RLS forzada y sin acceso anonimo
  ni directo para authenticated; RPC `classroom_action` solo para service_role.
- `api/account-config?classes=1`: reutiliza la funcion existente de Vercel;
  autentica el Bearer y fija el usuario del servidor, valida datos y limita trafico.
- `shared/classrooms.js`: validacion compartida y proyecciones del calendario,
  reutilizando las reglas de horarios existentes, sin copiar tareas por alumno.
- `scripts/classroom-sync.js`: cache local ligada a la cuenta, checksum condicional,
  invalidacion al salir/cambiar cuenta, proteccion de carreras y reintentos acotados.
- `scripts/classrooms.js` y `styles/classrooms.css`: interfaz cargada al abrirla.
- `scripts/workspace-drive.js`: selector de materiales con el acceso ya autorizado.

No se agrega un servicio, secreto, suscripcion, almacenamiento de archivos ni API
paga. El uso de tablas y transferencia se suma al consumo normal de Supabase y
Vercel; no implica capacidad ilimitada ni cambia el plan contratado.

La cache no integra `user_states`. Se descarga una sola definicion por actividad,
no cientos de ocurrencias. Si nada cambio, la RPC retorna solo el checksum. Al
volver a la app se consulta con un enfriamiento de 30 segundos; con clases activas
hay un respaldo cada 5 minutos, o 1 minuto con Clases abierto, solamente visible.
Sin clases no hay consulta periodica; errores aplican espera creciente hasta 10 min.
Un profesor o alumno puede actualizar manualmente. No se promete tiempo real.

Limites iniciales para evitar abuso y consumo inesperado: 10 clases creadas,
30 inscripciones por cuenta, 400 alumnos, 100 actividades y 50 enlaces por clase.
Son limites de esta implementacion, no cuotas oficiales ni garantias de escala.

## Activacion

1. En el proyecto Supabase de Estudiemos, ejecutar `supabase/classrooms.sql` desde
   SQL Editor. Es transaccional e idempotente, no borra tablas ni datos existentes.
   Requiere el esquema de Amigos ya instalado para consultar los alias existentes.
2. Publicar la rama/PR despues de verificar la migracion. No usar anon ni habilitar
   acceso directo al cliente para intentar resolver un error de permisos.
3. Probar con dos cuentas confirmadas: crear, unirse, publicar/editar/quitar una
   fecha, abrir un material, salir y comprobar que no quedan fechas compartidas.

## Pruebas

- `node --test tests/classrooms.test.js tests/classroom-sync.test.js`
- `node tests/classrooms.smoke.cjs` usa Chrome, HTTP real y PGlite temporal.
- PowerShell: `$env:TEST_WEBKIT='1'; node tests/classrooms.smoke.cjs`
- La prueba de navegador usa `tmp/ui-check/node_modules/playwright`, igual que
  otros smoke tests del repositorio; no utiliza cuentas ni credenciales reales.

El icono graduation-cap proviene de Lucide 0.468.0 bajo la licencia ya incluida en
`assets/icons/LUCIDE-LICENSE`.
