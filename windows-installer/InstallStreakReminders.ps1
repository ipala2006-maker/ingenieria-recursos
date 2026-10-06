$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'StreakReminder.ps1'
if (!(Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Streak reminder support file not found.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$ownUsers = @($user, $env:USERNAME, ($env:USERDOMAIN + '\' + $env:USERNAME))
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$root = $service.GetFolder('\')
try { $folder = $service.GetFolder('\Estudiemos') }
catch { $folder = $root.CreateFolder('Estudiemos') }
$hostPath = Join-Path $env:WINDIR 'System32\conhost.exe'
$powerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '--headless "' + $powerShell + '" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"'

foreach ($time in @('12:00', '14:30', '17:00', '19:30', '22:00')) {
  $legacyName = 'Racha ' + $time.Replace(':', '-')
  $name = $legacyName + ' ' + $user
  $task = $null
  # Migrate only our own reminders; keep their schedule and enabled preference.
  foreach ($candidate in @($legacyName, $name)) {
    try { $existing = $folder.GetTask($candidate).Definition } catch { continue }
    $ownScript = $existing.Actions.Count -eq 1 -and $existing.Actions.Item(1).Arguments.Contains('"' + $script + '"')
    if (!($ownUsers -contains $existing.Principal.UserId) -or !$ownScript) {
      if ($candidate -eq $name) { throw 'Refusing to replace an unrelated reminder task.' }
      continue
    }
    $task = $existing
    $name = $candidate
    break
  }
  if (!$task) {
    $task = $service.NewTask(0)
    $task.Principal.UserId = $user
    $task.Principal.LogonType = 3
    $task.Principal.RunLevel = 0
    $task.Settings.Enabled = $true
    $task.Settings.DisallowStartIfOnBatteries = $false
    $task.Settings.StopIfGoingOnBatteries = $false
    $trigger = $task.Triggers.Create(2)
    $trigger.StartBoundary = (Get-Date).ToString('yyyy-MM-dd') + 'T' + $time + ':00'
    $trigger.DaysInterval = 1
    $task.Actions.Create(0) | Out-Null
  }
  $task.RegistrationInfo.Description = 'Recordatorio de racha de Estudiemos. Se ejecuta sin consola en la sesion de su usuario.'
  $task.Settings.Hidden = $true
  $task.Settings.MultipleInstances = 2
  $task.Settings.ExecutionTimeLimit = 'PT1M'
  $action = $task.Actions.Item(1)
  $action.Path = $hostPath
  $action.Arguments = $arguments
  $action.WorkingDirectory = $PSScriptRoot
  $folder.RegisterTaskDefinition($name, $task, 6, $task.Principal.UserId, $null, 3) | Out-Null
  $registered = $folder.GetTask($name).Definition
  if ($registered.Actions.Item(1).Path -ne $hostPath -or $registered.Actions.Item(1).Arguments -ne $arguments) {
    throw 'Hidden reminder task verification failed.'
  }
}
