# Estudiemos Studio

Un estudio local para preparar la misma idea para Reels, TikTok y Shorts.
Funciona con archivos de tu PC. No llama servicios pagos de IA, no crea anuncios
y no necesita tarjetas. La app publica de Estudiemos sigue independiente.

## Para Ian

1. Abri `Iniciar-estudio.cmd` en esta carpeta. El navegador abre el estudio.
2. En **Cuentas oficiales**, guarda los enlaces reales de Estudiemos. No uses
   perfiles personales. Podes empezar solo con YouTube.
3. Carga un MP4 o MOV, elegi la herramienta protagonista y revisa el gancho.
   Usa un video con datos piloto. Si ya tiene textos, desmarca agregar gancho.
4. Elegi un recorte de 3 a 60 segundos. Si dejas el final vacio, se conserva el
   video completo siempre que no supere 60 segundos. La portada se mide desde
   el inicio del recorte. **Conservar toda la imagen** evita cortar la app.
5. Presiona **Preparar las tres versiones**. Mira los tres videos completos,
   edita los textos y guarda. Confirma la revision y los derechos del material.
6. **Aprobar esta version** habilita **Descargar todo (.zip)**. Adentro hay una
   carpeta por red, cada una con video, portada, texto, subtitulos, guion y pasos.
7. **Preparar paquetes para publicar** deja cada red en carga manual mientras
   sus APIs no esten habilitadas. Abri la plataforma, verifica el perfil oficial,
   subi el video y pega el texto. El archivo `publicar.txt` tiene el paso a paso.
8. Volve y registra el enlace del video publicado. Queda indicado que lo
   comprobaste vos; el sistema no lo presenta como una verificacion de la API.

YouTube identificado en esta sesion: `https://www.youtube.com/@EstudiemosApp/`.
Instagram verificado en esta sesion: `https://www.instagram.com/estudiemosapp/`.
TikTok requiere completar su registro con el correo de la marca. No se
preconfiguran perfiles supuestos ni se reutilizan sesiones personales.

No es necesario configurar las APIs para usar los paquetes. Cuando se habilita
una API, el boton lo indica expresamente; ese boton envia contenido real.
La aprobacion sola nunca publica. No se publico ningun video como parte de la
instalacion o las pruebas de este sistema.

### Requisitos gratuitos

- Node.js 22 o superior, desde https://nodejs.org/ (LTS).
- FFmpeg y FFprobe con libass, desde https://ffmpeg.org/download.html.
- Windows 10/11 incluye `tar`, que crea el ZIP. Si no esta disponible, descarga
  los archivos individuales. No se instala software automaticamente.

En esta PC ya estan disponibles. Para arrancar desde terminal:

```powershell
cd marketing/social-studio
npm start
```

El panel se abre en `http://127.0.0.1:8147/`. Solo escucha en esta computadora.
Si el puerto esta ocupado, define `SOCIAL_PORT` con otro puerto libre y volve a
iniciar. Para detenerlo, cierra la ventana de inicio o presiona Ctrl+C.

### Que hace la preparacion

- Produce tres archivos 1080 x 1920, 30 FPS, MP4 H.264 y audio AAC cuando existe.
- Conserva el mismo recorte y la idea central. Adapta el cierre y los textos.
- Usa cortes elegidos por vos, encuadre seguro y textos breves. No reemplaza la
  interfaz por una interfaz inventada ni supone que un video muestra otra funcion.
- Genera copies por reglas editoriales locales, no por una API de IA. Son
  propuestas editables. No inventa testimonios, resultados ni estadisticas.
- Acepta subtitulos SRT exactos relativos al recorte y los incorpora al video.
  No transcribe automaticamente la voz. Un SRT vacio significa sin subtitulos,
  no una transcripcion realizada.
- Extrae una portada del video. En Shorts, la posibilidad de cargar una imagen
  depende de la cuenta y del editor; si no aparece, elegi un fotograma en la app.
