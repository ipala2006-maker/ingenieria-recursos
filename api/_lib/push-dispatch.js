const PROFILES = Object.freeze({
  vercel: Object.freeze({ batchSize: 20, concurrency: 10, maxJobs: 100, subrequests: 160, legacy: true, wallTimeMs: 80000, batchReserveMs: 42000 }),
  'cloudflare-free': Object.freeze({ batchSize: 4, concurrency: 2, maxJobs: 4, subrequests: 40, legacy: false, wallTimeMs: 60000, batchReserveMs: 0 }),
  'cloudflare-free-small': Object.freeze({ batchSize: 2, concurrency: 2, maxJobs: 2, subrequests: 40, legacy: false, wallTimeMs: 60000, batchReserveMs: 0 })
});

function limitsFor(profile) {
  if (typeof profile !== 'string' || !Object.hasOwn(PROFILES, profile)) throw new Error('PUSH_PROFILE_REQUIRED');
  return PROFILES[profile];
}

async function dispatchPush({ profile, rpc, send, now = Date.now }) {
  const limits = limitsFor(profile), deadline = now() + limits.wallTimeMs;
  const seen = new Set();
  let sent = 0, failed = 0, claimed = 0, batches = 0, subrequests = 0;
  const request = async operation => {
    if (subrequests >= limits.subrequests) throw new Error('PUSH_REQUEST_BUDGET');
    subrequests++;
    return operation();
  };
  while (claimed < limits.maxJobs) {
    if (now() > deadline - limits.batchReserveMs) break;
    const size = Math.min(limits.batchSize, limits.maxJobs - claimed);
    if (subrequests + size + 2 > limits.subrequests) break;
    let jobs, legacy = false;
    try {
      jobs = await request(() => rpc('claim_mobile_push_batch', { p_limit: size }));
    } catch (error) {
      if (!limits.legacy || error.status !== 404 || error.data?.code !== 'PGRST202') throw error;
      legacy = true;
      jobs = await request(() => rpc('claim_mobile_push_jobs', {}));
    }
    // Never slice an oversized claim: that would consume attempts for unsent jobs.
    if (!Array.isArray(jobs) || jobs.length > (legacy ? 5 : size)) throw new Error('INVALID_PUSH_CLAIM');
    for (const job of jobs) {
      const id = job?.id;
      if (!(Number.isSafeInteger(id) && id > 0 || typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id)) || seen.has(String(id))) throw new Error('INVALID_PUSH_CLAIM');
      seen.add(String(id));
    }
    if (!jobs.length) break;
    claimed += jobs.length;
    batches++;
    const results = [];
    async function deliver(job) {
      try {
        await request(() => send(job));
        results.push({ id: job.id, ok: true, expired: false });
        sent++;
      } catch (error) {
        results.push({ id: job.id, ok: false, expired: [404, 410].includes(error.statusCode) });
        failed++;
      }
    }
    for (let index = 0; index < jobs.length; index += limits.concurrency) {
      await Promise.all(jobs.slice(index, index + limits.concurrency).map(deliver));
    }
    // Acknowledge before claiming more. Failed acknowledgements retain SQL leases.
    if (legacy) {
      const acknowledgements = await Promise.allSettled(results.map(result => request(() => rpc('finish_mobile_push_job', {
        p_id: result.id, p_ok: result.ok, p_expired: result.expired
      }))));
      if (acknowledgements.some(result => result.status === 'rejected')) throw new Error('PUSH_ACK_UNAVAILABLE');
      break;
    }
    await request(() => rpc('finish_mobile_push_jobs', { p_results: results }));
    if (jobs.length < size) break;
  }
  return { sent, failed, claimed, batches, subrequests };
}

module.exports = { dispatchPush, limitsFor };
