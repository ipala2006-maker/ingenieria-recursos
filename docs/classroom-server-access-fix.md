# Reparacion de acceso del servidor a Materias

## Causa

Las tablas de materias no admiten lectura ni borrado directo para service_role.
El servidor ya usaba classroom_action para las operaciones principales, pero
vista previa y eliminacion intentaban usar REST sobre las tablas. Eso devolvia
503 incluso con la materia y el codigo correctos. No era necesario reinstalar
la app ni cambiar el enlace para resolver esa causa.

## Reparacion

Aplicar `supabase/classroom-invitations.sql` y publicar `api/_lib/classrooms.js`.
La migracion solo define dos funciones y sus permisos; no invoca la eliminacion
ni modifica registros existentes. Es aditiva e idempotente.

- classroom_invitation: consulta limitada por codigo, solo fechas y datos de
  presentacion; excluye notas detalladas, archivos, miembros y correos.
- classroom_delete: comprueba el responsable y bloquea la fila antes de eliminar.
  Solo se llama tras la confirmacion del responsable en la interfaz existente.

Ambas funciones son privadas del servidor, con search_path fijo. No se concede
acceso directo a las tablas ni ejecucion a anon/authenticated. El servidor deriva
el usuario del token, no del cuerpo de la solicitud. Los PDFs de Drive y las
anotaciones personales no forman parte de la eliminacion de una materia.

## Pruebas

PGlite y navegador usan el rol service_role real, sin privilegios de lectura de
tablas. Cubren borrado del responsable, rechazo a alumnos/terceros, cascada de
fechas y enlaces, vista previa sin datos privados y migracion repetida sin perdida.
Los borrados de prueba se realizan solo en una base local temporal. No se elimina
ninguna materia real para verificar la reparacion.
