import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { command, probe, renderVariant } from '../lib/media.mjs';
import { brief, makeCopy } from '../lib/content.mjs';
import { hashFile } from '../lib/store.mjs';

test('FFmpeg creates three valid vertical H.264 exports with distinct CTAs, SRT and covers', { skip: process.env.SOCIAL_MEDIA_TEST !== '1', timeout: 180000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'estudiemos-media-test-'));
  try {
    await command(process.env.SOCIAL_FFMPEG || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-pix_fmt', 'yuv420p', path.join(root, 'source.mp4')]);
    const source = await probe(path.join(root, 'source.mp4'));
    const b = brief({ topic: 'pomodoro', hook: 'Una guia. Un bloque.', subtitles: '1\n00:00:00,000 --> 00:00:02,000\nUn ejercicio a la vez.', end: 4 });
    const hashes = [];
    for (const p of ['instagram', 'tiktok', 'youtube']) {
      const result = await renderVariant(root, p, b, source, makeCopy(b, p, 'media-test'));
      assert.equal(result.output.width, 1080); assert.equal(result.output.height, 1920); assert.equal(result.output.codec, 'h264'); assert.equal(result.output.audio, true);
      assert.ok(Math.abs(result.output.duration - 4) < 0.1);
      assert.ok((await fs.stat(path.join(root, p, 'cover.jpg'))).size > 1000);
      assert.match(await fs.readFile(path.join(root, p, 'subtitles.srt'), 'utf8'), /Un ejercicio/);
      hashes.push(await hashFile(path.join(root, p, 'video.mp4')));
    }
    assert.equal(new Set(hashes).size, 3);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.match(path.basename(root), /^estudiemos-media-test-/);
    await fs.rm(root, { recursive: true, force: true });
  }
});
