# Viabilidad oficial y decisiones

Revisado el 11 de septiembre de 2026, antes de implementar los conectores.
Revalidar los requisitos al conectar una cuenta, porque pueden cambiar.

| Red | Publicacion oficial | Implementacion elegida |
| --- | --- | --- |
| Instagram Reels | Si, para cuentas profesionales con permisos de Meta. | Conector opcional de carga local reanudable mediante Facebook Login for Business. Manual por defecto. |
| TikTok | Direct Post existe, pero sus guias excluyen herramientas internas para cuentas del equipo. | Paquete y carga manual en TikTok Studio. No se evade la auditoria. |
| YouTube Shorts | `videos.insert` permite cargar videos con OAuth; los proyectos no auditados tienen restricciones de privacidad. | Conector opcional y comprobacion de canal. Manual hasta contar con proyecto aprobado. |

## Instagram

La documentacion oficial de Meta contempla cuentas Business y Creator y un
flujo de contenedor, procesamiento y publicacion. Su ejemplo oficial incluye
carga de un archivo local a `rupload.facebook.com`, sin alojamiento externo.
El conector usa esa modalidad, comprueba la cuota y compara el usuario con la
cuenta de marca registrada. No mezcla Instagram Login con Facebook Login.

Fuentes primarias: [coleccion oficial de Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672),
[ejemplo oficial de Reels](https://github.com/fbsamples/reels_publishing_apis/blob/main/insta_reels_publishing_api_sample/README.md).

## TikTok

Las guias Direct Post indican que el cliente debe servir a una audiencia amplia
y consideran no aceptable una utilidad para subir a las cuentas propias del
equipo. Tambien exigen una auditoria para levantar restricciones de visibilidad.
Por eso esta herramienta privada no incluye un adaptador de publicacion TikTok.
Subir desde su editor oficial evita depender de una integracion incompatible
con ese uso. Se documenta la divulgacion de marca propia, sin activar publicidad.

Fuentes primarias: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines),
[Direct Post: requisitos](https://developers.tiktok.com/docs/en/content-posting-api-get-started).

## YouTube

La Data API permite cargar videos y metadatos por OAuth. Google documenta que
los proyectos no verificados creados despues del 28/07/2020 quedan limitados a
visibilidad privada hasta superar la auditoria. Se prepara el mismo clip vertical
como Short; no existe un endpoint separado de Shorts que evite esos requisitos.
Las cuotas de la API no son una autorizacion para contratar servicios. El estudio
no activa billing ni amplia cuotas comprando creditos.

Fuentes primarias: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert),
[protocolo reanudable](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol),
[consulta del canal](https://developers.google.com/youtube/v3/docs/channels/list),
[Shorts verticales](https://support.google.com/youtube/answer/15424877),
[portadas](https://support.google.com/youtube/answer/72431).

## Criterio editorial

La hipotesis inicial es una demostracion corta de un problema concreto de
ingenieria: guias dispersas, fechas de parciales o dificultad para arrancar.
Gancho en los primeros segundos, una accion visible y un cierre para guardar
o compartir. Evitamos introducciones largas de logo, testimonios ficticios y
promesas de notas. Usamos una misma idea y recorte con copies y cierres distintos.

La guia creativa de TikTok recomienda video vertical, contexto nativo y ganchos
tempranos. Es una referencia publicitaria, no evidencia de que nuestro contenido
organico vaya a hacerse viral. Las decisiones deben ajustarse con resultados
propios, sin comprar trafico.

Fuente primaria: [guia creativa de TikTok](https://ads.tiktok.com/business/en/guides/what-is-ad-creative-guide).
La voz y los ejemplos se apoyan tambien en `marketing/strategy/brand-playbook.md`
y `marketing/strategy/market-intelligence-2026-09.md` existentes en el proyecto.

## Medicion sin gasto

Despues de publicar, anota en el seguimiento editorial existente las vistas,
retencion disponible, guardados, compartidos y visitas al enlace a las 24/72 h.
Compara tasas (compartidos/vistas), no solo volumen. Repite el concepto que
genere interes e instalaciones y cambia una sola variable al probar otro gancho.
No se recolectan datos personales ni se ejecutan consultas recurrentes nuevas.
