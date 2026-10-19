const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { authenticateBearer, adminRequest, isConfigured } = require('./supabase-admin');
const { setSecurityHeaders, isSameOriginRequest, requireJsonRequest, rejectOversizedBody, enforceRateLimit } = require('./request-security');
const { seal, unseal } = require('./drive-vault');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BROWSE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const browseEnabled = () => process.env.GOOGLE_DRIVE_BROWSE_ENABLED === 'true';
const hasBrowse = saved => saved?.scopes?.includes(BROWSE_SCOPE) === true;
const COOKIE = '__Host-estudiemos-drive-oauth';
const TABLE = '/rest/v1/drive_connections';
const pilotEmails = () => String(process.env.GOOGLE_DRIVE_PILOT_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
function pilotAllowed(user) {
  const emails = pilotEmails();
  return !emails.length || Boolean(user?.email_confirmed_at && emails.includes(String(user.email || '').toLowerCase()));
}
const configured = () => {
  try { origin(); return Boolean(isConfigured() && /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(process.env.GOOGLE_DRIVE_CLIENT_ID || '') && process.env.GOOGLE_DRIVE_CLIENT_SECRET && /^[a-f0-9]{64}$/i.test(process.env.DRIVE_TOKEN_ENCRYPTION_KEY || '')); }
  catch (_) {return false;}
};
function origin() {
  const value = new URL(process.env.GOOGLE_DRIVE_APP_ORIGIN || 'https://estudiemos-app.vercel.app');
  if (value.protocol !== 'https:' || value.pathname !== '/' || value.search || value.hash || value.username || value.password) throw new Error('DRIVE_NOT_CONFIGURED');
  return value.origin;
}
function client() {
  return new OAuth2Client({clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, redirectUri: origin() + '/api/account-config?drive=callback', transporterOptions: { timeout: 12000, retry: false }});
}
const setCookie = (res, value, age) => res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`);
function cookie(req) {
  const matches = String(req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(COOKIE + '='));
  if (matches.length !== 1) throw new Error('INVALID_STATE');
  return matches[0].slice(COOKIE.length + 1);
}
const pathFor = id => TABLE + '?user_id=eq.' + encodeURIComponent(id);
async function record(id) {
  const rows = await adminRequest(pathFor(id) + '&select=credentials&limit=1');
  return rows?.[0]?.credentials ? unseal(rows[0].credentials, 'user:' + id) : null;
}
async function store(id, data) {
  await adminRequest(TABLE + '?on_conflict=user_id', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({user_id: id, credentials: seal(data, 'user:' + id), updated_at: new Date().toISOString()})});
}
function returnToApp(res, result) {
  res.setHeader('Location', origin() + '/mi-espacio.html?drive=' + result);
  return res.status(303).end();
}
async function callback(req, res) {
  setCookie(res, '', 0);
  try {
    const pending = unseal(cookie(req), 'oauth');
    if (!pending.uid || !pending.state || pending.exp < Date.now() || typeof req.query.state !== 'string' || req.query.state !== pending.state) throw new Error('INVALID_STATE');
    if (!pilotAllowed(pending)) throw new Error('DRIVE_PILOT_ONLY');
    if (req.query.error) return returnToApp(res, 'cancelled');
    if (typeof req.query.code !== 'string' || req.query.code.length > 4096) throw new Error('INVALID_CODE');
    const oauth = client(), {tokens} = await oauth.getToken({code: req.query.code, codeVerifier: pending.verifier});
    const expected = pending.browse && browseEnabled() ? [SCOPE,BROWSE_SCOPE] : [SCOPE];
    const scopes = [...new Set(String(tokens.scope || '').trim().split(/\s+/).filter(Boolean))];
    if (!tokens.access_token || !tokens.refresh_token || scopes.length !== expected.length || expected.some(scope => !scopes.includes(scope))) throw new Error('INCOMPLETE_CONSENT');
    // The Google grant is bound to the Estudiemos account that started this flow.
    await store(pending.uid, {refreshToken: tokens.refresh_token, accessToken: tokens.access_token, expiresAt: tokens.expiry_date || 0, scopes});
    return returnToApp(res, 'connected');
  } catch (_) { return returnToApp(res, 'error'); }
}

module.exports = async function googleDrive(req, res) {
  setSecurityHeaders(res);
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({message:'M\u00e9todo no permitido.'});
  const action = req.query?.drive;
  if (!['config','start','callback','status','token','disconnect'].includes(action)) return res.status(400).json({message:'Acci\u00f3n no v\u00e1lida.'});
  if (!(await enforceRateLimit(req, res, {route:'google-drive:' + action, limit:action==='token'?30:20, windowSeconds:60}))) return;
  if (action === 'config' && req.method === 'GET') {
    const ready = configured();
    const user = ready && pilotEmails().length ? await authenticateBearer(req.headers.authorization) : null;
    const enabled = ready && pilotAllowed(user);
    return res.status(200).json({enabled,...(enabled && browseEnabled() ? {browseEnabled:true} : {})});
  }
  if (!configured()) return res.status(503).json({code:'DRIVE_NOT_CONFIGURED', message:'La conexi\u00f3n con Google Drive todav\u00eda no est\u00e1 habilitada.'});
  if (action === 'callback' && req.method === 'GET') return callback(req, res);
  if (action === 'callback' || (['start','token','disconnect'].includes(action) && req.method !== 'POST')) return res.status(405).json({message:'M\u00e9todo no permitido.'});
  if (!isSameOriginRequest(req) || (req.method === 'POST' && req.headers.origin !== origin())) return res.status(403).json({message:'Origen no permitido.'});
  if (rejectOversizedBody(req,res,2048) || (req.method==='POST' && !requireJsonRequest(req,res))) return;
  const user = await authenticateBearer(req.headers.authorization);
  if (!user?.id) return res.status(401).json({code:'AUTH_REQUIRED',message:'Ingres\u00e1 a Estudiemos para conectar tu Drive.'});
  if (action !== 'disconnect' && !pilotAllowed(user)) return res.status(403).json({code:'DRIVE_PILOT_ONLY',message:'La conexi\u00f3n con Drive est\u00e1 en preparaci\u00f3n.'});
  try {
    if (action === 'start') {
      const state = crypto.randomBytes(32).toString('base64url');
      const oauth = client(), codes = await oauth.generateCodeVerifierAsync();
      const browse = req.body?.browse === true && browseEnabled();
      setCookie(res, seal({uid:user.id, email:user.email, email_confirmed_at:user.email_confirmed_at, state, verifier:codes.codeVerifier, exp:Date.now()+600000, browse}, 'oauth'), 600);
      const url = oauth.generateAuthUrl({scope:browse ? [SCOPE,BROWSE_SCOPE] : [SCOPE], access_type:'offline', prompt:'consent select_account', include_granted_scopes:false, state, code_challenge:codes.codeChallenge, code_challenge_method:'S256'});
      return res.status(200).json({url});
    }
    const saved = await record(user.id);
    if (action === 'status') return res.status(200).json({connected:Boolean(saved?.refreshToken),browse:hasBrowse(saved)});
    if (action === 'disconnect') {
      setCookie(res, '', 0);
      await adminRequest(pathFor(user.id), {method:'DELETE', headers:{Prefer:'return=minimal'}});
      if (saved?.refreshToken) { try { await client().revokeToken(saved.refreshToken); } catch (_) {} }
      return res.status(200).json({connected:false});
    }
    if (!saved?.refreshToken) return res.status(409).json({code:'DRIVE_CONNECT_REQUIRED',message:'Conect\u00e1 tu Google Drive para abrir Mi espacio.'});
    if (req.body?.force === true || !saved.accessToken || saved.expiresAt < Date.now()+120000) {
      const oauth = client(); oauth.setCredentials({refresh_token:saved.refreshToken});
      let result;
      try { result = await oauth.refreshAccessToken(); }
      catch (error) {
        if (error.response?.data?.error === 'invalid_grant') return res.status(409).json({code:'DRIVE_CONNECT_REQUIRED',message:'Google pide que vuelvas a conectar tu cuenta.'});
        throw error;
      }
      const tokens = result.credentials;
      if (typeof tokens.access_token !== 'string' || !tokens.access_token || !Number.isFinite(tokens.expiry_date)) throw new Error('INVALID_TOKEN_RESPONSE');
      saved.accessToken = tokens.access_token; saved.expiresAt = tokens.expiry_date || 0;
      if (tokens.refresh_token) saved.refreshToken = tokens.refresh_token;
      await store(user.id, saved);
    }
    return res.status(200).json({accessToken:saved.accessToken, expiresAt:saved.expiresAt});
  } catch (_) { return res.status(503).json({code:'DRIVE_UNAVAILABLE',message:'No pudimos conectar con Drive. Intent\u00e1 nuevamente en un momento.'}); }
};
