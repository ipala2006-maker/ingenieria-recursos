const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const release = require('../shared/release');
const root = path.resolve(__dirname, '..');

test('free launch flags are disabled for everyone and cannot be changed as preferences', () => {
  assert.equal(release.enabled('workspace'), false);
  assert.equal(release.enabled('ai'), false);
  assert.ok(Object.isFrozen(release.features));
});

for (const route of ['agenda-ai', 'assistant-router', 'workspace-ai']) {
  test(`${route} returns coming soon without network, quota or model calls`, async () => {
    const file = path.join(root, 'api', route + '.js');
    const localRequire = createRequire(file);
    const unexpected = () => { throw new Error('Disabled feature must not make external calls'); };
    const sandbox = {module:{exports:{}}, process:{env:{}}, fetch:unexpected, require(name) {
      if (name === './_lib/plan-access') return {consumePlanAction:unexpected, getAuthenticatedPlan:unexpected};
      if (name === './_lib/request-security') return {setSecurityHeaders(){}, enforceRateLimit:unexpected};
      return localRequire(name);
    }};
    vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
    const result = {};
    const response = {setHeader(){},status(code){result.status=code;return this;},json(body){result.body=body;return this;}};
    await sandbox.module.exports({method:'POST',body:{instruction:'test'},headers:{}},response);
    assert.equal(result.status,503);
    assert.equal(result.body.code,'FEATURE_COMING_SOON');
  });
}

test('workspace launch gate runs before initialization or event listeners', () => {
  const source=fs.readFileSync(path.join(root,'scripts/workspace.js'),'utf8');
  assert.ok(source.indexOf("enabled('workspace')") < source.indexOf('initialize();'));
  assert.match(source,/Próximamente/);
  assert.match(source,/return;\s*}\s*const BUCKET/);
});

test('Android workspace widget is paused without erasing its stored entries', () => {
  const base=path.join(root,'android-app/app/src/main/java/com/estudiemos/app');
  assert.match(fs.readFileSync(path.join(base,'ReleaseFeatures.java'),'utf8'),/WORKSPACE = false/);
  const widget=fs.readFileSync(path.join(base,'WorkspaceWidgetProvider.java'),'utf8');
  assert.match(widget,/if \(!ReleaseFeatures.WORKSPACE\) return entries/);
  assert.match(widget,/workspace_widget_empty, "Próximamente"/);
});
