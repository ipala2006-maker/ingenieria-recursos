param(
  [string]$InputPath,
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'),
  [datetime]$Now = (Get-Date),
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
if (!$InputPath) {
  $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'InboxAlarmConfig.json') -Raw | ConvertFrom-Json
  $InputPath = Join-Path $config.resourceDirectory 'InboxAlarms.inc'
}
if (!(Test-Path -LiteralPath $InputPath)) { exit 0 }
# Rainmeter transports only base64 data, never commands or interpolated script code.
$content = Get-Content -LiteralPath $InputPath -Raw
if ($content.Length -gt 620000) { throw 'Alarm snapshot too large.' }
$countMatch = [regex]::Match($content, '(?m)^Count=(\d+)\s*$')
if (!$countMatch.Success) { exit 0 }
$count = [int]$countMatch.Groups[1].Value
if ($count -eq 0) { exit 0 }
if ($count -gt 200) { throw 'Invalid chunk count.' }
$encoded = ''
for ($i = 0; $i -lt $count; $i++) {
  $chunk = [regex]::Match($content, "(?m)^Chunk${i}=([A-Za-z0-9+/=]{1,3000})\s*$")
  if (!$chunk.Success) { exit 0 }
  $encoded += $chunk.Groups[1].Value
}
if ($content -ne (Get-Content -LiteralPath $InputPath -Raw)) { exit 0 }
$snapshot = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
if ($snapshot.version -ne 1 -or @($snapshot.items).Count -gt 500) { throw 'Invalid alarm snapshot.' }
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$mutex = New-Object Threading.Mutex($false, ('Local\EstudiemosInboxAlarm-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
if (!$mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
try {
  $statePath = Join-Path $StateDirectory 'delivered.json'
  $delivered = @{}
  if (Test-Path -LiteralPath $statePath) {
    $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    foreach ($p in $saved.PSObject.Properties) { if ([long]$p.Value -gt $Now.AddDays(-14).Ticks) { $delivered[$p.Name] = [long]$p.Value } }
  }
  $due = @()
  foreach ($item in @($snapshot.items)) {
    $a = $item.alarm
    if (!$a -or !$a.windows -or $item.done -or !($item.id -is [string]) -or $item.id.Length -gt 180) { continue }
    if ($a.date -notmatch '^\d{4}-\d{2}-\d{2}$' -or $a.time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { continue }
    if ($a.repeat -notin @('none','daily','weekdays','weekly','monthly')) { continue }
    $start = [datetime]::MinValue
    if (![datetime]::TryParseExact($a.date, 'yyyy-MM-dd', $culture, [Globalization.DateTimeStyles]::None, [ref]$start)) { continue }
    if ($start.Year -lt 2020 -or $start.Year -gt 2100) { continue }
    foreach ($day in @($Now.Date.AddDays(-1), $Now.Date)) {
      if ($day -lt $start) { continue }
      if ($a.repeat -eq 'none' -and $day -ne $start) { continue }
      if ($a.repeat -eq 'weekdays' -and $day.DayOfWeek -in @('Saturday','Sunday')) { continue }
      if ($a.repeat -eq 'weekly' -and $day.DayOfWeek -ne $start.DayOfWeek) { continue }
      if ($a.repeat -eq 'monthly' -and $day.Day -ne $start.Day) { continue }
      $at = $day.AddHours([int]$a.time.Substring(0,2)).AddMinutes([int]$a.time.Substring(3,2))
      # Match the web clock when daylight saving skips this wall-clock time.
      if ([TimeZoneInfo]::Local.IsInvalidTime($at)) { $at = $at.AddHours(1) }
      if ($at -gt $Now -or $at -le $Now.AddMinutes(-10)) { continue }
      $key = $item.id + '|' + $day.ToString('yyyy-MM-dd') + '|' + $a.time
      if ($delivered.ContainsKey($key)) { continue }
      $due += [pscustomobject]@{ id=$item.id; title=([string]$item.title).Substring(0,[Math]::Min(90,([string]$item.title).Length)); key=$key }
    }
  }
  if ($DryRun) { ConvertTo-Json -InputObject @($due) -Compress; exit 0 }
  if (!$due.Count) { exit 0 }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $notice = New-Object Windows.Forms.NotifyIcon
  $notice.Icon = [Drawing.SystemIcons]::Information
  $notice.Visible = $true
  $notice.BalloonTipTitle = 'Estudiemos - Alarma de Inbox'
  $notice.BalloonTipText = (@($due | Select-Object -First 4 | ForEach-Object { $_.title }) -join "`n")
  $notice.add_BalloonTipClicked({ Start-Process 'https://estudiemos-app.vercel.app/?agenda=1' })
  $notice.ShowBalloonTip(20000)
  foreach ($item in $due) { $delivered[$item.key] = $Now.Ticks }
  $temp = Join-Path $StateDirectory 'delivered.tmp'
  $delivered | ConvertTo-Json -Compress | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $statePath -Force
  $soundFile = Join-Path $env:WINDIR 'Media\Alarm01.wav'
  $player = $null
  if (Test-Path -LiteralPath $soundFile) { $player = New-Object System.Media.SoundPlayer($soundFile); $player.Play() }
  else { [System.Media.SystemSounds]::Exclamation.Play() }
  $until = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $until) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
  if ($player) { $player.Dispose() }
  $notice.Dispose()
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
