const $ = s => document.querySelector(s);
const platforms = ['instagram', 'tiktok', 'youtube'];
const names = { instagram: 'Instagram Reels', tiktok: 'TikTok', youtube: 'YouTube Shorts' };
const uploadPages = { instagram: 'https://www.instagram.com/', tiktok: 'https://www.tiktok.com/tiktokstudio/upload', youtube: 'https://studio.youtube.com/' };
const labels = { draft: 'Video pendiente', rendering: 'Preparando video', render_failed: 'Preparacion interrumpida', ready: 'Lista para revisar', failed: 'Requiere atencion', manual_ready: 'Lista para carga manual', publishing: 'Enviando a la plataforma', processing: 'Procesando en la plataforma', uncertain: 'Resultado por comprobar', published: 'Publicada por API', uploaded: 'Cargada sin visibilidad publica', manual_reported: 'Publicacion registrada por Ian' };
let snapshot, selected = null, token = '', dirty = false, lastRendered = '', reporting = null, loading = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function notify(message, error = false) { const el = $('#notice'); el.textContent = message; el.className = error ? 'error' : ''; el.hidden = !message; }
async function api(route, input, method = 'POST') {
  const response = await fetch(route, { method, headers: { 'Content-Type': 'application/json', 'X-Studio-Token': token }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operacion.');
  return result;
}
function current() { return snapshot?.jobs.find(job => job.id === selected); }
function caption(c) { return c.description + '\n\n' + c.hashtags.map(tag => '#' + tag).join(' '); }
function controls() {
  const job = current(), ready = job && platforms.every(p => ['ready', 'failed', 'manual_ready'].includes(job.platforms[p].status));
  $('#approve').disabled = !ready || snapshot?.busy;
  $('#dispatch').disabled = !job?.approved || dirty || snapshot?.busy;
  $('#save-copy').disabled = !job || !dirty || snapshot?.busy;
  $('#prepare-new').disabled = loading || snapshot?.busy;
  const automatic = platforms.filter(p => snapshot?.capabilities[p].automatic);
  $('#dispatch').textContent = automatic.length ? `Publicar por API (${automatic.map(p => names[p]).join(', ')}) y preparar el resto` : 'Preparar paquetes para publicar';
}
async function refresh() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('No se pudo conectar al estudio.');
  snapshot = await res.json(); token = snapshot.token;
  if (!$('#topic').options.length) {
    for (const [id, topic] of Object.entries(snapshot.topics)) $('#topic').add(new Option(topic.name, id));
    chooseTopic();
  }
  $('#jobs').replaceChildren();
  if (!snapshot.jobs.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Todavia no hay piezas.'; $('#jobs').append(empty); }
  for (const job of snapshot.jobs) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'job-button' + (job.id === selected ? ' active' : '');
    const title = document.createElement('span'); title.textContent = job.brief.title;
    const detail = document.createElement('small'); detail.textContent = `${new Date(job.createdAt).toLocaleDateString('es-AR')} · ${job.approved ? 'Aprobada' : 'Borrador'}`;
    button.append(title, detail); button.addEventListener('click', () => { if (dirty) { notify('Guarda los textos antes de cambiar de pieza.', true); return; } selected = job.id; lastRendered = ''; renderReview(); });
    $('#jobs').append(button);
  }
  $('#logs').replaceChildren();
  for (const row of snapshot.logs.slice(-20).reverse()) {
    const li = document.createElement('li'); li.textContent = `${new Date(row.at).toLocaleString('es-AR')} · ${row.platform ? names[row.platform] + ': ' : ''}${labels[row.event] || ({ approved: 'Version aprobada', created: 'Pieza creada', prepared: 'Video preparado', official_accounts_updated: 'Cuentas actualizadas', copy_edited: 'Textos guardados', manual_package_ready: 'Paquete manual preparado' }[row.event] || row.event)}`; $('#logs').append(li);
  }
  if (selected && !dirty) renderReview(); controls();
}
function chooseTopic() { const t = snapshot.topics[$('#topic').value]; $('#hook').value = t.hook; $('#tip').value = t.tip; }
$('#topic').addEventListener('change', chooseTopic);
$('#alternate-hook').addEventListener('click', () => { const t = snapshot.topics[$('#topic').value]; $('#hook').value = $('#hook').value === t.hook ? t.alternative : t.hook; });
$('#new-piece').addEventListener('click', () => {
  if (dirty) { notify('Guarda los textos antes de crear otra pieza.', true); return; }
  selected = null; lastRendered = ''; $('#create-view').hidden = false; $('#review-view').hidden = true; notify('');
});

$('#create-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, file = $('#source').files[0];
  if (!file || file.size > 512 * 1024 * 1024) { notify('Selecciona un MP4 o MOV de hasta 512 MB.', true); return; }
  loading = true; controls(); notify('');
  try {
    const values = Object.fromEntries(new FormData(form)); delete values.source; values.overlay = form.elements.overlay.checked;
    const job = await api('/api/jobs', values); selected = job.id;
    await new Promise((resolve, reject) => {
      const upload = new XMLHttpRequest(); upload.open('PUT', `/api/jobs/${job.id}/source`); upload.setRequestHeader('X-Studio-Token', token); upload.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      upload.upload.onprogress = e => { if (e.lengthComputable) $('#upload-progress').textContent = `Cargando video: ${Math.round(e.loaded / e.total * 100)}%`; };
      upload.onload = () => { if (upload.status === 200) resolve(); else { try { reject(new Error(JSON.parse(upload.responseText).error)); } catch { reject(new Error('No se pudo cargar el video.')); } } };
      upload.onerror = () => reject(new Error('Se interrumpio la carga. Vuelve a seleccionar el archivo.')); upload.send(file);
    });
    await api(`/api/jobs/${job.id}/prepare`, {}); await refresh(); renderReview();
    notify('Preparando las tres versiones. Podes seguir el avance en cada red.');
  } catch (e) { notify(e.message, true); }
  finally { loading = false; $('#upload-progress').textContent = ''; controls(); }
});

