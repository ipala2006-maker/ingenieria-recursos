const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { build } = require('./build-cloudflare.cjs');
const ROOT = path.resolve(__dirname, '..');

function commands(dryRun = false) {
  if (typeof dryRun !== 'boolean') throw new Error('INVALID_DEPLOY_MODE');
  return ['wrangler.jsonc', 'wrangler.frontdoor.jsonc'].map((config, index) => [
    path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', config,
    ...(dryRun ? ['--dry-run', '--outdir', path.join(ROOT, 'tmp', index ? 'cloudflare-frontdoor-bundle' : 'cloudflare-bundle')] : [])
  ]);
}
function deploy({ dryRun = false, run = execFileSync, buildAssets = build } = {}) {
  const plan = commands(dryRun);
  buildAssets();
  for (const args of plan) run(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: 'inherit' });
}
if (require.main === module) {
  if (process.argv.length > 3 || (process.argv.length === 3 && process.argv[2] !== '--dry-run')) throw new Error('Use only --dry-run or no arguments.');
  deploy({ dryRun: process.argv[2] === '--dry-run' });
}
module.exports = { commands, deploy };
