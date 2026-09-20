param([Parameter(Mandatory=$true)][ValidateLength(1,2048)][ValidatePattern('^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')][string]$Token)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
$stage = 'conexion'
$result = Invoke-RestMethod -Uri ('https://estudiemos-app.vercel.app/api/widget-link?clientVersion=1.6.2&alarmSetup=' + $Token) -TimeoutSec 20
if (!$result.feedToken -or $result.snapshot.version -ne 1 -or !$result.confirmation) { throw 'Invalid alarm connection.' }
$directory = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$stage = 'programador'
& (Join-Path $PSScriptRoot 'InstallInboxAlarm.ps1')
if (!$?) { throw 'Could not register alarm task.' }
# DPAPI binds the read-only alarm credential to this Windows user.
$stage = 'credencial'
$protected = ConvertTo-SecureString -String $result.feedToken -AsPlainText -Force | ConvertFrom-SecureString
[IO.File]::WriteAllText((Join-Path $directory 'feed.dpapi'), $protected)
$result.snapshot | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath (Join-Path $directory 'cloud.json') -Encoding UTF8
$state = @{connectedAt=(Get-Date).ToString('o');version='1.6.2';lastSync=(Get-Date).ToString('o');status='connected'}
$state | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $directory 'connection.json') -Encoding UTF8
Start-Process ('https://estudiemos-app.vercel.app/?windows-alarms-ready=' + $result.confirmation)
} catch {
  $status = 0
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  $stateDirectory = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'
  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
  @{status='activation-error';stage=$stage;httpStatus=$status;checkedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDirectory 'activation-status.json') -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  $message = if ($stage -eq 'programador') { 'Windows no pudo registrar la tarea de alarma. Reinstala el componente del paso 1 y vuelve a conectar.' } elseif ($status -eq 401) { 'El enlace de activacion vencio. Toca Conectar con Windows otra vez. No necesitas reinstalar.' } else { 'No se pudo completar la activacion (' + $stage + '). Comprueba Internet y toca Conectar con Windows otra vez.' }
  [void][Windows.Forms.MessageBox]::Show($message, 'Estudiemos: activacion pendiente', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Warning)
  exit 1
}
