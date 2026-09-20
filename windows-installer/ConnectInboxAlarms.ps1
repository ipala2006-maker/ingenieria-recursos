param([Parameter(Mandatory=$true)][ValidateLength(1,2048)][ValidatePattern('^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')][string]$Token)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
$result = Invoke-RestMethod -Uri ('https://estudiemos-app.vercel.app/api/widget-link?alarmSetup=' + $Token) -TimeoutSec 20
if (!$result.feedToken -or $result.snapshot.version -ne 1 -or !$result.confirmation) { throw 'Invalid alarm connection.' }
$directory = Join-Path $PSScriptRoot 'InboxAlarms'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'InboxAlarmConfig.json') -Raw | ConvertFrom-Json
& (Join-Path $PSScriptRoot 'InstallInboxAlarm.ps1') -ResourceDirectory $config.resourceDirectory
if (!$?) { throw 'Could not register alarm task.' }
# DPAPI binds the read-only alarm credential to this Windows user.
$protected = ConvertTo-SecureString -String $result.feedToken -AsPlainText -Force | ConvertFrom-SecureString
[IO.File]::WriteAllText((Join-Path $directory 'feed.dpapi'), $protected)
$result.snapshot | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath (Join-Path $directory 'cloud.json') -Encoding UTF8
$state = @{connectedAt=(Get-Date).ToString('o');version='1.6.0';lastSync=(Get-Date).ToString('o');status='connected'}
$state | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $directory 'connection.json') -Encoding UTF8
Start-Process ('https://estudiemos-app.vercel.app/?windows-alarms-ready=' + $result.confirmation)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [void][Windows.Forms.MessageBox]::Show('No se pudo conectar la alarma. Comproba tu conexion y volve a tocar Conectar alarmas con Windows dentro de Estudiemos. Si persiste, actualiza el soporte de Windows desde la pagina de instalacion.', 'Estudiemos: conexion pendiente', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Warning)
  exit 1
}
