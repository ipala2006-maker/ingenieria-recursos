param(
  [Parameter(Mandatory=$true,ParameterSetName='Token')][ValidateLength(1,2048)][ValidatePattern('^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')][string]$Token,
  [Parameter(Mandatory=$true,ParameterSetName='File')][string]$ConnectionFile,
  [string]$DocumentsDirectory = ([Environment]::GetFolderPath('MyDocuments'))
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
$stage = 'componente-cifrado'
# Shell-launched processes can inherit a module path without Windows PowerShell modules.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$stage = 'archivo'
if ($ConnectionFile) {
  . (Join-Path $PSScriptRoot 'ReadAlarmConnection.ps1')
  $Token = Read-AlarmConnectionToken -Path $ConnectionFile
}
$stage = 'conexion'
$result = Invoke-RestMethod -Uri ('https://estudiemos-app.vercel.app/api/widget-link?clientVersion=2.0.0&alarmSetup=' + $Token) -TimeoutSec 20
if ($result.userId -notmatch '^[a-f0-9-]{36}$' -or $result.snapshot.version -ne 1 -or !$result.confirmation -or @($result.snapshot.items).Count -gt 500) { throw 'Invalid alarm connection.' }
$directory = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$stage = 'programador'
$resource = ''
$widgetConfig = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarmConfig.json'
if ((Test-Path -LiteralPath $widgetConfig) -and (Get-Item -LiteralPath $widgetConfig).Length -le 4096) {
  try {
    $candidate = (Get-Content -LiteralPath $widgetConfig -Raw | ConvertFrom-Json).resourceDirectory
    if ($candidate -match '^[A-Za-z]:\\' -and (Test-Path -LiteralPath $candidate -PathType Container)) { $resource = $candidate }
  } catch { }
}
& (Join-Path $PSScriptRoot 'InstallInboxAlarm.ps1') -ResourceDirectory $resource
if (!$?) { throw 'Could not register alarm task.' }
$stage = 'programacion-guardado'
if ($DocumentsDirectory -notmatch '^[A-Za-z]:\\') { throw 'A local Documents directory is required.' }
$documents = Join-Path $DocumentsDirectory 'Estudiemos'
New-Item -ItemType Directory -Path $documents -Force | Out-Null
$path = Join-Path $documents ('Alarmas-' + $result.userId + '.estudiemos-local')
$device = [guid]::NewGuid().ToString()
@{version=2;kind='estudiemos-local-alarms';owner=$result.userId;deviceId=$device;items=@($result.snapshot.items);study=$result.snapshot.study} |
  ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath $path -Encoding UTF8
@{path=$path;owner=$result.userId;deviceId=$device} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $directory 'local-config.json') -Encoding UTF8
# The new background runner no longer needs a credential for the server.
if (Test-Path -LiteralPath (Join-Path $directory 'feed.dpapi')) { Remove-Item -LiteralPath (Join-Path $directory 'feed.dpapi') }
foreach ($rainmeter in @((Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\Rainmeter\Rainmeter.exe'),(Join-Path $env:ProgramFiles 'Rainmeter\Rainmeter.exe'))) {
  if (Test-Path -LiteralPath $rainmeter) { Start-Process -FilePath $rainmeter -ArgumentList '!DeactivateConfig "Estudiemos\AlarmBridge"' -WindowStyle Hidden }
}
$state = @{connectedAt=(Get-Date).ToString('o');version='2.0.0';lastSync=(Get-Date).ToString('o');status='local'}
$state | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $directory 'connection.json') -Encoding UTF8
$stage = 'confirmacion'
Start-Process ('https://estudiemos-app.vercel.app/?windows-alarms-ready=' + $result.confirmation)
@{status='connected';stage='complete';checkedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'activation-status.json') -Encoding UTF8
} catch {
  $status = 0
  if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
  $stateDirectory = Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'
  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
  @{status='activation-error';stage=$stage;httpStatus=$status;errorType=$_.Exception.GetType().FullName;errorCode=$_.Exception.HResult;line=$_.InvocationInfo.ScriptLineNumber;checkedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDirectory 'activation-status.json') -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  $message = if ($stage -eq 'archivo') { 'El archivo de conexion no es valido. Genera uno nuevo desde Estudiemos. No necesitas reinstalar.' } elseif ($stage -eq 'programador') { 'Windows no pudo registrar la tarea de alarma. Reinstala el componente del paso 1 y vuelve a conectar.' } elseif ($status -eq 401) { 'La conexion vencio. Genera otro enlace o archivo desde Estudiemos. No necesitas reinstalar.' } else { 'No se pudo completar la activacion (' + $stage + '). Comprueba Internet y vuelve a conectar desde Estudiemos.' }
  [void][Windows.Forms.MessageBox]::Show($message, 'Estudiemos: activacion pendiente', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Warning)
  exit 1
}
