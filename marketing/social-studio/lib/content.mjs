export const PLATFORMS = ['instagram', 'tiktok', 'youtube'];
export const NAMES = { instagram: 'Instagram Reels', tiktok: 'TikTok', youtube: 'YouTube Shorts' };
export const TOPICS = {
  inbox: {
    name: 'Inbox y calendario',
    hook: 'Tres parciales. Un solo plan.',
    alternative: 'Que parcial preparas primero?',
    tip: 'Anota las fechas de los parciales y elegi una tarea concreta para hoy.',
    proof: 'Mostrar una tarea piloto en Inbox y su fecha en el calendario.',
    beats: ['Mostrar las tres fechas', 'Elegir una tarea para hoy', 'Guardar la tarea en Inbox', 'Ver el resultado en calendario'],
    tags: ['Ingenieria', 'Parciales', 'Organizacion']
  },
  pomodoro: {
    name: 'Pomodoro',
    hook: 'Una guia. Un bloque. Arranca.',
    alternative: 'No hace falta estudiar cuatro horas.',
    tip: 'Elegi un ejercicio, prepara un bloque de estudio y deja el resto para despues.',
    proof: 'Configurar e iniciar un bloque real de Pomodoro con una tarea piloto.',
    beats: ['Elegir un ejercicio de la guia', 'Ajustar el bloque de estudio', 'Empezar el temporizador', 'Mostrar el bloque en marcha'],
    tags: ['Ingenieria', 'Pomodoro', 'Estudiar']
  },
  widgets: {
    name: 'Widgets de escritorio',
    hook: 'El parcial, a la vista.',
    alternative: 'Tu proxima tarea, sin buscarla.',
    tip: 'Deja tu proxima tarea en un widget de escritorio para tenerla presente.',
    proof: 'Mostrar un widget real en PC o Android, con datos piloto; no prometer widgets nativos de iOS.',
    beats: ['Mostrar una tarea piloto', 'Agregar el widget en PC o Android', 'Volver al escritorio', 'Abrir la tarea desde el widget'],
    tags: ['Ingenieria', 'Widgets', 'Productividad']
  },
  espacio: {
    name: 'Mi espacio',
    hook: 'Donde quedo esa guia?',
    alternative: 'Apuntes por todos lados?',
    tip: 'Agrupa los apuntes por materia y deja la guia que estas usando a mano.',
    proof: 'Abrir una carpeta y un archivo piloto en Mi espacio.',
    beats: ['Mostrar apuntes piloto dispersos', 'Abrir Mi espacio', 'Entrar a la carpeta de una materia', 'Abrir la guia correcta'],
    tags: ['Ingenieria', 'Apuntes', 'Universidad']
  },
  organizador: {
    name: 'Organizador inteligente',
    hook: 'Decilo como te salga.',
    alternative: 'De una frase a una tarea.',
    tip: 'Escribi que necesitas organizar, revisa la propuesta y confirma los cambios.',
    proof: 'Grabar la propuesta y la confirmacion real del organizador dentro de Estudiemos; no mostrar un bot de WhatsApp.',
    beats: ['Escribir una indicacion piloto', 'Ver la propuesta', 'Revisar y confirmar', 'Mostrar la tarea resultante'],
    tags: ['Ingenieria', 'Organizacion', 'Estudiantes']
  }
};

export function text(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new Error(`${name}: revisa el texto (maximo ${max} caracteres).`);
  }
  return value.trim();
}

export function brief(input) {
  const topic = TOPICS[input.topic];
  if (!topic) throw new Error('Elegi una herramienta para este video.');
  const start = Number(input.start ?? 0), end = input.end === '' || input.end == null ? null : Number(input.end);
  if (!Number.isFinite(start) || start < 0 || (end !== null && (!Number.isFinite(end) || end <= start))) throw new Error('El recorte no es valido.');
  const framing = input.framing === 'crop' ? 'crop' : 'fit';
  const hook = text(input.hook || topic.hook, 'Gancho', 78);
  if (hook.split(/\s+/).length > 13) throw new Error('Acorta el gancho a 13 palabras o menos.');
  return {
    title: text(input.title || topic.name, 'Nombre', 90), topic: input.topic, hook,
    tip: text(input.tip || topic.tip, 'Idea central', 350),
    start, end, framing, overlay: input.overlay !== false,
    subtitles: text(input.subtitles || '', 'Subtitulos SRT', 20000, 0),
    coverAt: Number.isFinite(Number(input.coverAt)) ? Math.max(0, Number(input.coverAt)) : 1,
    pilot: input.pilot === true, rights: input.rights === true
  };
}

