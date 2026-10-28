const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-cloudflare');
const config = require('../vercel.json');
const directories = new Set(['assets', 'data', 'downloads', 'pages', 'pdfs', 'scripts', 'shared', 'styles', 'widgets', '.well-known']);
const extensions = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.mp3', '.wav', '.mp4', '.webm', '.pdf', '.exe', '.apk', '.rmskin', '.txt', '.xml']);
const operationalScripts = new Set(['scripts/security-check.js', 'scripts/csp-check.js']);

function allowed(file) {
  if (file.includes('..') || operationalScripts.has(file)) return false;
  if (/(?:service-account|credentials|secrets|\.agekey|\.dump)/i.test(file)) return false;
  const parts = file.split('/');
  if (parts.length === 1) return /\.html$/.test(file) || ['service-worker.js', 'site.webmanifest', 'robots.txt', 'sitemap.xml'].includes(file);
  return directories.has(parts[0]) && !parts.some(part => part.startsWith('.') && part !== '.well-known') && extensions.has(path.extname(file));
}

function build() {
  // Only remove our fixed build directory, never a caller-supplied path.
  if (path.dirname(output) !== root || path.basename(output) !== 'dist-cloudflare') throw new Error('Unsafe output');
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Build output cannot be a symlink');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(allowed);
  for (const file of files) {
    const source = path.join(root, file), stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid public asset: ${file}`);
    if (stat.size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Workers Free file limit: ${file}`);
    fs.mkdirSync(path.dirname(path.join(output, file)), { recursive: true });
    fs.copyFileSync(source, path.join(output, file));
  }
  const rules = config.headers.map(rule => [rule.source === '/(.*)' ? '/*' : rule.source, ...rule.headers.map(header => `  ${header.key}: ${header.value}`)].join('\n')).join('\n\n');
  fs.writeFileSync(path.join(output, '_headers'), rules + '\n/service-worker.js\n  Cache-Control: no-cache\n/site.webmanifest\n  Cache-Control: no-cache\n');
  fs.writeFileSync(path.join(output, '_redirects'), '/index.html / 302\n');
  if (files.length > 19998) throw new Error('Too many static assets for Workers Free');
  console.log(JSON.stringify({ publicFiles: files.length + 2, output: 'dist-cloudflare', privateSourcePublished: false }));
}
if (require.main === module) build();
module.exports = { allowed, build };
