param([string]$ResourceDirectory = '')
$ErrorActionPreference = 'Stop'
$resource = ''
if ($ResourceDirectory) {
  $resource = [IO.Path]::GetFullPath($ResourceDirectory)
  if (!(Test-Path -LiteralPath $resource -PathType Container)) { throw 'Widget resource directory not found.' }
}
$alarmScript = Join-Path $PSScriptRoot 'InboxAlarm.ps1'
if (!(Test-Path -LiteralPath $alarmScript -PathType Leaf)) {
  throw 'Inbox alarm support files not found.'
}
if ($resource -or !(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'InboxAlarmConfig.json'))) {
  @{resourceDirectory=$resource} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'InboxAlarmConfig.json') -Encoding UTF8
}
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$task = $service.NewTask(0)
$task.RegistrationInfo.Description = 'Alarmas de Estudiemos en esta sesion de Windows. Con permiso del usuario consulta solo sus alarmas mediante una credencial cifrada por Windows.'
$task.Principal.UserId = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$task.Principal.LogonType = 3
$task.Principal.RunLevel = 0
$task.Settings.Enabled = $true
$task.Settings.Hidden = $true
$task.Settings.StartWhenAvailable = $true
$task.Settings.DisallowStartIfOnBatteries = $false
$task.Settings.StopIfGoingOnBatteries = $false
$task.Settings.MultipleInstances = 2
$task.Settings.ExecutionTimeLimit = 'PT6M'
$trigger = $task.Triggers.Create(1)
$trigger.StartBoundary = (Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')
$trigger.Repetition.Interval = 'PT1M'
$action = $task.Actions.Create(0)
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action.Path = Join-Path $env:WINDIR 'System32\conhost.exe'
$action.Arguments = '--headless "' + $powershell + '" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $alarmScript + '"'
$action.WorkingDirectory = $PSScriptRoot
$name = 'Estudiemos Inbox ' + $task.Principal.UserId
# Reuse the earlier task only when it belongs to this user and runs our alarm.
try {
  $legacyName = 'Estudiemos Inbox ' + $env:USERNAME
  $legacy = $folder.GetTask($legacyName).Definition
  $legacyAction = $legacy.Actions.Item(1)
  $knownScript = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarm.ps1'
  $knownService = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\AlarmService\InboxAlarm.ps1'
  $ownUser = @($task.Principal.UserId, $env:USERNAME, ($env:USERDOMAIN + '\' + $env:USERNAME)) -contains $legacy.Principal.UserId
  if ($ownUser -and ($legacyAction.Arguments.Contains('"' + $knownScript + '"') -or $legacyAction.Arguments.Contains('"' + $knownService + '"'))) { $name = $legacyName }
} catch { }
$folder.RegisterTaskDefinition($name, $task, 6, $task.Principal.UserId, $null, 3) | Out-Null
$registered = $folder.GetTask($name)
if (!$registered.Enabled -or $registered.Definition.Actions.Item(1).Arguments -ne $action.Arguments) { throw 'Alarm task verification failed.' }
