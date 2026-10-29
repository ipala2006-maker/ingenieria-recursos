const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const rules = require('../shared/classrooms');
const root = path.resolve(__dirname, '..');
const origin = 'https://estudiemos.estudiemos-services.workers.dev';
const legacy = 'https://estudiemos-app.vercel.app';

test('new native clients and desktop skins select Cloudflare without replacing app identity', () => {
  const gradle = fs.readFileSync(path.join(root, 'android-app/app/build.gradle'), 'utf8');
  assert.ok(gradle.includes("getOrElse('" + origin + "')"));
  assert.match(gradle, /applicationId "com.estudiemos.app"/);
  const launcher = fs.readFileSync(path.join(root, 'windows-installer/AppLauncher.vbs'), 'utf8');
  assert.ok(launcher.includes(origin + '/?windows-bundle=1'));
  for (const name of ['Calendario', 'Inbox', 'MiEspacio', 'Pomodoro', 'Racha']) {
    const skin = fs.readFileSync(path.join(root, 'windows-rainmeter/Skins/Estudiemos', name, name + '.ini'), 'utf8');
    assert.ok(skin.includes(origin), name + ' uses the new hosting');
    assert.ok(!skin.includes(legacy));
  }
});

test('course codes work in both directions between old and new official links', () => {
  const code = 'ABCDEFGHJK';
  assert.equal(rules.invitation(origin + '/materia/' + code, legacy), code);
  assert.equal(rules.invitation(legacy + '/materia/' + code, origin), code);
  for (const url of [origin + '.evil.test/materia/' + code, 'https://attacker.test/materia/' + code,
    'https://user:pass@estudiemos.estudiemos-services.workers.dev/materia/' + code]) {
    assert.equal(rules.invitation(url, origin), '');
  }
});

test('Windows resolves setup recipients with a structured parser and an exact allowlist, never a redirect', { skip: process.platform !== 'win32' }, () => {
  const script = String.raw`
    $ErrorActionPreference='Stop'
    . $env:ALARM_READER
    $cases = $env:ALARM_CASES | ConvertFrom-Json
    foreach ($case in $cases) {
      $rejected = $false
      try { $actual = Get-AlarmConnectionOrigin -Token $case.token } catch { $rejected = $true }
      if ($case.reject) { if (!$rejected) { throw 'Untrusted origin accepted' } }
      elseif ($rejected -or $actual -cne $case.expected) { throw 'Wrong setup recipient' }
    }
    Write-Output 'exact-origin-allowlist-ok'
  `;
  const token = value => Buffer.from(JSON.stringify(value)).toString('base64url') + '.fixture';
  const cases = [{ token: token({ scope: 'alarm-setup' }), expected: legacy },
    ...[origin, legacy].map(value => ({ token: token({ origin: value }), expected: value })),
    ...[origin + '/', origin + '.evil.test', origin + ':443', 'http://localhost', 'https://attacker.test', null, {}]
      .map(value => ({ token: token({ origin: value }), reject: true })),
    { token: 'invalid.fixture', reject: true }];
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, ALARM_READER: path.join(root, 'windows-installer/ReadAlarmConnection.ps1'), ALARM_CASES: JSON.stringify(cases) }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /exact-origin-allowlist-ok/);
  const connector = fs.readFileSync(path.join(root, 'windows-installer/ConnectInboxAlarms.ps1'), 'utf8');
  assert.match(connector, /-MaximumRedirection 0/);
  assert.ok(connector.includes("$appOrigin + '/?windows-alarms-ready='"));
});

test('published canonical and install links no longer send new users back to Vercel', () => {
  for (const name of ['index.html', 'instalar.html', 'amistad.html', 'sitemap.xml']) {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    assert.ok(!content.includes(legacy), name);
    assert.ok(content.includes(origin), name);
  }
});

test('native diagnostics never acquire the named mutex used by live alarms', () => {
  const source=fs.readFileSync(path.join(root,'windows-installer/InboxAlarm.ps1'),'utf8');
  assert.match(source,/if \(\$DryRun\) \{\s*# Diagnostics[^\n]*\n\s*\$mutex = New-Object Threading\.Mutex\(\$false\)\s*\} else \{\s*\$mutex = New-Object Threading\.Mutex\(\$false, \('Local\\EstudiemosInboxAlarm-/);
});
