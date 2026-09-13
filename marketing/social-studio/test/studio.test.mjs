import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Studio } from '../lib/studio.mjs';
import { hashFile, assertApproved } from '../lib/store.mjs';
import { allowedRequest, network } from '../lib/network.mjs';
import { PLATFORMS, brief, profile, publicationUrl } from '../lib/content.mjs';
import { parseSrt, renderPlan, command } from '../lib/media.mjs';
import { capabilities, publishers } from '../lib/publishers.mjs';
import { createServer } from '../server.mjs';

const official = { confirmedOfficial: true, instagram: 'https://www.instagram.com/estudiemos.test/', tiktok: 'https://www.tiktok.com/@estudiemos.test/', youtube: 'https://www.youtube.com/@estudiemos.test/' };
const review = { reviewed: true, pilot: true, rights: true };
async function cleanTestDir(root) {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.match(path.basename(root), /^estudiemos-(social|http)-test-/);
  await fs.rm(root, { recursive: true, force: true });
}
const fakeRender = async (dir, p) => {
  const target = path.join(dir, p); await fs.mkdir(target, { recursive: true });
  for (const name of ['video.mp4', 'cover.jpg', 'subtitles.srt']) await fs.writeFile(path.join(target, name), `fixture-${name}`);
  return { plan: { duration: 15, coverAt: 1 } };
};
async function fixture(t, opts = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'estudiemos-social-test-'));
  t.after(() => cleanTestDir(root));
  const studio = new Studio(root, { env: {}, render: fakeRender, ...opts }); await studio.init();
  const job = await studio.create({ topic: 'pomodoro' });
  await fs.writeFile(path.join(studio.store.dir(job.id), 'source.mp4'), 'source-fixture');
  await studio.attach(job.id, { duration: 15, width: 1080, height: 1920 });
  await studio.accounts(official);
  return { studio, id: job.id, root };
}

test('all platform assets prepared, reviewed, delivered and independently reported without network', async t => {
  let calls = 0;
  const { studio, id } = await fixture(t, { fetchImpl: () => { calls++; throw new Error('No network expected'); } });
  await studio.prepare(id);
  await assert.rejects(studio.dispatch(id), /aprueba/);
  await studio.approve(id, review); const result = await studio.dispatch(id);
  assert.ok(PLATFORMS.every(p => result.platforms[p].status === 'manual_ready'));
  await studio.report(id, 'tiktok', { officialConfirmed: true, url: 'https://www.tiktok.com/@estudiemos.test/video/1234567890123456789' });
  const again = await studio.dispatch(id);
  assert.equal(again.platforms.tiktok.status, 'manual_reported');
  assert.equal(again.platforms.youtube.status, 'manual_ready'); assert.equal(calls, 0);
  const logs = await studio.store.logs(); assert.equal(logs.filter(l => l.event === 'manual_reported').length, 1);
});

test('token and every ads, billing, arbitrary host and redirect request are blocked', async () => {
  for (const url of ['https://graph.facebook.com/v24.0/act_123/campaigns', 'https://graph.facebook.com/v24.0/123/adaccounts', 'https://ads.tiktok.com/boost', 'https://www.googleapis.com/billing', 'https://evil.test/upload', 'http://graph.facebook.com/v24.0/123/media', 'https://graph.facebook.com/v24.0/123/media?access_token=secret']) assert.equal(allowedRequest(url, 'POST'), false, url);
  let calls = 0; const request = network(async () => { calls++; return new Response('{}'); });
  await assert.rejects(request('https://graph.facebook.com/v24.0/123/campaigns', { method: 'POST' }), /NETWORK_POLICY_BLOCKED/); assert.equal(calls, 0);
  assert.equal(allowedRequest('https://graph.facebook.com/v24.0/123/media_publish', 'POST'), true);
  assert.equal(allowedRequest('https://rupload.facebook.com/ig-api-upload/v24.0/456', 'POST'), true);
});

test('personal profiles, host tricks and foreign TikTok posts are rejected', () => {
  for (const url of ['https://instagram.com/ian.personal/', 'https://instagram.com.evil.test/estudiemos/', 'https://evil.test@instagram.com/estudiemos/', 'https://instagram.com/estudiemos/?key=secret']) assert.throws(() => profile('instagram', url));
  const account = profile('tiktok', official.tiktok);
  assert.throws(() => publicationUrl('tiktok', 'https://www.tiktok.com/@other.user/video/123', account));
  assert.equal(capabilities({}, {}).tiktok.automatic, false);
  assert.equal(capabilities({ SOCIAL_YOUTUBE_ENABLED: 'true' }, { youtube: account }).youtube.automatic, false);
});

test('a swapped token cannot upload even once', async () => {
  const requests = [];
  const connector = publishers({ SOCIAL_INSTAGRAM_ENABLED: 'true', SOCIAL_META_API_VERSION: 'v24.0', SOCIAL_INSTAGRAM_USER_ID: '123', SOCIAL_INSTAGRAM_PAGE_TOKEN: 'test-only' }, async (url, options) => { requests.push(options.method); return new Response(JSON.stringify({ id: '123', username: 'ian.personal' })); });
  await assert.rejects(connector.publish('instagram', { account: profile('instagram', official.instagram) }), /ACCOUNT_MISMATCH/);
  assert.deepEqual(requests, ['GET']);
});