- Agrega enlaces UTM diferentes para medir visitas desde cada plataforma. En
  Instagram/TikTok, actualiza el enlace del perfil; no se asume que los enlaces
  de las descripciones sean clicables.

Para recibir videos generados por otras herramientas gratuitas, exportalos a
MP4 y cargalos aqui. Los archivos de `marketing/output/` y los generadores ya
existentes siguen disponibles. El estudio no ejecuta generadores externos,
descarga tendencias ni usa creditos de Gemini/CapCut por su cuenta.

### Si algo falla

- **Preparacion interrumpida**: reintenta. Conserva las versiones ya listas.
- **Falta una cuenta**: registra su enlace oficial. Si cambias un destino,
  revisa y aprueba la pieza de nuevo antes de enviarla.
- **Permisos vencidos**: reconecta la API o utiliza los archivos manuales.
- **Procesando en la plataforma**: presiona **Comprobar publicacion** mas tarde.
  En Instagram, cuando termina el procesamiento se completa la publicacion
  previamente autorizada. No hace falta volver a cargar el archivo.
- **Resultado por comprobar**: revisa el perfil oficial. No hay reenvio automatico
  porque la plataforma podria haber recibido el video. Si aparece, registra su
  enlace. Si no aparece, completa la carga manual despues de comprobarlo.
- Una red fallida no revierte ni vuelve a publicar las otras.
- Para cambiar el video, el recorte o una pieza ya enviada, crea otra pieza.

El historial se conserva en `.social-studio/events.jsonl` y tambien se ve en
Actividad reciente. Cada pieza tiene su propio estado en `.social-studio/jobs/`.
No borres esa carpeta para reintentar: contiene las aprobaciones y los registros
que evitan repetir envios. Para mover el estudio a otra PC, copia esa carpeta
por un medio privado y conserva las credenciales por separado.

## Conexion opcional a APIs oficiales

Ver [API-REVIEW.md](API-REVIEW.md) para las fuentes y restricciones verificadas.
El valor por defecto de todos los conectores es desactivado. Nunca actives
facturacion para resolver una restriccion o una cuota.

### Credenciales

Guarda las variables en el entorno del proceso o en
`marketing/social-studio/.env`, tomando `.env.example` como referencia.
El archivo esta excluido de Git y de Vercel; tambien se excluye toda la carpeta
de datos local. No se leen las credenciales de produccion de Estudiemos.
No pegues tokens en el panel, un PR, un chat o una captura. Usa una cuenta del
sistema operativo protegida y cifrado de disco para proteger el archivo local.
El sistema no guarda contrasenas de redes, y nunca exporta tokens en paquetes.
El token del navegador es solamente una proteccion local contra formularios
externos; no es una credencial de Instagram o YouTube.

### Instagram

1. Completa el perfil profesional oficial y vincula una pagina de Facebook de
   Estudiemos. El conector implementado usa Facebook Login for Business y
   carga reanudable, para no necesitar un servidor publico de videos.
2. Configura una app en Meta for Developers para esa marca. Solicita solamente
   `instagram_basic`, `instagram_content_publish` y `pages_read_engagement`;
   `pages_show_list` puede ser necesario durante la seleccion de la pagina.
   No se solicitan `ads_management`, permisos de cobros ni publicidad.
3. Obtene el Page Access Token de la pagina oficial, el Instagram User ID y la
   version soportada de Graph API. Completa las variables `SOCIAL_INSTAGRAM_*`
   y `SOCIAL_META_API_VERSION` de `.env.example`. Nunca uses el ID del fundador.
4. Verifica los permisos y el acceso requerido para tu app con Meta. Solo
   entonces activa `SOCIAL_INSTAGRAM_ENABLED=true` y reinicia el estudio.
5. Antes de enviar cada video, el conector consulta el ID y el nombre de usuario
   oficial y los compara con el destino aprobado. Si no coinciden, bloquea.

