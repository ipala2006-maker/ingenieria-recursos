const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');

async function main() {
  const token = crypto.randomBytes(32).toString('hex');
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tmp', 'cloudflare-cpu-probe.json'), JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }));
  // Credential travels over stdin directly to Wrangler; never argv, logs or disk.
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'CPU_PROBE_TOKEN', '--config', 'wrangler.probe.jsonc'], {
    cwd: root, input: token, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  // Secret updates create a deployment from the server's current version. Upload
  // local code afterwards, then verify the revision on every measured response.
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'wrangler.probe.jsonc'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const samples = [];
  const workerVersions = new Set(), startedAt = new Date().toISOString();
  const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
  const body = JSON.stringify({ subscription: { endpoint: 'https://web.push.apple.com/Q/fixture-only', keys: {
    p256dh: receiver.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url')
  } }, vapid: { subject: 'https://estudiemos-app.vercel.app', ...webpush.generateVAPIDKeys() } });
  let propagationRetries = 0;
  for (let index = 0; index < 100; index++) {
    const start = performance.now();
    const response = await fetch('https://estudiemos-cpu-probe.estudiemos-services.workers.dev/__cpu_probe', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(20000)
    });
    const value = await response.json();
    if ((response.status === 401 || response.ok && value.probeRevision !== 'isolated-webcrypto-single-v1') && propagationRetries++ < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      index--;
      continue;
    }
    if (!response.ok || value.sent !== 1 || value.subrequests !== 3 || value.probeRevision !== 'isolated-webcrypto-single-v1' || typeof value.workerVersion !== 'string') {
      console.error(JSON.stringify({ stage: 'synthetic-request', httpStatus: response.status, sent: value.sent, failed: value.failed, subrequests: value.subrequests, fixtureStatus: value.fixtureStatus, errorType: value.errorType, errorCode: value.errorCode, diagnostic: value.diagnostic }));
      throw new Error('Probe did not complete its synthetic delivery');
    }
    workerVersions.add(value.workerVersion);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const result = { status: 'complete', runtime: 'cloudflare-live-synthetic', revision: 'isolated-webcrypto-single-v1', workerVersions: [...workerVersions],
    startedAt, finishedAt: new Date().toISOString(), iterations: samples.length, jobsPerBatch: 1, subrequests: 3,
    realNotifications: 0, databaseRequests: 0, wallMs: { p95: samples[94], max: samples[99] },
    cpuMs: null, productionDeliveryVerified: false,
    note: 'Synthetic crypto + three static binding fetches, not real SQL/push. Read CPU quantiles and exceededResources in Cloudflare Metrics. HTTP duration is not CPU.' };
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tmp', 'cloudflare-cpu-probe.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ stage: 'measurement-incomplete', errorType: error.name, networkCode: error.cause?.code, commandStatus: error.status })); process.exitCode = 1; });