function renderReview() {
  const job = current(); if (!job) return;
  $('#create-view').hidden = true; $('#review-view').hidden = false;
  const stamp = job.updatedAt + job.approved + JSON.stringify(snapshot.capabilities) + JSON.stringify(snapshot.accounts);
  if (lastRendered === stamp) { controls(); return; }
  lastRendered = stamp;
  $('#piece-title').textContent = job.brief.title;
  $('#piece-status').textContent = job.approved ? 'Version aprobada' : 'Pendiente de revision';
  $('#download-all').hidden = !job.approved; $('#download-all').href = `/download/${job.id}/paquete.zip`;
  $('#piece-error').textContent = job.error || ''; $('#piece-error').hidden = !job.error;
  $('#retry-prepare').hidden = !job.source || !platforms.some(p => ['draft', 'render_failed'].includes(job.platforms[p].status));
  const locked = platforms.some(p => ['publishing', 'processing', 'published', 'uploaded', 'manual_reported', 'uncertain'].includes(job.platforms[p].status));
  $('#platforms').innerHTML = platforms.map(p => {
    const state = job.platforms[p], account = snapshot.accounts[p], available = !!state.files['video.mp4'];
    const preview = `/preview/${job.id}/${p}`, download = `/download/${job.id}/${p}`;
    return `<article class="platform" data-platform="${p}">
      <div class="platform-heading"><h2>${names[p]}</h2><small>${account ? '@' + esc(account.handle) : 'Cuenta oficial pendiente'} · ${esc(labels[state.status])}</small></div>
      <div class="video-wrap">${available ? `<video src="${preview}/video.mp4" poster="${preview}/cover.jpg" controls playsinline preload="metadata" aria-label="Vista previa ${names[p]}"></video>` : `<div class="video-placeholder">${esc(labels[state.status])}</div>`}</div>
      <div class="field"><label for="${p}-title">Titulo</label><input id="${p}-title" data-copy="title" maxlength="100" value="${esc(state.copy.title)}" ${locked ? 'disabled' : ''}></div>
      <div class="field"><label for="${p}-description">Descripcion</label><textarea id="${p}-description" data-copy="description" rows="7" maxlength="${p === 'youtube' ? 4500 : 1900}" ${locked ? 'disabled' : ''}>${esc(state.copy.description)}</textarea></div>
      <div class="field"><label for="${p}-tags">Hashtags</label><input id="${p}-tags" data-copy="hashtags" value="${esc(state.copy.hashtags.join(' '))}" ${locked ? 'disabled' : ''}></div>
      ${available ? `<div class="cover-strip"><img src="${preview}/cover.jpg" alt="Portada ${names[p]}" width="40" height="64"><span>1080 × 1920 · ${Number(state.duration).toFixed(1)} s · H.264</span></div>` : ''}
      ${p === 'youtube' ? `<div class="field"><label for="yt-visibility">Visibilidad</label><select id="yt-visibility" ${locked ? 'disabled' : ''}>${[['public', 'Publico'], ['unlisted', 'No listado'], ['private', 'Privado']].map(([v, label]) => `<option value="${v}" ${state.options.visibility === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div><label class="check"><input id="yt-synthetic" type="checkbox" ${state.options.synthetic ? 'checked' : ''} ${locked ? 'disabled' : ''}> Contenido sintetico realista</label><label class="check"><input id="yt-kids" type="checkbox" ${state.options.madeForKids ? 'checked' : ''} ${locked ? 'disabled' : ''}> Creado especificamente para ninos</label>` : ''}
      <p class="delivery-note">${snapshot.capabilities[p].automatic ? 'API oficial habilitada. Se comprueba la cuenta antes de enviar.' : esc(snapshot.capabilities[p].reason)}</p>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
      ${job.approved ? `<nav class="downloads" aria-label="Archivos de ${names[p]}">${[['video.mp4', 'Video'], ['cover.jpg', 'Portada'], ['copy.txt', 'Texto'], ['subtitles.srt', 'Subtitulos'], ['publicar.txt', 'Pasos'], ['guion.txt', 'Guion']].map(([f, label]) => `<a href="${download}/${f}" download>${label}</a>`).join('')}</nav>` : ''}
      <div class="platform-actions">
        <button data-copy-button="${p}" type="button" ${!job.approved || dirty ? 'disabled' : ''}>Copiar descripcion</button>
        ${job.approved && account ? `<a href="${uploadPages[p]}" target="_blank" rel="noreferrer">Abrir ${names[p]}</a>` : ''}
        ${state.status === 'processing' ? `<button data-finish="${p}" type="button">Comprobar publicacion</button>` : ''}
        ${job.approved && account && ['ready', 'manual_ready', 'uncertain', 'failed'].includes(state.status) ? `<button data-report="${p}" type="button">Registrar enlace publicado</button>` : ''}
      </div>
      ${state.url ? `<a class="delivery-link" href="${esc(state.url)}" target="_blank" rel="noreferrer">Ver video · ${state.verification === 'official_api' ? 'confirmado por API' : state.verification === 'user_reported' ? 'confirmado por Ian' : 'en procesamiento'}</a>` : ''}
    </article>`;
  }).join('');
  $('#approval-form').reset(); controls();
}

$('#platforms').addEventListener('input', () => { dirty = true; controls(); });
$('#platforms').addEventListener('click', async event => {
  const copy = event.target.closest('[data-copy-button]'), finish = event.target.closest('[data-finish]'), report = event.target.closest('[data-report]');
  try {
    if (copy) { if (dirty) throw new Error('Guarda y aprueba los textos modificados antes de copiar.'); await navigator.clipboard.writeText(caption(current().platforms[copy.dataset.copyButton].copy)); notify('Descripcion copiada.'); }
    if (finish) { finish.disabled = true; await api(`/api/jobs/${selected}/finish`, { platform: finish.dataset.finish }); await refresh(); }
    if (report) {
      reporting = report.dataset.report; $('#report-form').reset(); $('#report-error').textContent = '';
      $('#report-account').textContent = `${names[reporting]} · @${snapshot.accounts[reporting].handle}`;
      $('#report-dialog').showModal();
    }
  } catch (e) { notify(e.message, true); if (finish) finish.disabled = false; }
});

async function saveCopy() {
  if (!dirty) return;
  const values = {};
  for (const p of platforms) {
    const el = $(`[data-platform="${p}"]`), copy = { ...current().platforms[p].copy };
    for (const input of el.querySelectorAll('[data-copy]')) copy[input.dataset.copy] = input.value;
    copy.hashtags = copy.hashtags.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^#/, ''));
    values[p] = { copy, options: p === 'youtube' ? { visibility: $('#yt-visibility').value, synthetic: $('#yt-synthetic').checked, madeForKids: $('#yt-kids').checked } : {} };
  }
  await api(`/api/jobs/${selected}/edit`, values); dirty = false; await refresh();
}
$('#save-copy').addEventListener('click', () => saveCopy().then(() => notify('Textos guardados. Revisa y aprueba la nueva version.')).catch(e => notify(e.message, true)));
$('#approval-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = Object.fromEntries(['reviewed', 'rights', 'pilot'].map(k => [k, event.currentTarget.elements[k].checked]));
  try { await saveCopy(); await api(`/api/jobs/${selected}/approve`, input); await refresh(); notify('Version aprobada. Los archivos estan listos para descargar.'); }
  catch (e) { notify(e.message, true); }
});
$('#dispatch').addEventListener('click', async () => {
  try { $('#dispatch').disabled = true; await api(`/api/jobs/${selected}/dispatch`, { platforms }); await refresh(); notify('Flujo iniciado. Revisa el estado de cada red; los paquetes manuales requieren completar la carga en la plataforma.'); }
  catch (e) { notify(e.message, true); controls(); }
});
$('#retry-prepare').addEventListener('click', async () => {
  try { await api(`/api/jobs/${selected}/prepare`, {}); await refresh(); } catch (e) { notify(e.message, true); }
});
$('#accounts-open').addEventListener('click', () => {
  for (const p of platforms) $(`#account-${p}`).value = snapshot?.accounts[p]?.url || '';
  $('#accounts-error').textContent = ''; $('#accounts-dialog').showModal();
});
$('#accounts-close').addEventListener('click', () => $('#accounts-dialog').close());
$('#report-close').addEventListener('click', () => $('#report-dialog').close());
$('#accounts-form').addEventListener('submit', async event => {
  event.preventDefault(); const input = Object.fromEntries(new FormData(event.currentTarget)); input.confirmedOfficial = event.currentTarget.elements.confirmedOfficial.checked;
  try { await api('/api/accounts', input); $('#accounts-dialog').close(); await refresh(); notify('Cuentas guardadas. Las aprobaciones previas deben renovarse si cambio el destino.'); }
  catch (e) { $('#accounts-error').textContent = e.message; }
});
$('#report-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api(`/api/jobs/${selected}/report`, { platform: reporting, url: $('#post-url').value, officialConfirmed: event.currentTarget.elements.officialConfirmed.checked });
    $('#report-dialog').close(); await refresh(); notify('Enlace registrado como comprobado por vos.');
  } catch (e) { $('#report-error').textContent = e.message; }
});
window.addEventListener('beforeunload', event => { if (dirty || loading) { event.preventDefault(); event.returnValue = ''; } });
async function poll() {
  try { await refresh(); } catch (e) { notify(e.message, true); }
  setTimeout(poll, snapshot?.busy ? 2000 : 7000);
}
poll();
