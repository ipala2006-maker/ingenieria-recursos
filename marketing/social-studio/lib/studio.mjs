import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PLATFORMS, brief, makeCopy, validateCopy, profile, publicationUrl } from './content.mjs';
import { Store, hashFile, approvalDigest, assertApproved } from './store.mjs';
import { renderPlan, renderVariant, writePackage } from './media.mjs';
import { capabilities, publishers } from './publishers.mjs';
import { API_MESSAGES } from './network.mjs';

const SENT = ['publishing', 'processing', 'published', 'uploaded', 'manual_reported', 'uncertain'];
export class Studio {
  constructor(root, { env = process.env, fetchImpl = fetch, render = renderVariant } = {}) {
    this.store = new Store(root); this.env = env; this.connectors = publishers(env, fetchImpl); this.render = render;
  }
  async init() { await this.store.init(); await this.store.recover(); }
  async create(input) {
    const b = brief(input), id = randomUUID();
    const job = { id, createdAt: new Date().toISOString(), brief: b, approval: null, source: null,
      platforms: Object.fromEntries(PLATFORMS.map(p => [p, { status: 'draft', copy: makeCopy(b, p, id), files: {}, options: p === 'youtube' ? { visibility: 'public', synthetic: false, madeForKids: false } : {} }])) };
    await this.store.save(job); await this.store.log(id, null, 'created'); return job;
  }
  async accounts(input) {
    if (input.confirmedOfficial !== true) throw new Error('Confirma que son cuentas oficiales de Estudiemos.');
    const accounts = {};
    for (const p of PLATFORMS) if (input[p]) accounts[p] = profile(p, input[p]);
    await this.store.saveAccounts(accounts);
    await this.store.log(null, null, 'official_accounts_updated'); return accounts;
  }
  async attach(id, source) {
    const job = await this.store.get(id);
    if (job.source) throw new Error('Esta pieza ya tiene video. Crea otra para una nueva version.');
    job.source = { ...source, sha256: await hashFile(path.join(this.store.dir(id), 'source.mp4')) };
    await this.store.save(job); return job;
  }
  async prepare(id) {
    const job = await this.store.get(id), accounts = await this.store.accounts();
    if (!job.source) throw new Error('Primero carga un video.');
    if (Object.values(job.platforms).some(p => SENT.includes(p.status))) throw new Error('Esta pieza ya inicio la publicacion. Crea otra version para cambiar el video.');
    renderPlan(job.brief, job.source);
    if (await hashFile(path.join(this.store.dir(id), 'source.mp4')) !== job.source.sha256) throw new Error('El video base cambio. Carga una pieza nueva.');
    job.approval = null; delete job.error;
    for (const platform of PLATFORMS) {
      const state = job.platforms[platform];
      if (state.status === 'ready') continue;
      state.status = 'rendering'; delete state.error; await this.store.save(job);
      try {
        const result = await this.render(this.store.dir(id), platform, job.brief, job.source, state.copy, this.env);
        state.duration = result.plan.duration; state.coverAt = result.plan.coverAt;
        await writePackage(this.store.dir(id), platform, job, accounts[platform]);
        state.status = 'ready'; await this.store.log(id, platform, 'prepared');
      } catch (e) {
        state.status = 'render_failed'; state.error = e.message;
        await this.store.log(id, platform, 'preparation_failed', { code: 'MEDIA_ERROR' });
      }
      await this.store.save(job);
    }
    return job;
  }
  async edit(id, changes) {
    const job = await this.store.get(id), accounts = await this.store.accounts();
    if (Object.values(job.platforms).some(p => SENT.includes(p.status))) throw new Error('La pieza ya inicio la publicacion; no se puede cambiar su contenido.');
    const next = {};
    for (const p of PLATFORMS) {
      if (job.platforms[p].status !== 'ready') throw new Error('Prepara las tres versiones antes de editar sus textos.');
      const change = changes[p];
      next[p] = { ...validateCopy(change.copy, p), link: job.platforms[p].copy.link };
    }
    const options = changes.youtube.options;
    if (!['public', 'unlisted', 'private'].includes(options?.visibility) || typeof options.synthetic !== 'boolean' || typeof options.madeForKids !== 'boolean') throw new Error('Revisa las opciones de audiencia de YouTube.');
    job.approval = null;
    for (const p of PLATFORMS) {
      job.platforms[p].copy = next[p];
      if (p === 'youtube') job.platforms[p].options = options;
      await writePackage(this.store.dir(id), p, job, accounts[p]);
    }
    await this.store.save(job); await this.store.log(id, null, 'copy_edited'); return job;
  }
  async approve(id, attestation) {
    const job = await this.store.get(id), accounts = await this.store.accounts();
    if (!attestation?.reviewed || !attestation?.rights || !attestation?.pilot) throw new Error('Confirma la revision de las tres versiones, los derechos y los datos piloto.');
    if (!PLATFORMS.every(p => job.platforms[p].status === 'ready' || job.platforms[p].status === 'failed' || job.platforms[p].status === 'manual_ready')) throw new Error('Termina de preparar las tres versiones antes de aprobar.');
    for (const p of PLATFORMS) await writePackage(this.store.dir(id), p, job, accounts[p]);
    job.approval = { at: new Date().toISOString(), digest: approvalDigest(job, accounts), rights: true, pilot: true };
    await this.store.save(job); await this.store.log(id, null, 'approved'); return job;
  }
  async dispatch(id, selected = PLATFORMS) {
    if (!Array.isArray(selected) || !selected.length || selected.some(p => !PLATFORMS.includes(p)) || new Set(selected).size !== selected.length) throw new Error('Seleccion de plataformas no valida.');
    const job = await this.store.get(id), accounts = await this.store.accounts();
    await assertApproved(this.store, job, accounts);
    delete job.error;
    const caps = capabilities(this.env, accounts);
    for (const platform of selected) {
      const state = job.platforms[platform];
      if (SENT.includes(state.status)) continue;
      if (!accounts[platform]?.confirmedOfficial) { state.status = 'failed'; state.error = 'Falta configurar la cuenta oficial de Estudiemos.'; await this.store.save(job); continue; }
      if (!caps[platform].automatic) {
        state.status = 'manual_ready'; delete state.error;
        await this.store.log(id, platform, 'manual_package_ready'); await this.store.save(job); continue;
      }
      state.status = 'publishing'; delete state.error; delete state.remote;
      await this.store.save(job);
      try {
        const result = await this.connectors.publish(platform, {
          account: accounts[platform], state, file: path.join(this.store.dir(id), platform, 'video.mp4'), coverAt: state.coverAt,
          ...state.options, checkpoint: async remote => { state.remote = remote; await this.store.save(job); }
        });
        Object.assign(state, result);
        await this.store.log(id, platform, result.status, { url: result.url, verification: result.verification });
      } catch (e) {
        state.status = state.remote ? 'uncertain' : 'failed';
        state.error = API_MESSAGES[e.code] || 'La plataforma no confirmo el envio. Revisa el perfil o usa la carga manual.';
        await this.store.log(id, platform, state.status, { code: e.code || 'API_ERROR' });
      }
      await this.store.save(job);
    }
    return job;
  }
  async finish(id, platform) {
    const job = await this.store.get(id), accounts = await this.store.accounts(), state = job.platforms[platform];
    if (!state || state.status !== 'processing') throw new Error('No hay una carga en procesamiento para esa plataforma.');
    await assertApproved(this.store, job, accounts);
    let mutationStarted = false;
    try {
      const result = await this.connectors.finish(platform, accounts[platform], state, async remote => {
        mutationStarted = true; state.status = 'publishing'; state.remote = remote; await this.store.save(job);
      });
      Object.assign(state, result); delete state.error;
      await this.store.log(id, platform, result.status, result);
    } catch (e) {
      state.error = API_MESSAGES[e.code] || 'No se pudo comprobar el resultado. Revisa el perfil.';
      if (mutationStarted) state.status = 'uncertain';
      if (e.code === 'PROCESSING_FAILED') state.status = 'uncertain';
      await this.store.log(id, platform, 'status_checked', { code: e.code || 'API_ERROR' });
    }
    await this.store.save(job); return job;
  }
  async report(id, platform, input) {
    const job = await this.store.get(id), accounts = await this.store.accounts();
    await assertApproved(this.store, job, accounts);
    const state = job.platforms[platform];
    if (!state || !accounts[platform] || input.officialConfirmed !== true) throw new Error('Confirma que viste el video en el perfil oficial.');
    if (['published', 'uploaded', 'manual_reported', 'publishing', 'processing'].includes(state.status)) throw new Error('La publicacion ya esta registrada o en curso.');
    state.url = publicationUrl(platform, input.url, accounts[platform]);
    state.status = 'manual_reported'; state.verification = 'user_reported'; delete state.error;
    await this.store.save(job); await this.store.log(id, platform, 'manual_reported', { url: state.url, verification: 'user_reported' }); return job;
  }
  async snapshot() {
    const accounts = await this.store.accounts();
    return { accounts, capabilities: capabilities(this.env, accounts), busy: this.store.pending.size > 0,
      jobs: (await this.store.list()).map(job => ({ ...job,
        approved: !!job.approval && job.approval.digest === approvalDigest(job, accounts),
        platforms: Object.fromEntries(Object.entries(job.platforms).map(([p, s]) => { const { remote, ...safe } = s; return [p, safe]; })) })),
      logs: await this.store.logs() };
  }
}
