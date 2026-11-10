# Auditoria de enlaces y acceso

El origen publico para compartir, instalar y regresar del correo de Auth es
`https://estudiemos.ar`. Las catedras se comparten como `/materia/CODIGO` y
las invitaciones de amistad como `/amistad/TOKEN`. La configuracion de
Supabase en produccion ya tiene este Site URL, permite sus retornos y conserva
`{{ .ConfirmationURL }}` en el alta para no perder el codigo de catedra.

## Inventario

| Superficie | Destino o tratamiento |
| --- | --- |
| Catedras, amistad, instalacion, metadatos y material de difusion en el repo | Dominio oficial. |
| Registro, confirmacion y retorno de recuperacion | Dominio oficial; el alta conserva el codigo de la catedra en la query. |
| Worker anterior y candidato | Redireccion de las paginas publicas de materia, amistad e instalacion. Inicio, sesiones, callbacks y API conservan su origen. |
| Vercel pausado | Devuelve HTTP 503 antes de evaluar redirecciones. Pegar el enlace antiguo o su codigo en Materias > Unirme sigue funcionando. No se reactiva el servicio. |
| Android | El APK 1.7.1 apunta al dominio oficial y declara App Links para ese host. Los enlaces anteriores siguen admitidos como entrada. Confirmar en un telefono la apertura y la recuperacion de sesion al actualizar. |
| Windows | Codigo fuente de accesos, alarmas y skins actualizado. Cambiar el codigo no altera los EXE/RMSKIN ya publicados ni las instalaciones existentes. El traspaso nuevo de widgets desde el sitio oficial vuelve al widget oficial. |
| Referencias internas antiguas | Se conservan donde fijan el destinatario de alarmas, push, OAuth, exportacion privada o compatibilidad. No se deben reemplazar en bloque. |

`www.estudiemos.ar` no resuelve en la comprobacion inicial. No se genera como
enlace publico. Los enlaces enviados por terceros, mensajes antiguos y enlaces
pegados en perfiles externos no se pueden enumerar desde este repositorio.

## Pruebas

Probar la entrada con sesion existente y sin sesion, contrasena incorrecta y
reintento, registro con retorno a la materia, caducidad, bloqueo y uniones
repetidas. La prueba de navegador usa cuentas ficticias y SQL real en PGlite;
no crea usuarios, no manda correos ni modifica catedras de produccion.

```powershell
npm run cloudflare:check
node tests/classrooms.smoke.cjs --built
$env:TEST_WEBKIT='1'
node tests/classrooms.smoke.cjs --built
node tests/account-recovery.smoke.cjs
Remove-Item Env:TEST_WEBKIT
```
