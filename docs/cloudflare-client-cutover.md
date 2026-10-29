# Clientes durante la mudanza a Cloudflare

Origen principal: https://estudiemos.estudiemos-services.workers.dev.
Supabase y la identidad de las cuentas no cambian. Vercel sigue como respaldo
y como transporte temporal de los avisos web suscritos en su origen anterior.
El Site URL de Supabase se cambio a este origen y se conservaron las dos URLs
de retorno autorizadas. No se rotaron claves de Auth ni se cerraron sesiones.

## Instaladores

- Windows 2.1: accesos, skins, avisos y descargas apuntan al origen principal.
  No se borran agendas locales, preferencias, widgets ni tareas programadas.
- El token de activacion de alarmas incluye el origen dentro de su firma.
  El cliente interpreta solo ese metadato, con parser JSON y dos destinatarios
  exactos permitidos. No confia en la firma para autenticar localmente: es el
  servidor destinatario quien valida firma, alcance, usuario y vencimiento.
  No sigue redirects. Los tokens anteriores sin metadato conservan Vercel.
- Los widgets indican `source=cloudflare` al complemento actualizado. El
  complemento solo selecciona entre ambos servidores conocidos; no acepta una
  URL arbitraria. Asi cada acceso breve se valida en el servidor que lo emitio.
- Android 1.7.0 conserva applicationId y firma, cambia el origen por defecto,
  acepta invitaciones viejas y nuevas, y conserva el puente de sesion nativo.
  La matriz de CI compila los tres origenes permitidos. La publicacion del APK
  firmado sigue usando los secretos de firma existentes de GitHub Actions.

## Limites de continuidad

Un PWA instalado tiene identidad, almacenamiento y permisos ligados al origen.
No es correcto copiar tokens con URLs o prometer una mudanza silenciosa. En
iPhone/iPad, el usuario debe agregar el sitio nuevo a Inicio y permitir avisos
alli; el icono viejo no se transforma en el nuevo. Las suscripciones anteriores
se conservan y usan su clave anterior hasta cerrar la coexistencia.

Los usuarios de Windows deben actualizar su complemento antes de volver a
conectar alarmas o agregar widgets desde el sitio nuevo. Las alarmas locales
ya programadas siguen ejecutandose sin esa reconexion y sin polling de red.

## Verificacion y vuelta atras

Los enlaces anteriores de catedra se aceptan en ambas direcciones. Se mantienen
los callbacks OAuth, redirects de Auth y hostname Turnstile de ambos entornos.
No se eliminan claves de Vercel. Para volver atras se conservan los artefactos
anteriores en Git y los despliegues verificados; no se reescriben datos de usuario.
La entrega real en un celular y el consumo de CPU con su proveedor deben
comprobarse aparte: una compilacion o una cola vacia no acreditan una entrega.
