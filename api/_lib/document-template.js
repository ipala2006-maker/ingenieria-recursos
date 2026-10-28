// Workers inject bundled text; Vercel keeps reading the same checked-in pages.
module.exports = function documentTemplate(request, name) {
  if (!['instalar.html', 'amistad.html'].includes(name)) throw new Error('INVALID_TEMPLATE');
  if (typeof request.templates?.[name] === 'string') return request.templates[name];
  return require('node:fs').readFileSync(require('node:path').join(__dirname, '../../', name), 'utf8');
};
