# Materias y Catedras

## Uso

1. Abrir **Materias y catedras**, icono de graduacion en la barra superior.
2. La primera vez elegir **Soy Profesor** o **Soy Alumno**. El rol se puede cambiar
   desde el icono de personas del modulo y se recuerda por cuenta en ese dispositivo.
3. El profesor pasa a `materias.html`, un entorno exclusivo sin herramientas de
   alumno. Crea la materia indicando su nombre y el de la materia/comision.
4. Dentro de cada materia administra todo con **Cargar fechas**, **Anadir archivos**
   y **Compartir link**. Configuracion agrupa alumnos, archivo y cambio de codigo.
5. El alumno conserva la app completa. **Unirme a una materia** acepta enlace o
   codigo, tambien preparados al abrir una invitacion. Pulsa **Aceptar y unirme**;
   el GET del enlace nunca modifica inscripciones. Si necesita iniciar sesion,
   la invitacion queda pendiente durante 24 horas, ligada a su cuenta cuando existe.
6. Si el docente no usa Estudiemos, un alumno elige **Crear espacio de materia**.
   Es el **Colaborador**, administra fechas, archivos y enlace, y puede asignar
  moderadores desde Configuracion > Participantes > Permisos.
7. Las fechas se suman al calendario de los miembros en modo lectura, sin duplicar
   anotaciones personales. Los archivos aparecen en **Archivos** y se abren en Drive.
8. **Cargar fechas** admite parciales/finales (tipo Examen), entregas, clases u otras
   actividades, colores, horario o todo el dia, detalle y repeticion semanal opcional.

El profesor puede modificar o quitar contenidos, revisar los alias de sus alumnos,
quitar alumnos, cambiar el codigo y archivar/reactivar la clase. Al salir o quitar
una clase, sus fechas desaparecen sin borrar anotaciones personales. Cambiar el
codigo invalida el enlace anterior, sin expulsar a quienes ya estan inscriptos.
El chat no forma parte de esta version y no se muestra un control inactivo.

## Rangos y Permisos

### Equipo visible dentro de la catedra

Cada miembro ve el nombre del profesor o colaborador y su propio rol en una
franja compacta, con el correo de Estudiemos del responsable. **Equipo y permisos**
despliega los alias, correos de Estudiemos de los delegados y sus seis permisos
exactos. Delegado es el nombre visible del rango interno
`moderator`; no cambia sus privilegios. Los contactos del equipo se consultan
solo dentro de una catedra a la que la cuenta pertenece, no por codigo publico.
Crear materia y asignar un delegado informan esta visibilidad. El resto de los
alumnos, sus correos, IDs, notas e inscripciones no se exponen. La lista de participantes
continua reservada al responsable.

La proyeccion `team` se obtiene en la misma consulta privada de detalle, sin
sondeo adicional ni copiarla al estado personal sincronizado. El archivo
`supabase/classroom-team.sql` actualiza solo esa funcion, conserva sus ACL y no
asigna rangos, elimina datos ni abre tablas. Aplicar antes de publicar la UI.

La configuracion se divide en General, Participantes y Gestion. Cambiar de pestana
conserva el borrador de los datos generales, sin guardarlo ni cambiar permisos.
Gestion agrupa archivo, cambio de codigo y eliminacion con sus confirmaciones.
Al anadir un archivo se puede pegar un enlace o desplegar **Subir un PDF**.

- Catedra docente: el **Profesor** es el unico editor. Los alumnos son lectores.
- Catedra colaborativa: el **Colaborador** es el responsable y unico administrador
  de rangos, inscripciones, configuracion, archivo y eliminacion de la catedra.
- **Moderador**: tiene seis permisos independientes: agregar, editar y quitar
  fechas; agregar, editar y quitar archivos. Activarlo no concede permisos por
  defecto. Elegir los permisos y pulsar **Guardar permisos** aplica el cambio.
- **Alumno**: puede consultar fechas y archivos y salir de la materia. No edita
  contenido compartido ni ve la lista de participantes o sus datos personales.
- Desactivar Moderador elimina sus permisos. Volver a activarlo empieza sin
  permisos. Salir o ser quitado de la catedra tampoco conserva privilegios.
- El servidor verifica cada escritura bajo bloqueo de la catedra: no basta con
  modificar los botones, reenviar una solicitud o tener abierto un editor viejo.
  El permiso de agregar no permite sobrescribir un elemento existente.