La autorizacion de Meta puede requerir a una persona administradora real;
eso no autoriza publicar en su perfil personal. Si Meta exige permisos que
exceden este alcance, conserva el modo manual en vez de ampliarlos.

### YouTube

1. Usa un proyecto de Google Cloud de la marca, sin activar facturacion ni
   pruebas pagas. Habilita YouTube Data API v3.
2. Configura OAuth y autoriza solamente el canal de Estudiemos. Los permisos
   necesarios son `youtube.upload` y `youtube.readonly` para comprobar el canal
   y el procesamiento. No hace falta acceso al correo ni a Drive.
3. Obtene un refresh token mediante el flujo OAuth oficial. No uses una API key
   como reemplazo de OAuth y no copies cookies del navegador. Este estudio no
   implementa una pantalla OAuth propia: la autorizacion inicial es una tarea
   de configuracion, fuera del panel.
4. Guarda client ID, client secret, refresh token y channel ID en las variables
   `SOCIAL_YOUTUBE_*`. El canal verificado en esta sesion es
   `UC81zAxOnQGa8PCKfqDbZ9gQ`.
5. Los proyectos no auditados pueden quedar limitados a videos privados. Solicita
   la auditoria oficial; no marques `SOCIAL_YOUTUBE_AUDITED=true` hasta obtenerla.
6. Cuando este aprobado, activa ambos indicadores y reinicia. El conector
   verifica el ID y el handle del canal antes de cualquier carga de video.

### TikTok

Se prepara un paquete manual. No se solicitan contrasenas, cookies, permisos
Direct Post ni tokens de TikTok. En el editor oficial, identifica el contenido
como promocion de **tu marca** cuando corresponda: esa divulgacion no es una
campana paga. No actives Promote, Spark Ads ni un patrocinio inexistente.

## Estructura tecnica

```text
marketing/social-studio/
  server.mjs              Servidor local, carga y descargas protegidas
  lib/content.mjs         Brief, copies, perfiles y pasos por plataforma
  lib/media.mjs           Recorte, encuadre, textos, SRT y portadas con FFmpeg
  lib/studio.mjs          Flujo de preparacion, aprobacion y distribucion
  lib/store.mjs           Estados atomicos, hashes, locks e historial
  lib/network.mjs         Allowlist de red y errores sin secretos
  lib/publishers.mjs      Conectores oficiales Instagram/YouTube
  public/                 Panel local de carga y revision
  test/                   Pruebas de seguridad, flujo, APIs y video real
```

No hay dependencias npm de produccion, cron, colas pagas, despliegue publico ni
workers en Vercel. Node orquesta FFmpeg y el `tar` del sistema. Un lock evita
dos instancias contra los mismos datos; las escrituras usan reemplazo atomico.
El trabajo se guarda tras cada etapa. Reiniciar no reenvia automaticamente.

Los conectores aceptan solo endpoints oficiales especificos para cargas organicas,
comprobacion de identidad y renovacion OAuth. Los redirects no se siguen. No
hay rutas genericas de API, entradas de tarjeta, `boost` ni operaciones de Ads.
Esto controla lo que hace este sistema; no puede impedir que una persona pulse
Promocionar dentro de la web externa, ni verificar automaticamente el perfil
seleccionado en una carga manual.

## Verificacion

```powershell
node --test marketing/social-studio/test/*.test.mjs
$env:SOCIAL_MEDIA_TEST='1'
node --test marketing/social-studio/test/media.test.mjs
```

Las APIs se prueban con respuestas simuladas, sin publicar ni consumir cuotas.
La prueba opcional de medios convierte un video diagnostico real con FFmpeg.
La comprobacion en cuentas reales queda pendiente de permisos y auditorias.
Se prepararon tres variantes con el video piloto local de Estudiemos. La
revision visual final del panel sigue pendiente de permiso para reabrirlo;
no se presenta como una prueba de publicacion real.

Los cambios se presentan en un Pull Request; no se integran ni despliegan
automaticamente en la web publica.
