const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('public presentation promotes only available tools and four available widgets', () => {
  const html = read('instalar.html');
  assert.doesNotMatch(html, /Mi espacio|Trabajar con la IA|WhatsApp|data-scene="(?:space|ai)"/);
  assert.deepEqual([...html.matchAll(/data-tour-target="([^"]+)"/g)].map(match => match[1]), ['inbox', 'calendar', 'focus', 'progress']);
  assert.equal((html.match(/class="widget-gallery__item/g) || []).length, 4);
  assert.match(read('.vercelignore'), /^marketing\/$/m);
  assert.ok(fs.existsSync(path.join(root, 'assets/install/free-launch-preview.png')));
});

test('future presentation and paused implementations remain saved without activating billing', () => {
  assert.match(read('docs/future-install-presentation.html'), /data-scene="ai"/);
  assert.match(read('docs/future-install-presentation.html'), /widget-card--workspace/);
  assert.match(read('scripts/account.js'), /const WHATSAPP_BOT_ENABLED = false/);
  assert.match(read('scripts/account.js'), /const COMMERCIAL_LAUNCH_ENABLED = false/);
  assert.match(read('shared/plans.js'), /WhatsApp/);
});

test('organic marketing rejects paused topics while keeping their creative briefs', async () => {
  const { TOPICS, FUTURE_TOPICS, brief, makeCopy } = await import('../marketing/social-studio/lib/content.mjs');
  assert.deepEqual(Object.keys(TOPICS), ['inbox', 'pomodoro', 'widgets']);
  for (const topic of ['espacio', 'organizador']) {
    assert.ok(FUTURE_TOPICS[topic].beats.length);
    assert.throws(() => brief({ topic }), /no esta disponible/);
    assert.throws(() => makeCopy({ topic }, 'youtube', 'pilot'), /no esta disponible/);
  }
});

test('even previously approved future drafts cannot pass the publication gate', async () => {
  const { assertApproved } = await import('../marketing/social-studio/lib/store.mjs');
  const draft = { brief: { topic: 'organizador' }, approval: { digest: 'legacy' } };
  await assert.rejects(assertApproved({}, draft, {}), /no esta disponible/);
  assert.equal(draft.brief.topic, 'organizador');
});
