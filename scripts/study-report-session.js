// These reports read the existing local replica. They never sync or refresh Auth.
const project = 'gxilgicgxhkdjmmyhrdd';
const sessionKey = 'sb-' + project + '-auth-token';
const ownerKey = 'estudiemos_cloud_user';

function get(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function readSession() {
  try { return JSON.parse(get(sessionKey)); } catch (_) { return null; }
}

function identity() {
  const owner = get(ownerKey), session = readSession();
  if (owner) return owner === session?.user?.id ? owner : null;
  return session?.user?.id ? null : 'guest';
}

async function verifyUser(signal) {
  const session = readSession(), owner = identity();
  if (!owner || owner === 'guest' || typeof session?.access_token !== 'string' ||
      !Number.isFinite(session.expires_at) || session.expires_at <= Date.now()/1000) return null;
  const response = await fetch('/api/account-config', {cache:'no-store', signal});
  if (!response.ok) return null;
  const {url,publishableKey} = await response.json();
  if (url !== 'https://' + project + '.supabase.co' || typeof publishableKey !== 'string') return null;
  const auth = await fetch(url + '/auth/v1/user', {
    headers: {apikey:publishableKey, Authorization:'Bearer ' + session.access_token},
    credentials:'omit', cache:'no-store', signal
  });
  if (!auth.ok) return null;
  const user = await auth.json();
  return user?.id === owner && identity() === owner && readSession()?.access_token === session.access_token ? user : null;
}

window.EstudiemosReportSession = Object.freeze({ identity, verifyUser, sessionKey, ownerKey });
window.dispatchEvent(new Event('estudiemos:report-session-ready'));
