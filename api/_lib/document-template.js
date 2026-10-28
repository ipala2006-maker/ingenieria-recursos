// Workers inject bundled text; Vercel keeps reading the same checked-in pages.
const cache = new Map();
module.exports = function documentTemplate(request, name) {
  if (!['instalar.html', 'amistad.html'].includes(name)) throw new Error('INVALID_TEMPLATE');
  if (typeof request.templates?.[name] === 'string') return request.templates[name];
  if (!cache.has(name)) cache.set(name, require('node:fs').readFileSync(require('node:path').join(__dirname, '../../', name), 'utf8'));
  return cache.get(name);
};
