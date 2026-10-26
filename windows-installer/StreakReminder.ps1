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
    . (Join-Path $PSScriptRoot 'ReadLocalAlarms.ps1')
    $snapshot = Read-EstudiemosLocalAlarms -StateDirectory $StateDirectory
    if ($snapshot.version -eq 1) { $study = $snapshot.study }
  }
} catch {
  # Offline or disconnected accounts cannot confirm that their goal is still pending.
  $study = $null
}
$minutes = 0
$goal = 25
$configured = $false
if ($study -and $study.date -eq $today -and $study.configured -eq $true -and
    [string]$study.minutes -match '^\d{1,4}$' -and [string]$study.goalMinutes -match '^\d{1,3}$') {
  $minutes = [int]$study.minutes
  $goal = [int]$study.goalMinutes
  $configured = $minutes -le 1440 -and $goal -ge 1 -and $goal -le 720
}
$minuteOfDay = $Now.Hour * 60 + $Now.Minute
$slot = @('12:00', '14:30', '17:00', '19:30', '22:00') | Where-Object {
  $time = [datetime]::ParseExact($_, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
  $start = $time.Hour * 60 + $time.Minute
  $minuteOfDay -ge $start -and $minuteOfDay -lt ($start + 5)
} | Select-Object -First 1
$wouldNotify = $configured -and $minutes -lt $goal -and !!$slot
if ($DryRun) {
  @{minutes=$minutes;goalMinutes=$goal;configured=$configured;wouldNotify=$wouldNotify} | ConvertTo-Json -Compress
  return
}
. (Join-Path $PSScriptRoot 'StudyToast.ps1')
if ($configured -and $minutes -ge $goal) {
  Clear-EstudiemosStudyToast
} elseif ($wouldNotify) {
  # One delivery per local day/slot/connection, including retries or duplicated tasks.
  $mutex = New-Object Threading.Mutex($false, ('Local\EstudiemosStudyReminder-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
  if (!$mutex.WaitOne(0)) { $mutex.Dispose(); return }
  try {
    New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
    $path = Join-Path $StateDirectory 'study-reminders.json'
    $history = @{}
    if (Test-Path -LiteralPath $path) {
      $saved = Get-Content -LiteralPath $path -Raw -Encoding UTF8
      if ($saved.Length -le 32000) {
        (ConvertFrom-Json $saved).PSObject.Properties | Where-Object { $_.Name -ge $Now.AddDays(-2).ToString('yyyy-MM-dd') } | ForEach-Object { $history[$_.Name] = $_.Value }
      }
    }
    $connection = if (Test-Path -LiteralPath (Join-Path $StateDirectory 'local-config.json')) { (Get-FileHash -LiteralPath (Join-Path $StateDirectory 'local-config.json') -Algorithm SHA256).Hash } else { 'local' }
    $key = $today + '|' + $slot + '|' + $connection
    if (!$history.ContainsKey($key)) {
      Show-EstudiemosToast -Title 'Momento de estudiar' -Body ('Te faltan {0} min para completar tu objetivo de hoy.' -f ($goal - $minutes))
      $history[$key] = $true
      $history | ConvertTo-Json -Compress | Set-Content -LiteralPath $path -Encoding UTF8
    }
  } finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
}

