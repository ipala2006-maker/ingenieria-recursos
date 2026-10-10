param(
  [switch]$DryRun,
  [string]$InputPath,
  [datetime]$Now = (Get-Date),
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms')
)
$ErrorActionPreference = 'Stop'
$study = $null
$today = $Now.ToString('yyyy-MM-dd')
try {
  if ($InputPath) {
    $snapshot = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $study = $snapshot.study
  } elseif (!$DryRun) {
    $feedPath = Join-Path $StateDirectory 'feed.dpapi'
    if (Test-Path -LiteralPath $feedPath) {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
      $secure = Get-Content -LiteralPath $feedPath -Raw | ConvertTo-SecureString
      $credential = New-Object Management.Automation.PSCredential('alarm-feed', $secure)
      $snapshot = Invoke-RestMethod -Uri ('https://estudiemos-app.vercel.app/api/widget-link?alarmFeed=1&localDate=' + $today) -Headers @{Authorization=('Bearer ' + $credential.GetNetworkCredential().Password)} -TimeoutSec 12
      if ($snapshot.version -eq 1) { $study = $snapshot.study }
    }
  }
} catch {
  # Offline or disconnected accounts cannot confirm that their goal is still pending.
  $study = $null
} finally { $credential = $null; $secure = $null }
$minutes = 0
$goal = 25
$configured = $false
if ($study -and $study.date -eq $today -and $study.configured -eq $true -and
    [string]$study.minutes -match '^\d{1,4}$' -and [string]$study.goalMinutes -match '^\d{1,3}$') {
  $minutes = [int]$study.minutes
  $goal = [int]$study.goalMinutes
  $configured = $minutes -le 1440 -and $goal -ge 1 -and $goal -le 720
}
$wouldNotify = $configured -and $minutes -lt $goal
if ($DryRun) {
  @{minutes=$minutes;goalMinutes=$goal;configured=$configured;wouldNotify=$wouldNotify} | ConvertTo-Json -Compress
  return
}
. (Join-Path $PSScriptRoot 'StudyToast.ps1')
if ($configured -and $minutes -ge $goal) {
  Clear-EstudiemosStudyToast
} elseif ($wouldNotify) {
  Show-EstudiemosToast -Title 'Momento de estudiar' -Body ('Te faltan {0} min para completar tu objetivo de hoy.' -f ($goal - $minutes))
}

