import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { caption, instructions, TOPICS } from './content.mjs';
import { hashFile } from './store.mjs';

export function command(binary, args, { cwd, timeout = 600000, failure } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeout);
    child.stdout.on('data', data => { output = (output + data).slice(-200000); });
    child.stderr.on('data', data => { error = (error + data).slice(-20000); });
    child.on('error', () => { clearTimeout(timer); reject(new Error(failure || 'No se encuentra FFmpeg o FFprobe. Consulta la guia de inicio.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (expired) reject(new Error('La conversion tardo demasiado. Usa un video mas corto.'));
      else if (code !== 0) reject(new Error(failure || (/subtitles|libass/i.test(error) ? 'FFmpeg necesita el filtro subtitles (libass). Consulta la guia.' : 'No se pudo procesar este video. Revisa el archivo y el recorte.')));
      else resolve(output);
    });
  });
}

export async function probe(file, env = process.env) {
  const raw = await command(env.SOCIAL_FFPROBE || 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', file], { timeout: 15000 });
  const data = JSON.parse(raw), video = data.streams?.find(s => s.codec_type === 'video');
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration < 3 || duration > 600 || video.width > 7680 || video.height > 7680 || !/(mov|mp4)/.test(data.format?.format_name || '')) {
    throw new Error('Usa un video MP4 o MOV de 3 segundos a 10 minutos, hasta 8K.');
  }
  return { duration, width: video.width, height: video.height, codec: video.codec_name,
    audio: data.streams.some(s => s.codec_type === 'audio'), bytes: Number(data.format.size) };
}

function assTime(s) { const t = Math.round(s * 100); return `${Math.floor(t / 360000)}:${String(Math.floor(t / 6000) % 60).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`; }
function srtTime(s) { const t = Math.round(s * 1000); return `${String(Math.floor(t / 3600000)).padStart(2, '0')}:${String(Math.floor(t / 60000) % 60).padStart(2, '0')}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')},${String(t % 1000).padStart(3, '0')}`; }
function wrap(value) {
  const clean = value.replace(/[{}\\<>]/g, '').replace(/\s+/g, ' ').trim();
  const lines = [''];
  for (const word of clean.split(' ')) {
    if (word.length > 27) throw new Error('Hay una palabra demasiado larga en los textos del video.');
    if ((lines.at(-1) + ' ' + word).trim().length > 31) lines.push(word);
    else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
  }
  if (lines.length > 3) throw new Error('Acorta el texto en pantalla a tres lineas.');
  return lines.join('\\N');
}

