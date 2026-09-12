import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Studio } from '../lib/studio.mjs';
import { profile } from '../lib/content.mjs';
import { publishers } from '../lib/publishers.mjs';

const channelId = 'UC0000000000000000000000';
const account = profile('youtube', 'https://www.youtube.com/@estudiemos.test/');
const env = { SOCIAL_YOUTUBE_ENABLED: 'true', SOCIAL_YOUTUBE_AUDITED: 'true', SOCIAL_YOUTUBE_CHANNEL_ID: channelId, SOCIAL_YOUTUBE_CLIENT_ID: 'test-id', SOCIAL_YOUTUBE_CLIENT_SECRET: 'test-secret', SOCIAL_YOUTUBE_REFRESH_TOKEN: 'test-refresh' };
const copy = { title: 'Una guia, un bloque', description: 'Un ejercicio por vez.', hashtags: ['Ingenieria'] };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
async function media(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'estudiemos-publisher-test-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.match(path.basename(root), /^estudiemos-publisher-test-/); await fs.rm(root, { recursive: true, force: true }); });
  const file = path.join(root, 'video.mp4'); await fs.writeFile(file, 'fixture'); return { root, file };
}

test('YouTube verifies channel before uploading, confirms processing and honors visibility', async t => {
  const { file } = await media(t); const calls = [], checkpoints = [];
  const connector = publishers(env, async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.includes('/token')) return json({ access_token: 'test-access-token' });
    if (url.includes('/channels?')) return json({ items: [{ id: channelId, snippet: { customUrl: '@estudiemos.test' } }] });
    if (options.method === 'POST') { const payload = JSON.parse(options.body); assert.equal(payload.status.privacyStatus, 'unlisted'); assert.equal(payload.status.containsSyntheticMedia, true); return new Response('', { headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fake' } }); }
    if (options.method === 'PUT') { for await (const chunk of options.body) assert.ok(chunk.length); return json({ id: 'abcdefghijk', snippet: { channelId } }); }
    return json({ items: [{ snippet: { channelId }, status: { uploadStatus: 'processed', privacyStatus: 'unlisted' } }] });
  });
  const result = await connector.publish('youtube', { account, state: { copy }, file, visibility: 'unlisted', synthetic: true, checkpoint: async r => checkpoints.push(r) });
  assert.equal(result.status, 'processing');
  const done = await connector.finish('youtube', account, result, async () => {});
  assert.equal(done.status, 'uploaded'); assert.equal(done.verification, 'official_api');
  assert.ok(calls.findIndex(c => c.url.includes('/channels?')) < calls.findIndex(c => c.method === 'PUT'));
  assert.equal(checkpoints.length, 2);
});

test('YouTube rejects a channel mismatch and hostile upload locations without sending a video', async t => {
  const { file } = await media(t); let uploaded = false;
  const connector = publishers(env, async (url, options) => {
    if (url.includes('/token')) return json({ access_token: 'test' });
    if (url.includes('/channels?')) return json({ items: [{ id: channelId, snippet: { customUrl: '@ian.personal' } }] });
    uploaded = true; return json({});
  });
  await assert.rejects(connector.publish('youtube', { account, file }), /ACCOUNT_MISMATCH/); assert.equal(uploaded, false);
  const hostile = publishers(env, async (url, options) => {
    if (url.includes('/token')) return json({ access_token: 'test' });
    if (url.includes('/channels?')) return json({ items: [{ id: channelId, snippet: { customUrl: '@estudiemos.test' } }] });
    assert.equal(options.method, 'POST'); return new Response('', { headers: { location: 'https://evil.test/collect' } });
  });
  await assert.rejects(hostile.publish('youtube', { account, state: { copy }, file, checkpoint: async () => {} }), /NETWORK_POLICY_BLOCKED/);
});

test('Instagram resumable protocol waits for processing before a single publish', async t => {
  const { file } = await media(t), calls = [];
  const connector = publishers({ SOCIAL_INSTAGRAM_ENABLED: 'true', SOCIAL_META_API_VERSION: 'v24.0', SOCIAL_INSTAGRAM_USER_ID: '123', SOCIAL_INSTAGRAM_PAGE_TOKEN: 'test-only' }, async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.includes('fields=id,username')) return json({ id: '123', username: 'estudiemos.test' });
    if (url.includes('content_publishing_limit')) return json({ data: [{ quota_usage: 1, config: { quota_total: 100 } }] });
    if (url.endsWith('/media')) return json({ id: '456' });
    if (url.includes('rupload')) { for await (const chunk of options.body) assert.ok(chunk.length); return json({ success: true }); }
    if (url.includes('fields=status_code')) return json({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return json({ id: '789' });
    if (url.includes('fields=permalink')) return json({ permalink: 'https://www.instagram.com/reel/abc123/' });
    throw new Error('Unexpected endpoint');
  });
  const ig = profile('instagram', 'https://www.instagram.com/estudiemos.test/');
  const processing = await connector.publish('instagram', { account: ig, state: { copy }, file, coverAt: 1, checkpoint: async () => {} });
  assert.equal(processing.status, 'processing'); assert.equal(calls.filter(c => c.url.endsWith('/media_publish')).length, 0);
  const done = await connector.finish('instagram', ig, processing, async () => {});
  assert.equal(done.status, 'published'); assert.equal(calls.filter(c => c.url.endsWith('/media_publish')).length, 1);
});

test('lost upload response locks only the affected platform and logs no credentials', async t => {
  const { root } = await media(t);
  const studio = new Studio(root, { env, fetchImpl: async (url, options) => {
    if (url.includes('/token')) return json({ access_token: 'SECRET_DO_NOT_LOG' });
    if (url.includes('/channels?')) return json({ items: [{ id: channelId, snippet: { customUrl: '@estudiemos.test' } }] });
    if (options.method === 'POST') return new Response('', { headers: { location: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test' } });
    for await (const chunk of options.body) assert.ok(chunk.length);
    throw new Error('SECRET_DO_NOT_LOG provider failure');
  }, render: async (dir, platform) => { await fs.mkdir(path.join(dir, platform), { recursive: true }); for (const name of ['video.mp4', 'cover.jpg', 'subtitles.srt']) await fs.writeFile(path.join(dir, platform, name), 'test'); return { plan: { duration: 5, coverAt: 1 } }; } });
  await studio.init();
  await studio.accounts({ confirmedOfficial: true, instagram: 'https://www.instagram.com/estudiemos.test/', tiktok: 'https://www.tiktok.com/@estudiemos.test/', youtube: account.url });
  const { id } = await studio.create({ topic: 'inbox' }); await fs.writeFile(path.join(studio.store.dir(id), 'source.mp4'), 'source');
  await studio.attach(id, { duration: 5 }); await studio.prepare(id); await studio.approve(id, { reviewed: true, pilot: true, rights: true });
  const result = await studio.dispatch(id);
  assert.equal(result.platforms.youtube.status, 'uncertain'); assert.equal(result.platforms.instagram.status, 'manual_ready');
  const log = await fs.readFile(path.join(root, 'events.jsonl'), 'utf8');
  assert.ok(!log.includes('SECRET_DO_NOT_LOG'));
  assert.ok(!JSON.stringify(await studio.snapshot()).includes('SECRET_DO_NOT_LOG'));
});