- Los moderadores suben PDFs a su propio Drive; no reciben acceso a la conexion
  Google del profesor o colaborador. Editar un archivo en Estudiemos significa
  cambiar su titulo o enlace; editar el PDF original depende de Google Drive.
- Las catedras anteriores conservan el modo docente para no ampliar permisos
  implicitamente. Su responsable puede elegir **Organizacion > Colaborador**
  en la configuracion desde la app de alumno. Pasar de colaborativa a docente
  exige confirmacion y revoca todos los moderadores, sin borrar contenido.
- La actualizacion de `supabase/classrooms.sql` es aditiva e idempotente. Ejecutar
  ese archivo antes de desplegar la API y la interfaz nuevas. No asigna moderadores
  ni elimina materias existentes; las tablas siguen cerradas al acceso directo.

## Drive y Privacidad

Al desplegar **Subir un PDF**, el responsable ve la cuenta conectada y puede
elegir una carpeta autorizada de Estudiemos en su propio Drive. Por defecto se
usa `Estudiemos / nombre de la catedra`. No se solicita acceso de escritura a
todo Mi unidad: las carpetas previas visibles solo con metadatos siguen siendo
de solo lectura. Un delegado con permiso de agregar archivos usa su propio Drive,
nunca las credenciales del profesor/colaborador.

Los alumnos pueden elegir **Guardar en mi Drive**, con una **Copia independiente**
o un **Acceso directo**. La copia ocupa cuota propia y no sincroniza cambios del
original. El acceso directo abre el original actualizado y deja de funcionar
si el alumno pierde acceso a este. Las carpetas solo admiten acceso directo,
no copia recursiva. Cada alumno elige una carpeta autorizada de su propio Drive
(o la carpeta de la catedra por defecto); nadie usa el token del responsable.
La API oficial de Google hace la copia dentro de Drive: los bytes no pasan
por la API de Estudiemos, Supabase ni Vercel. Solo se consultan metadatos.

Se mantienen los permisos OAuth existentes, sin agregar acceso total a Drive.
Con `drive.file`, Google puede exigir que un archivo compartido desde otra
cuenta se autorice por separado. Si no esta autorizado, se bloquea la copia
y se ofrece **Hacerlo desde Google Drive**, donde el usuario usa el menu de
Google para copiar o agregar el acceso directo. No se anuncia un guardado
exitoso si Google no lo confirma. No se evitan las restricciones de descarga/copia
ni se amplian permisos de archivos originales. Las creaciones no reintentan
automaticamente un 5xx, para no duplicar archivos ante una respuesta perdida.
Un timeout requiere revisar el Drive antes de repetir.

