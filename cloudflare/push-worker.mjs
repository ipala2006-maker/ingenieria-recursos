import { dispatch } from './push.mjs';

// Keep alarm invocations independent of the Drive SDK and public API bundle.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/dispatch' || url.pathname === '/api/widget-push' && url.searchParams.get('mobilePush') === 'dispatch') return dispatch(request, env);
    return Response.json({ message: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
};
