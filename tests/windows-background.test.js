const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all Windows reminder registration avoids direct console processes', () => {
  const installer = read('windows-installer/Estudiemos-Windows.iss');
  const tasks = read('windows-installer/InstallStreakReminders.ps1');
  assert.doesNotMatch(installer, /TaskCommand|schtasks\.exe|Exec\(ExpandConstant\('\{sys\}\\WindowsPowerShell/);
  assert.match(installer, /Source: "InstallStreakReminders\.ps1"/);
  assert.match(installer, /--headless.+InstallStreakReminders\.ps1/);
  assert.match(tasks, /Settings\.Hidden = \$true/);
  assert.match(tasks, /System32\\conhost\.exe/);
  assert.match(tasks, /--headless.+-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden/);
  assert.match(tasks, /ownUsers -contains \$existing\.Principal\.UserId/);
  assert.match(tasks, /Refusing to replace an unrelated/);
  assert.doesNotMatch(tasks, /Remove-ScheduledTask|DeleteTask|Stop-Process|RunLevel = 1/);
});

test('alarm and widget protocol launchers use headless mode while preserving scoped actions', () => {
  for (const file of ['AlarmLauncher.vbs', 'WidgetLauncher.vbs']) {
    const source = read(`windows-installer/${file}`);
    assert.match(source, /\\System32\\conhost\.exe/);
    assert.match(source, /--headless/);
    assert.match(source, /-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden/);
    assert.doesNotMatch(source, /NoExit|cmd\.exe|cmd \/[ck]/i);
  }
  assert.match(read('windows-installer/AlarmLauncher.vbs'), /expression\.Pattern = "\^\[A-Za-z0-9_/);
  assert.match(read('windows-installer/WidgetLauncher.vbs'), /If Not IsSafeLinkToken\(linkToken\)/);
});

test('streak task migration is idempotent, keeps preferences and leaves other users alone', { skip: process.platform !== 'win32' }, () => {
  for (const scenario of ['new', 'legacy', 'foreign', 'collision']) {
    const p = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'helpers/native-streak-tasks.ps1'), '-Scenario', scenario], { encoding: 'utf8', windowsHide: true });
    assert.equal(p.status, 0, p.stderr);
    const result = JSON.parse(p.stdout);
    if (scenario === 'collision') {
      assert.equal(result.rejected, true);
      assert.equal(result.registrations, 0);
      assert.equal(result.tasks.length, 1);
      assert.match(result.tasks[0].arguments, /unrelated/);
      continue;
    }
    assert.equal(result.registrations, 10, scenario);
    const own = result.tasks.filter(t => t.hidden);
    assert.equal(own.length, 5, scenario);
    assert.equal(result.tasks.length, scenario === 'foreign' ? 6 : 5);
    for (const task of own) {
      assert.match(task.path, /\\System32\\conhost\.exe$/i);
      assert.match(task.arguments, /^--headless ".+powershell\.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden.+-File ".+StreakReminder\.ps1"$/);
      assert.equal(task.limit, 'PT1M');
      assert.equal(task.triggers.length, 1);
    }
    if (scenario === 'legacy') {
      const migrated = own.find(t => t.name === 'Racha 12-00');
      assert.equal(migrated.enabled, false);
      assert.equal(migrated.triggers[0].StartBoundary, '2026-01-01T12:15:00');
      assert.equal(migrated.triggers[0].DaysInterval, 2);
    }
    if (scenario === 'foreign') {
      const untouched = result.tasks.find(t => t.name === 'Racha 12-00');
      assert.equal(untouched.hidden, false);
      assert.equal(untouched.path, 'powershell.exe');
      assert.equal(untouched.enabled, false);
    }
  }
});

test('reminder dry run does not open a notification or change alarm settings', { skip: process.platform !== 'win32' }, () => {
  const p = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'windows-installer/StreakReminder.ps1'), '-DryRun'], { encoding: 'utf8', windowsHide: true });
  assert.equal(p.status, 0, p.stderr);
  const result = JSON.parse(p.stdout);
  assert.equal(typeof result.wouldNotify, 'boolean');
  assert.ok(Number.isInteger(result.minutes));
});

test('real Script Host protocol launches produce no console and run only pilot helpers', { skip: process.platform !== 'win32' }, async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (const [launcher, request, component] of [
    ['AlarmLauncher.vbs', 'estudiemos-alarms://test', 'InboxAlarm.ps1'],
    ['WidgetLauncher.vbs', 'estudiemos-widgets://alarms?link=pilot.signature-testing', 'ConnectInboxAlarms.ps1']
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudiemos-console-probe-'));
    try {
      fs.copyFileSync(path.join(root, 'windows-installer', launcher), path.join(dir, launcher));
      fs.copyFileSync(path.join(__dirname, 'helpers/native-protocol-probe.ps1'), path.join(dir, component));
      fs.copyFileSync(path.join(__dirname, 'helpers/windows-background-probe.ps1'), path.join(dir, 'windows-background-probe.ps1'));
      const result = spawnSync('cscript.exe', ['//nologo', path.join(dir, launcher), request], { encoding: 'utf8', windowsHide: true, timeout: 10000, env: { ...process.env, LOCALAPPDATA: dir } });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const output = path.join(dir, 'probe-result.json');
      const deadline = Date.now() + 15000;
      while (!fs.existsSync(output) && Date.now() < deadline) await pause(100);
      assert.ok(fs.existsSync(output), `${launcher}: helper did not run`);
      await pause(100);
      const probe = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.equal(probe.consoleVisible, false, launcher);
      assert.equal(probe.mainWindowVisible, false, launcher);
      await pause(3300);
    } finally {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
      assert.match(path.basename(dir), /^estudiemos-console-probe-/);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
