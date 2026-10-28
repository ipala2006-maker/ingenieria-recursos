const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const webpush = require('web-push');

async function main() {
  const token = crypto.randomBytes(32).toString('hex');
  const root = path.resolve(__dirname, '..');
  // Credential travels over stdin directly to Wrangler; never argv, logs or disk.
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'CPU_PROBE_TOKEN', '--config', 'wrangler.probe.jsonc'], {
    cwd: root, input: token, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  const samples = [];
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
    if (response.status === 401 && propagationRetries++ < 15) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      index--;
      continue;
    }
    if (!response.ok || value.sent !== 2 || value.subrequests !== 4) {
      console.error(JSON.stringify({ stage: 'synthetic-request', httpStatus: response.status, sent: value.sent, failed: value.failed, subrequests: value.subrequests, fixtureStatus: value.fixtureStatus, errorType: value.errorType, errorCode: value.errorCode, diagnostic: value.diagnostic }));
      throw new Error('Probe did not complete both synthetic deliveries');
    }
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const result = { runtime: 'cloudflare-live-synthetic', iterations: samples.length, jobsPerBatch: 2, subrequests: 4,
    realNotifications: 0, databaseRequests: 0, wallMs: { p95: samples[94], max: samples[99] },
    cpuMs: null, productionDeliveryVerified: false,
    note: 'Synthetic crypto + four static binding fetches, not real SQL/push. Read CPU p50/p95/p99/max and exceededResources in Cloudflare Metrics. HTTP duration is not CPU.' };
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tmp', 'cloudflare-cpu-probe.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ stage: 'measurement-incomplete', errorType: error.name, networkCode: error.cause?.code, commandStatus: error.status })); process.exitCode = 1; });
