import { buildPushPayload } from '@block65/webcrypto-web-push';
import credentials from '../api/_lib/push-credentials.js';
import dispatcher from '../api/_lib/push-dispatch.js';
import admin from '../api/_lib/supabase-admin.js';
import scopes from '../api/_lib/push-scope.js';

export async function preparePush(subscription, payload, vapidDetails = {
  subject: process.env.APP_ORIGIN || 'https://estudiemos-app.vercel.app',
  publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY
}) {
  if (!credentials.validSubscription(subscription)) throw new Error('Invalid push destination');
  return { endpoint: subscription.endpoint, ...await buildPushPayload({ data: payload, options: { ttl: 600, urgency: 'high' } }, subscription, vapidDetails) };
}

export async function sendPush(subscription, payload) {
  const details = await preparePush(subscription, payload);
  const result = await fetch(details.endpoint, {
    method: details.method, headers: details.headers, body: details.body,
    redirect: 'manual', signal: AbortSignal.timeout(5000)
  });
  try { await result.body?.cancel(); } catch { /* A received provider status is authoritative. */ }
  if (!result.ok) throw Object.assign(new Error('Push rejected'), { statusCode: result.status });
}

export async function dispatch(request, env) {
  if (request.method !== 'POST' || !credentials.cronAuthorized(request.headers.get('authorization'))) {
    return Response.json({ message: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  let scope;
  try { scope = scopes.scopeForEnvironment(); } catch { /* Invalid migration settings stay disabled. */ }
  if (!scope || env.PUSH_DISPATCH_ENABLED !== 'true' || !admin.isConfigured()
      || !/^[A-Za-z0-9_-]{87}$/.test(process.env.WEB_PUSH_PUBLIC_KEY || '')
      || !/^[A-Za-z0-9_-]{43}$/.test(process.env.WEB_PUSH_PRIVATE_KEY || '')) {
    return Response.json({ enabled: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const metrics = await dispatcher.dispatchPush({
      profile: 'cloudflare-free-single',
      scope,
      rpc: (name, body) => admin.adminRequest(`/rest/v1/rpc/${name}`, {
        method: 'POST', body: JSON.stringify(body), redirect: 'manual'
      }),
      send: job => sendPush(job.subscription, { title: job.title, body: 'Es hora de tu tarea.', tag: job.tag, owner: job.owner })
    });
    // Only aggregate counters. Real CPU comes from Workers invocation telemetry.
    console.log(JSON.stringify({ event: 'push_batch', ...metrics }));
    return Response.json(metrics, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: 'Delivery unavailable' }, { status: 503 });
  }
}
