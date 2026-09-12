param([Parameter(Mandatory=$true)][string]$ResourceDirectory)
$ErrorActionPreference = 'Stop'
$resource = [IO.Path]::GetFullPath($ResourceDirectory)
if (!(Test-Path -LiteralPath $resource -PathType Container)) { throw 'Widget resource directory not found.' }
@{resourceDirectory=$resource} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'InboxAlarmConfig.json') -Encoding UTF8
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
$task = $service.NewTask(0)
$task.RegistrationInfo.Description = 'Alarmas de tareas de Estudiemos. Solo en la sesion de este usuario; no usa la red ni credenciales.'
$task.Principal.UserId = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$task.Principal.LogonType = 3
$task.Principal.RunLevel = 0
$task.Settings.Enabled = $true
$task.Settings.StartWhenAvailable = $true
$task.Settings.DisallowStartIfOnBatteries = $false
$task.Settings.StopIfGoingOnBatteries = $false
$task.Settings.MultipleInstances = 2
$task.Settings.ExecutionTimeLimit = 'PT1M'
$trigger = $task.Triggers.Create(1)
$trigger.StartBoundary = (Get-Date).AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:ss')
$trigger.Repetition.Interval = 'PT1M'
$action = $task.Actions.Create(0)
$action.Path = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'InboxAlarm.ps1') + '"'
$name = 'Estudiemos Inbox ' + $task.Principal.UserId
$folder.RegisterTaskDefinition($name, $task, 6, $task.Principal.UserId, $null, 3) | Out-Null