test('changed video, text, destination or visibility invalidates approval', async t => {
  const { studio, id } = await fixture(t);
  await studio.prepare(id); await studio.approve(id, review);
  let job = await studio.store.get(id); const accounts = await studio.store.accounts();
  await fs.appendFile(path.join(studio.store.dir(id), 'instagram/video.mp4'), '-modified');
  await assert.rejects(assertApproved(studio.store, job, accounts), /archivo cambio/);
  await studio.approve(id, review); job = await studio.store.get(id);
  const changes = structuredClone(job.platforms); changes.youtube.options.visibility = 'private';
  await studio.edit(id, changes); await assert.rejects(studio.dispatch(id), /aprueba/);
  await studio.approve(id, review);
  await studio.accounts({ ...official, youtube: 'https://www.youtube.com/@estudiemos.other/' });
  await assert.rejects(studio.dispatch(id), /aprueba/);
});

test('one render failure retains completed versions and retries only failed variant', async t => {
  const attempts = {}, { studio, id } = await fixture(t, { render: async (dir, p) => { attempts[p] = (attempts[p] || 0) + 1; if (p === 'tiktok' && attempts[p] === 1) throw new Error('test media failure'); return fakeRender(dir, p); } });
  const first = await studio.prepare(id);
  assert.equal(first.platforms.tiktok.status, 'render_failed'); assert.equal(first.platforms.youtube.status, 'ready');
  await assert.rejects(studio.approve(id, review), /preparar/);
  await studio.prepare(id); assert.deepEqual(attempts, { instagram: 1, tiktok: 2, youtube: 1 });
});

test('restart and uncertain sends never cause automatic reposts', async t => {
  const { studio, id } = await fixture(t);
  await studio.prepare(id); await studio.approve(id, review);
  const job = await studio.store.get(id); job.platforms.instagram.status = 'publishing';
  await studio.store.save(job); await studio.store.recover();
  assert.equal((await studio.store.get(id)).platforms.instagram.status, 'uncertain');
  const retry = await studio.dispatch(id); assert.equal(retry.platforms.instagram.status, 'uncertain');
  await assert.rejects(studio.prepare(id), /inicio la publicacion/);
});

test('simultaneous operations cannot interleave', async t => {
  const { studio } = await fixture(t); let release;
  const first = studio.store.lock('studio', () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(studio.store.lock('studio', () => {}), /operacion en curso/);
  release(); await first;
});

test('SRT times and vertical edit bounds validated before rendering', () => {
  assert.equal(parseSrt('1\n00:00:00,000 --> 00:00:02,000\nUna tarea.', 10).length, 1);
  assert.throws(() => parseSrt('1\n00:00:00,000 --> 00:00:20,000\nUna tarea.', 10));
  assert.throws(() => renderPlan(brief({ topic: 'inbox' }), { duration: 120 }));
  assert.throws(() => renderPlan(brief({ topic: 'inbox', start: 4, end: 14 }), { duration: 10 }));
  assert.equal(renderPlan(brief({ topic: 'inbox', start: 2, end: 12 }), { duration: 20 }).duration, 10);
});

test('local server rejects CSRF, traversal, unknown routes and out-of-range media', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'estudiemos-http-test-'));
  const { server } = await createServer({ root, env: {}, render: fakeRender });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await cleanTestDir(root); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/state', { headers: { Origin: 'https://evil.test' } })).status, 403);
  const badHost = await new Promise(resolve => http.get(base + '/api/state', { headers: { Host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode); }));
  assert.equal(badHost, 403);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/api/jobs/../../.env')).status, 404);
  assert.equal((await fetch(base + '/logo.png', { headers: { Range: 'bytes=9999999999-' } })).status, 416);
  const response = await fetch(base + '/'); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.capabilities.instagram.automatic, false); assert.equal(state.token.length, 64);
});

test('approved ZIP includes exactly the 18 public deliverables and no source or credentials', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'estudiemos-http-test-'));
  const { server, studio } = await createServer({ root, env: {}, render: fakeRender });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await cleanTestDir(root); });
  const job = await studio.create({ topic: 'inbox' });
  await fs.writeFile(path.join(studio.store.dir(job.id), 'source.mp4'), 'fixture');
  await studio.attach(job.id, { duration: 15, width: 1080, height: 1920 });
  await studio.prepare(job.id);
  const url = `http://127.0.0.1:${server.address().port}/download/${job.id}/paquete.zip`;
  assert.equal((await fetch(url)).status, 400);
  await studio.approve(job.id, review);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.ok((await response.arrayBuffer()).byteLength > 100);
  const listing = await command('tar', ['-tf', path.join(studio.store.dir(job.id), 'Estudiemos-redes.zip')]);
  const names = listing.trim().split(/\r?\n/);
  assert.equal(names.length, 18);
  assert.ok(names.every(name => /^(instagram|tiktok|youtube)\/(video\.mp4|cover\.jpg|subtitles\.srt|copy\.txt|publicar\.txt|guion\.txt)$/.test(name)));
  await fs.appendFile(path.join(studio.store.dir(job.id), 'youtube/video.mp4'), 'modified');
  assert.equal((await fetch(url)).status, 400);
});
