const { setTimeout: sleep } = require('node:timers/promises');
const { readFileSync } = require('node:fs');
const { account_id: account } = JSON.parse(readFileSync(require.resolve('../wrangler.jsonc'), 'utf8'));

const ORIGIN = 'https://estudiemos.ar';
const REPO = 'ipala2006-maker/ingenieria-recursos';
const GITHUB = 'https://api.github.com/repos/' + REPO;
const MAX_BACKUP_AGE_HOURS = 40;
const workersQuery = `query Watch($account: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: {accountTag: $account}) {
    accountTotal: workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) {
      sum { requests }
    }
    api: workersInvocationsAdaptive(limit: 1, filter: {scriptName: "estudiemos-candidate", datetime_geq: $start, datetime_leq: $end}) {
      sum { requests errors }
      quantiles { cpuTimeP99 wallTimeP99 }
    }
    cpuLimited: workersInvocationsAdaptive(limit: 1, filter: {scriptName: "estudiemos-candidate", status: "exceededCpu", datetime_geq: $start, datetime_leq: $end}) {
      sum { requests }
    }
  } }
}`;

async function json(fetcher, url, init = {}) {
  const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('HTTP_FAILURE');
  return response.json();
}

async function publicProbe(fetcher, route, accept) {
  const start = performance.now();
  try {
    const response = await fetcher(ORIGIN + route, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    return { ok: response.ok && await accept(response), ms: Math.round(performance.now() - start) };
  } catch (_) {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

async function backupAge(fetcher, token, now) {
  const init = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } };
  const { workflow_runs: runs } = await json(fetcher, GITHUB + '/actions/workflows/database-backup.yml/runs?branch=main&status=success&per_page=3', init);
  for (const run of runs.slice(0, 3)) {
    if (!Number.isSafeInteger(run.id) || !Number.isSafeInteger(run.run_attempt) || run.conclusion !== 'success') continue;
    const age = (now - Date.parse(run.created_at)) / 3600000;
    if (!Number.isFinite(age) || age < 0 || age > MAX_BACKUP_AGE_HOURS) continue;
    const name = `encrypted-database-${run.id}-${run.run_attempt}`;
    const { artifacts } = await json(fetcher, GITHUB + `/actions/runs/${run.id}/artifacts?name=${name}&per_page=1`, init);
    if (artifacts.some(item => item.name === name && item.expired === false && item.size_in_bytes > 0)) return Math.round(age);
  }
  return null;
}

async function workerMetrics(fetcher, token, now) {
  const body = await json(fetcher, 'https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: workersQuery,
      variables: { account, start: new Date(now - 86400000).toISOString(), end: new Date(now).toISOString() }
    })
  });
  const data = body.data?.viewer?.accounts?.[0];
  if (body.errors?.length || !Array.isArray(data?.accountTotal) || !Array.isArray(data?.api) ||
      !Array.isArray(data?.cpuLimited)) throw new Error('ANALYTICS_UNAVAILABLE');
  const api = data.api[0];
  const metrics = {
    accountRequests24h: data.accountTotal[0]?.sum?.requests ?? 0,
    apiRequests24h: api?.sum?.requests ?? 0,
    apiErrors24h: api?.sum?.errors ?? 0,
    apiCpuLimited24h: data.cpuLimited[0]?.sum?.requests ?? 0,
    apiCpuP99Us: api?.quantiles?.cpuTimeP99 ?? 0,
    apiWallP99Us: api?.quantiles?.wallTimeP99 ?? 0
  };
  if (Object.values(metrics).some(value => !Number.isFinite(value) || value < 0)) throw new Error('ANALYTICS_UNAVAILABLE');
  return metrics;
}

async function inspect({ fetcher = fetch, env = process.env, now = Date.now(), retry = () => sleep(3000) } = {}) {
  const alerts = [], warnings = [], probes = {};
  const checks = [
    ['site', '/', async r => { const ok = /^text\/html\b/i.test(r.headers.get('content-type') || ''); await r.body?.cancel(); return ok; }],
    ['auth_config', '/api/account-config', async r => { const v = await r.json(); return v.enabled === true && v.publicAppOrigin === ORIGIN && Boolean(v.captchaSiteKey); }],
    ['push_config', '/api/widget-push?mobilePush=config', async r => (await r.json()).enabled === true]
  ];
  for (const [name, route, accept] of checks) {
    let result = await publicProbe(fetcher, route, accept);
    if (!result.ok) {
      await retry();
      result = await publicProbe(fetcher, route, accept);
    }
    probes[name] = result;
    if (!result.ok) alerts.push(name + '_unavailable');
    else if (result.ms >= 2500) warnings.push(name + '_slow');
  }

  let backupAgeHours = 'not_configured', workers = 'not_configured';
  if (env.GITHUB_TOKEN) {
    try {
      backupAgeHours = await backupAge(fetcher, env.GITHUB_TOKEN, now);
      if (backupAgeHours === null) alerts.push('backup_missing_or_stale');
    } catch (_) {
      alerts.push('backup_status_unavailable');
    }
  }
  if (env.CF_ANALYTICS_READ_TOKEN) {
    try {
      workers = await workerMetrics(fetcher, env.CF_ANALYTICS_READ_TOKEN, now);
      if (workers.accountRequests24h >= 90000) alerts.push('workers_request_budget_critical');
      else if (workers.accountRequests24h >= 70000) warnings.push('workers_request_budget_watch');
      if (workers.apiErrors24h >= 3 && workers.apiErrors24h / Math.max(1, workers.apiRequests24h) >= 0.05) alerts.push('worker_errors_high');
      if (workers.apiCpuLimited24h >= 3) alerts.push('worker_cpu_limits_repeated');
      else if (workers.apiCpuLimited24h > 0) warnings.push('worker_cpu_limit_seen');
      if (workers.apiRequests24h >= 20 && workers.apiCpuP99Us >= 10000) warnings.push('worker_cpu_tail');
    } catch (_) {
      warnings.push('workers_analytics_unavailable');
    }
  }
  return { probes, backupAgeHours, workers, alerts, warnings };
}

function publicSummary(result) {
  return {
    probes: Object.fromEntries(Object.entries(result.probes).map(([name, probe]) => [name, probe.ok])),
    backupChecked: result.backupAgeHours !== 'not_configured',
    analyticsChecked: typeof result.workers === 'object'
  };
}

module.exports = { inspect, publicSummary };
if (require.main === module) inspect().then(result => {
  // Actions logs are public; numerical readings belong in the operator's local console.
  console.log(JSON.stringify(process.env.GITHUB_ACTIONS === 'true' ? publicSummary(result) : result));
  for (const warning of result.warnings) console.log('::warning::' + warning);
  for (const alert of result.alerts) console.log('::error::' + alert);
  if (result.alerts.length) process.exitCode = 1;
}).catch(() => {
  console.error('Monitor failed before completing checks.');
  process.exitCode = 1;
});
