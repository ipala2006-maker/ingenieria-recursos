const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const webpush = require('web-push');
const { limitsFor } = require('../api/_lib/push-dispatch');

const limits = limitsFor('cloudflare-free');
const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
const subscription = { endpoint:'https://web.push.apple.com/Q/fixture-only', keys:{
  p256dh:receiver.getPublicKey().toString('base64url'), auth:crypto.randomBytes(16).toString('base64url')
} };
const vapid = webpush.generateVAPIDKeys();
const payload = JSON.stringify({ title:'Repasar para el parcial', body:'Es hora de tu tarea.', tag:'fixture-only', owner:'00000000-0000-4000-8000-000000000001' });
const options = { vapidDetails:{ subject:'https://estudiemos-app.vercel.app', publicKey:vapid.publicKey, privateKey:vapid.privateKey }, TTL:600, urgency:'high', timeout:5000 };
const samples = [], iterations = 100;
let cpuStart;
for (let index = -5; index < iterations; index++) {
  if (index === 0) cpuStart = process.cpuUsage();
  const start = performance.now();
  for (let job = 0; job < limits.batchSize; job++) webpush.generateRequestDetails(subscription,payload,options);
  if (index >= 0) samples.push(performance.now()-start);
}
// Aggregate CPU over all samples: per-batch CPU counters are coarse on Windows.
const used = process.cpuUsage(cpuStart), sorted = samples.slice().sort((a,b)=>a-b);
console.log(JSON.stringify({ runtime:'node-diagnostic-only', node:process.version, platform:process.platform, iterations, jobsPerBatch:limits.batchSize,
  logicalSubrequestsPerFullBatch:limits.batchSize+2, networkRequests:0, cpuMsPerBatchMean:(used.user+used.system)/1000/iterations,
  wallMsPerBatch:{ mean:sorted.reduce((a,b)=>a+b,0)/iterations, p95:sorted[Math.ceil(iterations*0.95)-1], max:sorted.at(-1) },
  cloudflareCpuVerified:false, note:'No certifica los 10 ms de Workers. Medir en Cloudflare antes del cambio de trafico.' }));
