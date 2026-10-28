const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');

(async () => {
  const root = path.resolve(__dirname, '..');
  const probe = JSON.parse(fs.readFileSync(path.join(root, 'tmp/cloudflare-cpu-probe.json'), 'utf8'));
  if (probe.revision !== 'isolated-webcrypto-single-v1' || probe.workerVersions?.length !== 1) throw new Error('No versioned probe');
  // Official CLI credential interface, in memory only; never read its keyring or
  // config files. The token is sent exclusively to Cloudflare's own API.
  const auth = JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'auth', 'token', '--json'], {
    cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  }));
  if (auth.type !== 'oauth' || !auth.token) throw new Error('OAuth unavailable');
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query ProbeCPU($account: string!, $start: Time!, $end: Time!) {
        viewer { accounts(filter: { accountTag: $account }) {
          workersInvocationsAdaptive(limit: 10, filter: { scriptName: "estudiemos-cpu-probe", datetime_geq: $start, datetime_leq: $end }) {
            sum { requests errors subrequests }
            quantiles { __typename cpuTimeP50 cpuTimeP99 }
            dimensions { status }
          }
        } }
      }`,
      variables: { account: '7dc38ab200688eea2a1a951a04225fa4',
        start: new Date(Math.floor(Date.parse(probe.startedAt) / 1000) * 1000 - 5000).toISOString(),
        end: new Date(Math.ceil(Date.parse(probe.finishedAt) / 1000) * 1000 + 5000).toISOString() }
    }), signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok || data.errors?.length) {
    console.error(JSON.stringify({ httpStatus: response.status, errors: data.errors?.map(error => ({ message: error.message, code: error.extensions?.code })) }));
    process.exitCode = 1; return;
  }
  const rows = data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  const typeName = rows?.[0]?.quantiles?.__typename;
  let fieldDescriptions = [];
  if (typeName) {
    const schemaResponse = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: 'Bearer ' + auth.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query CPUUnits($name: String!) { __type(name: $name) { fields { name description } } }', variables: { name: typeName } }),
      signal: AbortSignal.timeout(20000)
    });
    const schema = await schemaResponse.json();
    fieldDescriptions = (schema.data?.__type?.fields || []).filter(field => ['cpuTimeP50', 'cpuTimeP99'].includes(field.name));
  }
  const result = { source: 'Cloudflare GraphQL Analytics', workerVersion: probe.workerVersions[0], start: probe.startedAt, end: probe.finishedAt,
    rawProviderMetrics: rows, fieldDescriptions, productionDeliveryVerified: false };
  fs.writeFileSync(path.join(root, 'tmp/cloudflare-cpu-metrics.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})().catch(error => { console.error(JSON.stringify({ metricsUnavailable: true, type: error.name })); process.exitCode = 1; });