export function parseSrt(value, duration) {
  if (!value.trim()) return [];
  const cues = [];
  let previousEnd = 0;
  for (const block of value.replace(/\r/g, '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0])) lines.shift();
    const m = /^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(lines.shift() || '');
    if (!m) throw new Error('Los subtitulos deben tener formato SRT: 00:00:01,000 --> 00:00:03,000.');
    const stamp = i => +m[i] * 3600 + +m[i + 1] * 60 + +m[i + 2] + +m[i + 3] / 1000;
    const start = stamp(1), end = stamp(5), text = lines.join(' ').replace(/<[^>]*>/g, '').trim();
    if (!text || text.length > 84 || end <= start || start < previousEnd || end > duration + 0.02 || [m[2], m[3], m[6], m[7]].some(x => +x > 59)) throw new Error('Revisa tiempos y longitud de subtitulos: sin superposiciones y dentro del recorte.');
    wrap(text);
    cues.push({ start, end, text }); previousEnd = end;
  }
  return cues;
}

export function renderPlan(b, source) {
  const end = b.end ?? source.duration;
  const duration = end - b.start;
  if (end > source.duration + 0.02 || duration < 3 || duration > 60) throw new Error('Selecciona un recorte de 3 a 60 segundos dentro del video.');
  return { duration, start: b.start, coverAt: Math.min(b.coverAt, duration - 0.1), subtitles: parseSrt(b.subtitles, duration) };
}

export async function renderVariant(dir, platform, b, source, copy, env = process.env) {
  const plan = renderPlan(b, source);
  const target = path.join(dir, platform);
  await fs.mkdir(target, { recursive: true });
  const cues = plan.subtitles.map(c => ({ ...c, style: 'Subtitle' }));
  if (b.overlay) {
    cues.push({ start: 0, end: Math.min(2.5, plan.duration / 2), text: b.hook, style: 'Hook' });
    cues.push({ start: Math.max(2.5, plan.duration - 2), end: plan.duration, text: platform === 'tiktok' ? 'Pasalo al grupo de cursada' : platform === 'instagram' ? 'Guardalo para los parciales' : 'Proba Estudiemos', style: 'Closing' });
  }
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Hook,Arial,58,&H00FFFFFF,&H00FFFFFF,&H00131A22,&H80131A22,-1,0,0,0,100,100,0,0,3,12,0,8,96,156,235,1\nStyle: Subtitle,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00131A22,&H80131A22,-1,0,0,0,100,100,0,0,3,8,0,2,96,156,390,1\nStyle: Closing,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00131A22,&H80131A22,-1,0,0,0,100,100,0,0,3,10,0,8,96,156,240,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` + cues.map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${c.style},,0,0,0,,${wrap(c.text)}`).join('\n');
  await fs.writeFile(path.join(target, 'overlay.ass'), ass, 'utf8');
  const scale = b.framing === 'crop'
    ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    : 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x141a24';
  const filter = `${scale},setsar=1,fps=30${cues.length ? ',subtitles=overlay.ass' : ''},format=yuv420p`;
  await command(env.SOCIAL_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-nostdin', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-ss', String(plan.start), '-i', path.join(dir, 'source.mp4'),
    '-t', String(plan.duration), '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
    '-vf', filter, '-filter_threads', '2', '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '20', '-maxrate', '12M', '-bufsize', '24M', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', 'video.mp4'], { cwd: target });
  const output = await probe(path.join(target, 'video.mp4'), env);
  if (output.width !== 1080 || output.height !== 1920 || Math.abs(output.duration - plan.duration) > 0.2) throw new Error('El video exportado no cumple el formato esperado.');
  await command(env.SOCIAL_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-nostdin', '-ss', String(plan.coverAt), '-i', 'video.mp4', '-frames:v', '1', '-q:v', '2', 'cover.jpg'], { cwd: target, timeout: 30000 });
  const srt = plan.subtitles.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}`).join('\n\n');
  await fs.writeFile(path.join(target, 'subtitles.srt'), srt, 'utf8');
  return { plan, output };
}

export async function writePackage(dir, platform, job, account) {
  const target = path.join(dir, platform), state = job.platforms[platform];
  await fs.writeFile(path.join(target, 'copy.txt'), `TITULO\n${state.copy.title}\n\nDESCRIPCION\n${caption(state.copy)}\n\nENLACE PARA EL PERFIL\n${state.copy.link}\n`, 'utf8');
  await fs.writeFile(path.join(target, 'publicar.txt'), instructions(platform, account).map((s, i) => `${i + 1}. ${s}`).join('\n\n'), 'utf8');
  const topic = TOPICS[job.brief.topic];
  await fs.writeFile(path.join(target, 'guion.txt'), `IDEA\n${job.brief.tip}\n\nGANCHO\n${job.brief.hook}\n\nPRUEBA VISUAL\n${topic.proof}\n\nRECORRIDO SUGERIDO\n${topic.beats.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nSolo datos piloto y recursos con derechos. No se garantizan notas ni viralidad.\n`, 'utf8');
  state.files = {};
  for (const file of ['video.mp4', 'cover.jpg', 'subtitles.srt', 'copy.txt', 'publicar.txt', 'guion.txt']) state.files[file] = await hashFile(path.join(target, file));
}
