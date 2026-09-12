import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
  await fs.rename(temp, file);
}
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function jobId(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Pieza no valida.');
  return id;
}
export class Store {
  constructor(root) { this.root = root; this.pending = new Map(); }
  dir(id) { return path.join(this.root, 'jobs', jobId(id)); }
  async init() { await fs.mkdir(path.join(this.root, 'jobs'), { recursive: true }); }
  async get(id) { return JSON.parse(await fs.readFile(path.join(this.dir(id), 'job.json'), 'utf8')); }
  async save(job) { job.updatedAt = new Date().toISOString(); await atomic(path.join(this.dir(job.id), 'job.json'), job); }
  async list() {
    const result = [];
    for (const id of await fs.readdir(path.join(this.root, 'jobs'))) {
      if (!/^[0-9a-f-]{36}$/.test(id)) continue;
      try { result.push(await this.get(id)); } catch { /* An interrupted initial upload has no manifest yet. */ }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async accounts() {
    try { return JSON.parse(await fs.readFile(path.join(this.root, 'accounts.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  }
  async saveAccounts(accounts) { await atomic(path.join(this.root, 'accounts.json'), accounts); }
  async log(id, platform, event, detail = {}) {
    // Structured, allowlisted fields only. Never log raw provider responses or tokens.
    const row = { at: new Date().toISOString(), jobId: id, platform, event,
      code: detail.code, url: detail.url, verification: detail.verification };
    await fs.appendFile(path.join(this.root, 'events.jsonl'), JSON.stringify(row) + '\n', { mode: 0o600 });
  }
  async logs() {
    try { return (await fs.readFile(path.join(this.root, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).slice(-250).map(x => JSON.parse(x)); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  async lock(key, fn) {
    if (this.pending.has(key)) throw new Error('Hay una operacion en curso. Espera a que termine.');
    const promise = Promise.resolve().then(fn);
    this.pending.set(key, promise);
    try { return await promise; } finally { this.pending.delete(key); }
  }
  async recover() {
    for (const job of await this.list()) {
      let changed = false;
      for (const p of Object.values(job.platforms)) {
        if (p.status === 'publishing') { p.status = 'uncertain'; p.error = 'Se interrumpio el envio. Revisa el perfil antes de reintentar.'; changed = true; }
        if (p.status === 'rendering') { p.status = 'render_failed'; p.error = 'Se interrumpio la preparacion. Podes reintentar.'; changed = true; }
      }
      if (changed) await this.save(job);
    }
  }
}

export function approvalDigest(job, accounts) {
  return digest({ brief: job.brief, sourceHash: job.source?.sha256, accounts,
    variants: Object.fromEntries(Object.entries(job.platforms).map(([p, s]) => [p, { copy: s.copy, files: s.files, options: s.options }])) });
}

export async function assertApproved(store, job, accounts) {
  if (!job.approval || job.approval.digest !== approvalDigest(job, accounts)) throw new Error('Revisa y aprueba la version actual antes de continuar.');
  for (const [platform, state] of Object.entries(job.platforms)) {
    for (const [name, sha256] of Object.entries(state.files || {})) {
      if (await hashFile(path.join(store.dir(job.id), platform, name)) !== sha256) throw new Error('Un archivo cambio despues de la revision. Prepara y aprueba nuevamente.');
    }
  }
}
