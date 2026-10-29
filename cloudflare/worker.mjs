import { invokeHandler } from './http-adapter.mjs';
import { dispatch, sendPush } from './push.mjs';
// Initialize the large CommonJS OAuth dependency before the first Drive request.
import '../api/_lib/google-drive.js';
import installTemplate from '../instalar.html';
import friendTemplate from '../amistad.html';
import config from '../vercel.json';
import accountConfig from '../api/account-config.js';
import adminMonitoring from '../api/admin-monitoring.js';
import agendaAi from '../api/agenda-ai.js';
import assistantRouter from '../api/assistant-router.js';
import planStatus from '../api/plan-status.js';
import supabaseClient from '../api/supabase-client.js';
import userRegistry from '../api/user-registry.js';
import whatsappLink from '../api/whatsapp-link.js';
import whatsappWebhook from '../api/whatsapp-webhook.js';
import widgetLink from '../api/widget-link.js';
import widgetPush from '../api/widget-push.js';
import workspaceAi from '../api/workspace-ai.js';

const handlers = Object.freeze({
  'account-config': accountConfig, 'admin-monitoring': adminMonitoring,
  'agenda-ai': agendaAi, 'assistant-router': assistantRouter, 'plan-status': planStatus,
  'supabase-client': supabaseClient, 'user-registry': userRegistry,
  'whatsapp-link': whatsappLink, 'whatsapp-webhook': whatsappWebhook,
  'widget-link': widgetLink, 'widget-push': widgetPush, 'workspace-ai': workspaceAi
});
const templates = { 'instalar.html': installTemplate, 'amistad.html': friendTemplate };
const securityHeaders = config.headers.find(rule => rule.source === '/(.*)').headers;
function secured(response) {
  const result = new Response(response.body, response);
  for (const { key, value } of securityHeaders) if (!result.headers.has(key)) result.headers.set(key, value);
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/widget-link' && url.searchParams.get('alarmFeed') === '1' && !url.searchParams.has('alarmSetup')) {
      return secured(Response.redirect(url.origin + '/.well-known/windows-alarms-retired.json', 307));
    }
    if (url.pathname === '/api/widget-push' && url.searchParams.get('mobilePush') === 'dispatch') return secured(await dispatch(request, env));
    const invitation = /^\/(materia|amistad)\/([^/]+)$/.exec(url.pathname);
    const api = /^\/api\/([a-z-]+)(?:\.js)?$/.exec(url.pathname);
    const handler = invitation ? accountConfig : api && handlers[api[1]];
    if (!handler) {
      if (url.pathname.startsWith('/api/')) return secured(Response.json({ message: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } }));
      return env.ASSETS.fetch(request);
    }
    const query = invitation ? { [invitation[1] === 'materia' ? 'courseInvitation' : 'friendInvitation']: invitation[2] } : {};
    const response = await invokeHandler(request, handler, { query, templates, sendPush });
    return secured(response);
  }
};