Referencias oficiales: [files.copy](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy),
[accesos directos](https://developers.google.com/workspace/drive/api/guides/shortcuts)
y [claves de recursos compartidos](https://developers.google.com/workspace/drive/api/guides/resource-keys).

La conexion directa sigue sujeta a la configuracion/piloto del servidor.
Una cuenta no habilitada puede abrir el original en Google y usar sus opciones
nativas; esta mejora no levanta por si sola el piloto de Google ni su revision.
Al volver de OAuth en el mismo navegador se restaura el panel de guardado,
sin ejecutar una copia sin un nuevo toque en Guardar.

Los alumnos tambien pueden abrir los materiales en Google Drive y usar su descarga normal.
Se respetan las restricciones de lectura y descarga de Google; Estudiemos no
descarga usando la cuenta del responsable ni evita las restricciones del archivo.

- Solo se publica el titulo y enlace elegidos; nunca tokens ni el resto del Drive.
- Se puede subir un PDF valido de hasta 50 MB directamente a una carpeta propia
  de la materia dentro de Estudiemos en el Drive del responsable. No se suben
  archivos a Supabase ni a Vercel; alli solo quedan titulo y enlace.
- La opcion **Permitir leer este PDF a cualquiera con su enlace** esta desmarcada.
  Marcarla exige una segunda confirmacion para ese PDF, advirtiendo que se puede
  reenviar fuera de la comision. Solo entonces se crea permiso `anyone/reader`,
  sin indexacion. No se hacen publicas carpetas ni otros archivos existentes.
- Sin esa autorizacion, se conservan los permisos existentes de Google Drive.
  El responsable debe habilitar la lectura para sus alumnos desde Google.
- Tambien se pueden pegar enlaces existentes o elegirlos desde Mi espacio cuando
  esta disponible. Estudiemos no cambia los permisos de esos archivos.
- Cancelar una publicacion despues de subir el PDF puede dejar el borrador en
  Drive. Un fallo al guardar el enlace no elimina el archivo ni revoca permisos
  ya confirmados. Quitar un material de la app tampoco modifica permisos de Google.
- Salir de una clase NO revoca permisos que alguien ya tenga en Google Drive.
- Las escuelas pueden restringir enlaces externos o comparticion desde Workspace;
  Clases no evita esas restricciones.
- Los miembros ven el correo de Estudiemos del profesor/colaborador y de los
  delegados mientras tengan ese rol. No reciben el correo del resto de alumnos
  ni una lista de sus companeros. El responsable ve alias e identificadores de
  sus participantes, no una lista general de correos. Los correos del equipo
  no se guardan en el estado sincronizado ni se incluyen en la invitacion publica.
- No se verifican titulos docentes ni pertenencia institucional: profesor significa
  creador/administrador de esa clase. El codigo debe distribuirse a su grupo real.
- El horario de cada actividad se conserva en la zona horaria de la clase, indicada
  en su agenda y detalle del calendario; no se crean alarmas por defecto.

## Invitacion y Presentacion

Las invitaciones nuevas usan `/materia/CODIGO`. Reutilizan la funcion existente
`api/account-config`, sin sumar una Function de Vercel. La pagina muestra el
nombre real de la catedra, responsable, institucion y hasta tres fechas con sus
horarios. Los metadatos Open Graph incluyen titulo, descripcion e imagen para
WhatsApp y otras redes. La imagen generica pesa unos 30 KB; no contiene datos
personales. Los metadatos nunca incluyen archivos ni participantes.

La vista de fechas ya se generaba con el codigo anterior. Ahora el servidor la
incluye una sola vez en el HTML y el cliente la reutiliza, evitando otra lectura
de esa misma invitacion. No se envian las demos ni medios promocionales ocultos
de la pagina general. Se conserva `no-store` y `noindex`, sin cache que pueda
mantener vigente un codigo rotado. La CSP es la misma que la pagina de instalacion.

Los enlaces anteriores `instalar.html#materia=...` y los codigos pegados siguen
funcionando. Con sesion activa se continua automaticamente a la catedra. Sin
sesion se conserva la invitacion para registrarse o instalar. No se instala
software automaticamente. En Android se conserva **Abrir app instalada**; no
se presume detectar desde el navegador cualquier PWA o instalacion existente.

El panel **Compartir link** ofrece la invitacion lista para copiar y el menu
nativo Compartir cuando el navegador lo permite. Abrirlo no manda mensajes por
si solo ni cambia los permisos de los PDFs.

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
- `scripts/course-role.js`: preferencia local por cuenta, sin conceder permisos.
- `materias.html` y `scripts/teacher-workspace.js`: entorno exclusivo docente.
  `account.js` autentica, pero no descarga `user_states` ni se suscribe al estudio
  personal en esta pagina. Al volver a Alumno se restaura la sincronizacion normal.
- `scripts/course-drive.js`: subida directa, validacion PDF y tokens en memoria,
  invalidacion al cambiar de cuenta, consentimiento explicito por PDF.
- `api/_lib/google-drive.js`: retorno OAuth solo a rutas permitidas del mismo
  dominio; mantiene PKCE, credenciales cifradas y el permiso limitado `drive.file`.
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

- `node --test tests/classrooms.test.js tests/classroom-sync.test.js tests/course-role.test.js tests/drive-files.test.js tests/google-drive.test.js`
- `node tests/classrooms.smoke.cjs` usa Chrome, HTTP real y PGlite temporal.
- PowerShell: `$env:TEST_WEBKIT='1'; node tests/classrooms.smoke.cjs`
- La prueba de navegador usa `tmp/ui-check/node_modules/playwright`, igual que
  otros smoke tests del repositorio; no utiliza cuentas ni credenciales reales.

Los iconos son de Lucide, con licencia en `assets/icons/LUCIDE-LICENSE`.
La prueba de PDFs usa Google simulado; no publica archivos ni modifica permisos
reales. La prueba HTTP y SQL usa usuarios y una base PGlite temporales.
