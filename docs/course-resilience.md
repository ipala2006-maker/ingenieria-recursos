# Catedras: continuidad, conflictos y consumo

Fecha: 26 de octubre de 2026. Migracion: `supabase/classroom-resilience.sql`.
El archivo es transaccional e idempotente. Probarlo en una base temporal y
exportar una copia recuperable de produccion antes de aplicarlo. No hay que
volver a ejecutar migraciones antiguas sobre esta version.

## Continuidad

Eliminar una cuenta Auth, incluso con eliminacion logica, transfiere sus catedras
al primer moderador por antiguedad de ingreso, luego al primer alumno activo.
Se excluyen cuentas eliminadas, sin correo confirmado y participantes bloqueados.
El sucesor queda como colaborador con control completo; sus permisos anteriores
no limitan esa responsabilidad. Los demas delegados mantienen sus permisos.
Si no existe sucesor, se conserva todo archivado sin responsable. No se elige
al azar. La operacion ocurre en la misma transaccion de la eliminacion.

El FK de titularidad usa SET NULL, no CASCADE. El CASCADE de contenido al eliminar
**explicitamente la catedra** sigue siendo intencional, con confirmacion del
responsable. Ninguna de estas operaciones borra documentos de Google Drive.
La sucesion no puede transferir la propiedad ni los permisos del Drive de otro
usuario: conviene tener copias institucionales de material importante.

## Ediciones y moderacion

Fechas y materiales usan versiones crecientes. Guardar o eliminar exige la
version leida. Un conflicto devuelve 409, no sobrescribe ni resucita elementos
eliminados y conserva el borrador visible para que el usuario revise la version
actual. Actualizar los clientes antiguos: sus ediciones sin version se rechazan
de forma segura, no se aceptan silenciosamente.

Actividad muestra hasta 30 cambios, solo al abrirla. Guarda alias, rol, accion,
titulo compartido y hora; no almacena PDFs, correos ni una copia anterior completa.
No es un historial ilimitado ni un mecanismo de deshacer. Los miembros pueden
consultarlo, pero no editarlo. Expulsar guarda un bloqueo por cuenta/catedra;
el mismo enlace no permite volver. Permitir ingreso elimina el bloqueo, sin
inscribirlo ni devolverle permisos de delegado. Una nueva cuenta es una identidad
distinta: esto no pretende impedir toda evasion de identidad.

## Sincronizacion

El estado personal sigue usando su protocolo de cambios. Las fechas compartidas
no se copian a las notas privadas de cada alumno. El protocolo 2 de catedras
mantiene revisiones por materia: participantes/materiales/permisos no reenvian
fechas. Una fecha modificada reenvia solo el calendario de **esa catedra**, no
el calendario global. Es un delta por catedra, no por fila. Salir, archivar,
eliminar o perder acceso retira inmediatamente su proyeccion del nuevo estado.
Una base local incompleta recupera una lectura completa, sin repetir escrituras.

Las lecturas usan `classroom_read`, ejecutable solo por authenticated. El servidor
obtiene la identidad de `auth.uid()`, no de un parametro. Solo admite estado,
detalle e historial; aplica la misma pertenencia privada y no abre tablas ni
funciones internas. Las escrituras e invitaciones publicas conservan el API
validado de Vercel. No hay anonimos, credenciales service_role en cliente ni
intermediario Vercel para cada chequeo de un usuario conectado.

Los intervalos no cambian: 5 minutos visible, 1 minuto dentro de catedras, oculto
sin sondeo. Si durante el despliegue falta la funcion RPC, ese cliente usa el
API anterior; otros errores no buscan una ruta con mas permisos. Los clientes
viejos tambien funcionan para lectura, pero sin el ahorro nuevo.

## Despliegue y comprobacion

1. Backup de datos y guardar definiciones previas de funciones/FK para recuperacion.
2. Aplicar la migracion y verificar SET NULL, trigger Auth, RLS y grant solo al
   lector autenticado. Nadie salvo el servidor ejecuta mutaciones.
3. Publicar los recursos con versiones nuevas y Windows 2.0. Probar con dos
   cuentas ficticias: union, edicion concurrente, bloqueo, desbloqueo e historial.
4. Sucesion y borrado se prueban solo con cuentas de prueba, nunca con una cuenta
   real de Ian o de sus alumnos. Conservar el contenido si una prueba falla.
5. Confirmar Usage de Vercel/Supabase 3-7 dias. No confundir MAU con concurrencia.

No activar facturacion ni pruebas de pago. Si hay que revertir, mantener SET NULL
y el contenido preservado; no restablecer un CASCADE destructivo como atajo.
