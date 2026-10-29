const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Workers initializes the existing Drive module at startup instead of first request', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudflare/worker.mjs'), 'utf8');
  assert.match(source, /import ['"]\.\.\/api\/_lib\/google-drive\.js['"];[\s\S]*export default/);
  assert.doesNotMatch(source, /DRIVE_(?:TOKEN|REKEY|RECIPHER).*=/);
});

test('Drive startup initialization requires no credentials and performs no network requests', () => {
  const modulePath = require.resolve('../api/_lib/google-drive');
  const result = spawnSync(process.execPath, ['-e', `
    let networkRequests = 0;
    global.fetch = () => { networkRequests++; throw Error('Unexpected startup network'); };
    const handler = require(${JSON.stringify(modulePath)});
    if (typeof handler !== 'function' || networkRequests !== 0) process.exit(1);
    console.log(JSON.stringify({networkRequests, initialized: true}));
  `], {
    env: { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '' },
    windowsHide: true, encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.status, 0, 'Module startup must work without secrets or provider calls');
  assert.deepEqual(JSON.parse(result.stdout), { networkRequests: 0, initialized: true });
});