export function makeCopy(b, platform, id) {
  const topic = TOPICS[b.topic];
  const tags = ['Estudiemos', ...topic.tags];
  const cta = { instagram: 'Guardalo para tu proxima semana de parciales.', tiktok: 'Pasaselo a tu grupo de cursada.', youtube: 'Proba este paso en tu proxima sesion.' }[platform];
  const link = new URL('https://estudiemos-app.vercel.app/instalar.html');
  link.search = new URLSearchParams({ utm_source: platform, utm_medium: 'organic_social', utm_campaign: id }).toString();
  const destination = platform === 'youtube' ? `Estudiemos: ${link.href}` : 'Estudiemos. Enlace de instalacion en el perfil.';
  return { title: `${b.hook} | Estudiemos`.slice(0, 100), description: `${b.hook}\n\n${b.tip}\n\n${cta}\n${destination}`, hashtags: tags, cta, link: link.href };
}

export function validateCopy(c, platform) {
  const title = text(c.title, 'Titulo', 100);
  const description = text(c.description, 'Descripcion', platform === 'youtube' ? 4500 : 1900);
  if (!Array.isArray(c.hashtags) || c.hashtags.length > 5 || !c.hashtags.every(x => typeof x === 'string' && /^[\p{L}\p{N}_]{1,40}$/u.test(x))) throw new Error('Usa hasta 5 hashtags, sin espacios ni #.');
  return { title, description, hashtags: c.hashtags, cta: text(c.cta || '', 'Llamada a la accion', 150, 0) };
}

export function caption(c) { return `${c.description}\n\n${c.hashtags.map(t => '#' + t).join(' ')}`; }

export function profile(platform, raw) {
  const u = new URL(text(raw, 'Perfil oficial', 250));
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) throw new Error('Usa el enlace HTTPS publico del perfil, sin parametros.');
  const host = u.hostname.replace(/^www\./, '');
  const patterns = { instagram: ['instagram.com', /^\/([\w.]{1,30})\/?$/], tiktok: ['tiktok.com', /^\/@([\w.]{1,24})\/?$/], youtube: ['youtube.com', /^\/@([\w.-]{3,40})\/?$/] };
  const [expected, regex] = patterns[platform] || [];
  const match = regex?.exec(u.pathname);
  if (host !== expected || !match || !/estudiemos/i.test(match[1])) throw new Error('Solo se permiten perfiles de marca Estudiemos; no cuentas personales.');
  return { platform, handle: match[1], url: `https://www.${host}/${platform === 'instagram' ? '' : '@'}${match[1]}/`, confirmedOfficial: true };
}

export function publicationUrl(platform, raw, account) {
  const u = new URL(text(raw, 'Enlace publicado', 400));
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) throw new Error('Pega un enlace limpio, sin parametros.');
  const host = u.hostname.replace(/^www\./, '');
  const valid = platform === 'instagram' ? host === 'instagram.com' && /^\/(reel|p)\/[\w-]+\/?$/.test(u.pathname)
    : platform === 'tiktok' ? host === 'tiktok.com' && new RegExp(`^/@${account.handle.replace(/\./g, '\\.')}/video/[0-9]+/?$`, 'i').test(u.pathname)
      : host === 'youtube.com' && /^\/shorts\/[\w-]{11}\/?$/.test(u.pathname);
  if (!valid) throw new Error('El enlace no corresponde a una publicacion de esa plataforma.');
  return u.href;
}

export function instructions(platform, account) {
  const common = [
    `Confirma que el perfil activo es @${account?.handle || 'PENDIENTE: configurar cuenta oficial de Estudiemos'}. Si aparece otro, cambia a la cuenta de marca antes de subir.`,
    'Subi video.mp4 y pega el contenido de copy.txt. Revisa subtitulos y sonido.',
    'Usa cover.jpg cuando el editor lo permita; si solo ofrece elegir un fotograma, selecciona uno legible del propio video.'
  ];
  if (platform === 'instagram') return [...common, 'En Instagram: Crear > Publicacion > seleccionar video > Siguiente. Revisa el recorte 9:16 y la portada. Comparte como Reel.', 'No pulses Promocionar. Comprueba que el Reel aparece en el perfil oficial y registra su enlace en el estudio.'];
  if (platform === 'tiktok') return [...common, 'En TikTok Studio: Cargar > seleccionar video. Activa Divulgar contenido comercial > Tu marca (promocion de Estudiemos). Esa etiqueta es informativa y no activa anuncios pagos.', 'Elige audiencia y permisos de comentarios. Revisa la declaracion de musica y, si corresponde, la etiqueta de contenido generado con IA. Publica. No uses Promote ni autorices Spark Ads.', 'Comprueba el video en el perfil oficial y registra su enlace en el estudio.'];
  return [...common, 'En YouTube Studio: Crear > Subir videos. Usa el titulo y la descripcion de copy.txt. El formato vertical corto se clasifica como Short.', 'Indica correctamente audiencia infantil y contenido sintetico cuando corresponda. Elige visibilidad y publica. En portadas, la disponibilidad depende de la cuenta; podes elegir un fotograma desde la app de YouTube.', 'No actives Promociones. Comprueba el Short en el canal oficial y registra su enlace en el estudio.'];
}
