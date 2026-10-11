const fs = require('node:fs');
const path = require('node:path');
const { enforceRateLimit } = require('./request-security');

const template = fs.readFileSync(path.join(__dirname, '../../amistad.html'), 'utf8');
const origin = 'https://estudiemos-app.vercel.app';

module.exports = async function friendInvitation(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ message: 'M\u00e9todo no permitido.' });
  }
  const token = request.query?.friendInvitation;
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return response.status(404).json({ message: 'Invitaci\u00f3n no disponible.' });
  }
  // Public previews need no account lookup, credentials, or database calls.
  if (!(await enforceRateLimit(request, response, { route: 'friend-invitation', limit: 120, windowSeconds: 60, distributed: false }))) return;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
  const html = template.replace('__INVITATION_URL__', `${origin}/amistad/${token}`).replace('__FRIEND_TOKEN__', token);
  return response.status(200).send(request.method === 'HEAD' ? '' : html);
};
