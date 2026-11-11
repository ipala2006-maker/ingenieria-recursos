const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect, publicSummary } = require('../scripts/production-watch.cjs');

const now = Date.parse('2026-11-11T18:00:00Z');
const backup = (id, hours) => ({ id, conclusion: 'success', run_attempt: 1, created_at: new Date(now - hours * 3600000).toISOString() });
function fake({ runs = [], artifacts = {}, analytics, broken = new Set() } = {}) {
  const calls = [];
  async function fetcher(url, init) {
    calls.push({ url, init });
    if (broken.has(url)) return new Response('', { status: 503 });
    if (url === 'https://estudiemos.ar/') return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
    if (url.endsWith('/api/account-config')) return Response.json({ enabled: true, publicAppOrigin: 'https://estudiemos.ar', captchaSiteKey: 'public' });
    if (url.endsWith('mobilePush=config')) return Response.json({ enabled: true });
    if (url.includes('/workflows/database-backup.yml/runs')) return Response.json({ workflow_runs: runs });
    if (url.includes('/actions/runs/')) return Response.json({ artifacts: artifacts[new URL(url).pathname.split('/')[6]] ?? [] });
    if (url === 'https://api.cloudflare.com/client/v4/graphql') return Response.json(analytics);
    throw new Error('Unexpected provider');
  }
  return { calls, fetcher };
}

test('public checks are limited and omit all configuration data from the result', async () => {
  const { calls, fetcher } = fake();
  const result = await inspect({ fetcher, env: {}, now });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.init.redirect === 'error' && !call.init.headers));
  assert.ok(Object.values(result.probes).every(probe => probe.ok));
  assert.deepEqual(result.alerts, []);
  assert.equal(result.workers, 'not_configured');
  assert.doesNotMatch(JSON.stringify(result), /captchaSiteKey|publicAppOrigin/);
});

test('failed checks retry once; a skipped backup cannot masquerade as a fresh artifact', async () => {
  const { calls, fetcher } = fake({ broken: new Set(['https://estudiemos.ar/api/widget-push?mobilePush=config']), runs: [backup(10, 2), backup(11, 48)] });
  let retries = 0;
  const result = await inspect({ fetcher, env: { GITHUB_TOKEN: 'github-fixture' }, now, retry: async () => { retries++; } });
  assert.deepEqual(result.alerts, ['push_config_unavailable','backup_missing_or_stale']);
  assert.equal(retries, 1);
  assert.equal(calls.filter(call => call.url.includes('/actions/runs/')).length, 1);
});

test('only real active artifacts count; aggregate quota and CPU warnings do not print secrets', async () => {
  const { calls, fetcher } = fake({ runs: [backup(20, 25)], artifacts: {20:[{ name:'encrypted-database-20-1', expired:false, size_in_bytes:31000 }]},
    analytics: {data:{viewer:{accounts:[{accountTotal:[{sum:{requests:91000}}],api:[{sum:{requests:50,errors:4},quantiles:{cpuTimeP99:12000,wallTimeP99:200000}}],cpuLimited:[{sum:{requests:3}}]}]}}}
  });
  const result = await inspect({ fetcher, env: { GITHUB_TOKEN:'github-fixture', CF_ANALYTICS_READ_TOKEN:'cf-fixture' }, now });
  assert.equal(result.backupAgeHours, 25);
  assert.deepEqual(result.alerts, ['workers_request_budget_critical','worker_errors_high','worker_cpu_limits_repeated']);
  assert.ok(result.warnings.includes('worker_cpu_tail'));
  assert.doesNotMatch(JSON.stringify(result), /fixture/);
  assert.deepEqual(publicSummary(result), {
    probes: { site:true, auth_config:true, push_config:true }, backupChecked:true, analyticsChecked:true
  });
  for (const call of calls) {
    const host = new URL(call.url).hostname;
    assert.equal(call.init.headers?.Authorization, host==='api.github.com'?'Bearer github-fixture':host==='api.cloudflare.com'?'Bearer cf-fixture':undefined);
  }
});
