param(
  [string]$InputPath,
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'Estudiemos\Windows\InboxAlarms'),
  [datetime]$Now = (Get-Date),
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture

function Show-FullScreenInboxAlarm {
  param([Parameter(Mandatory=$true)][array]$DueItems)

  [Windows.Forms.Application]::EnableVisualStyles()
  $form = New-Object Windows.Forms.Form
  $form.Text = 'Alarma de Inbox - Estudiemos'
  $form.AccessibleName = 'Alarma de Inbox de Estudiemos'
  $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::None
  $form.StartPosition = [Windows.Forms.FormStartPosition]::Manual
  $form.Bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  $form.BackColor = [Drawing.ColorTranslator]::FromHtml('#0B1020')
  $form.ForeColor = [Drawing.Color]::White
  $form.TopMost = $true
  $form.ShowInTaskbar = $true
  $form.KeyPreview = $true

  $layout = New-Object Windows.Forms.TableLayoutPanel
  $layout.Dock = [Windows.Forms.DockStyle]::Fill
  $layout.Padding = New-Object Windows.Forms.Padding(48)
  $layout.ColumnCount = 1
  $layout.RowCount = 4
  $layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent, 18))) | Out-Null
  $layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent, 52))) | Out-Null
  $layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent, 12))) | Out-Null
  $layout.RowStyles.Add((New-Object Windows.Forms.RowStyle([Windows.Forms.SizeType]::Percent, 18))) | Out-Null

  $eyebrow = New-Object Windows.Forms.Label
  $eyebrow.Text = 'ESTUDIEMOS  |  ALARMA DE INBOX'
  $eyebrow.Dock = [Windows.Forms.DockStyle]::Fill
  $eyebrow.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
  $eyebrow.Font = New-Object Drawing.Font('Segoe UI Semibold', 18, [Drawing.FontStyle]::Bold)
  $eyebrow.ForeColor = [Drawing.ColorTranslator]::FromHtml('#8AB4FF')

  $titles = @($DueItems | Select-Object -First 4 | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_.title)) { 'Tarea pendiente' } else { $_.title }
  })
  if ($DueItems.Count -gt 4) { $titles += ('y {0} alarmas más' -f ($DueItems.Count - 4)) }
  $alarmName = New-Object Windows.Forms.Label
  $alarmName.Text = ($titles -join "`r`n")
  $alarmName.AccessibleName = 'Nombre de la alarma: ' + ($titles -join ', ')
  $alarmName.Dock = [Windows.Forms.DockStyle]::Fill
  $alarmName.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
  $alarmName.Font = New-Object Drawing.Font('Segoe UI', 38, [Drawing.FontStyle]::Bold)
  $alarmName.ForeColor = [Drawing.Color]::White
  $alarmName.AutoEllipsis = $true

  $timeLabel = New-Object Windows.Forms.Label
  $timeLabel.Text = (Get-Date).ToString('HH:mm')
  $timeLabel.Dock = [Windows.Forms.DockStyle]::Fill
  $timeLabel.TextAlign = [Drawing.ContentAlignment]::MiddleCenter
  $timeLabel.Font = New-Object Drawing.Font('Segoe UI', 22, [Drawing.FontStyle]::Regular)
  $timeLabel.ForeColor = [Drawing.ColorTranslator]::FromHtml('#C7D7F6')

  $actions = New-Object Windows.Forms.FlowLayoutPanel
  $actions.Dock = [Windows.Forms.DockStyle]::Fill
  $actions.FlowDirection = [Windows.Forms.FlowDirection]::LeftToRight
  $actions.WrapContents = $false
  $actions.AutoSize = $false
  $actions.Padding = New-Object Windows.Forms.Padding(0, 24, 0, 0)

  $openButton = New-Object Windows.Forms.Button
  $openButton.Text = 'Abrir Inbox'
  $openButton.AccessibleName = 'Abrir Inbox de Estudiemos'
  $openButton.Size = New-Object Drawing.Size(220, 62)
  $openButton.Margin = New-Object Windows.Forms.Padding(12)
  $openButton.FlatStyle = [Windows.Forms.FlatStyle]::Flat
  $openButton.FlatAppearance.BorderSize = 1
  $openButton.FlatAppearance.BorderColor = [Drawing.ColorTranslator]::FromHtml('#6F8BB8')
  $openButton.BackColor = [Drawing.ColorTranslator]::FromHtml('#18253B')
  $openButton.ForeColor = [Drawing.Color]::White
  $openButton.Font = New-Object Drawing.Font('Segoe UI Semibold', 14, [Drawing.FontStyle]::Bold)
  $openButton.Add_Click({ Start-Process 'https://estudiemos-app.vercel.app/?agenda=1'; $form.Close() })

  $dismissButton = New-Object Windows.Forms.Button
  $dismissButton.Text = 'Entendido'
  $dismissButton.AccessibleName = 'Cerrar alarma'
  $dismissButton.Size = New-Object Drawing.Size(220, 62)
  $dismissButton.Margin = New-Object Windows.Forms.Padding(12)
  $dismissButton.FlatStyle = [Windows.Forms.FlatStyle]::Flat
  $dismissButton.FlatAppearance.BorderSize = 0
  $dismissButton.BackColor = [Drawing.ColorTranslator]::FromHtml('#8AB4FF')
  $dismissButton.ForeColor = [Drawing.ColorTranslator]::FromHtml('#081225')
  $dismissButton.Font = New-Object Drawing.Font('Segoe UI Semibold', 14, [Drawing.FontStyle]::Bold)
  $dismissButton.Add_Click({ $form.Close() })

  $actions.Controls.Add($openButton)
  $actions.Controls.Add($dismissButton)
  $actions.add_SizeChanged({
    $contentWidth = $openButton.Width + $dismissButton.Width + $openButton.Margin.Horizontal + $dismissButton.Margin.Horizontal
    $actions.Padding = New-Object Windows.Forms.Padding([Math]::Max(0, [int](($actions.ClientSize.Width - $contentWidth) / 2)), 24, 0, 0)
  })

  $layout.Controls.Add($eyebrow, 0, 0)
  $layout.Controls.Add($alarmName, 0, 1)
  $layout.Controls.Add($timeLabel, 0, 2)
  $layout.Controls.Add($actions, 0, 3)
  $form.Controls.Add($layout)
  $form.AcceptButton = $dismissButton
  $form.Add_KeyDown({ param($sender, $eventArgs); if ($eventArgs.KeyCode -eq [Windows.Forms.Keys]::Escape) { $form.Close() } })

  $soundFile = Join-Path $env:WINDIR 'Media\Ring05.wav'
  $player = $null
  if (Test-Path -LiteralPath $soundFile) {
    $player = New-Object System.Media.SoundPlayer($soundFile)
    $player.PlayLooping()
  } else {
    [System.Media.SystemSounds]::Exclamation.Play()
  }

  $autoClose = New-Object Windows.Forms.Timer
  $autoClose.Interval = 300000
  $autoClose.Add_Tick({ $autoClose.Stop(); $form.Close() })
  $autoClose.Start()
  try { [void]$form.ShowDialog() }
  finally {
    $autoClose.Stop()
    $autoClose.Dispose()
    if ($player) { $player.Stop(); $player.Dispose() }
    $form.Dispose()
  }
}

$snapshot = $null
$feedPath = Join-Path $StateDirectory 'feed.dpapi'
if (!$InputPath -and (Test-Path -LiteralPath $feedPath)) {
  $cachePath = Join-Path $StateDirectory 'cloud.json'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $secure = Get-Content -LiteralPath $feedPath -Raw | ConvertTo-SecureString
    $credential = New-Object System.Management.Automation.PSCredential('alarm-feed', $secure)
    $snapshot = Invoke-RestMethod -Uri 'https://estudiemos-app.vercel.app/api/widget-link?alarmFeed=1' -Headers @{Authorization=('Bearer ' + $credential.GetNetworkCredential().Password)} -TimeoutSec 12
    if ($snapshot.version -ne 1 -or @($snapshot.items).Count -gt 500) { throw 'Invalid alarm feed.' }
    $snapshot | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath $cachePath -Encoding UTF8
    @{status='connected';lastSync=(Get-Date).ToString('o');version='1.6.0'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StateDirectory 'connection.json') -Encoding UTF8
  } catch {
    $status = if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -in @(401,403)) { 'reconnect' } else { 'offline' }
    @{status=$status;checkedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $StateDirectory 'connection.json') -Encoding UTF8
    if ($status -eq 'reconnect') { exit 0 }
    if (Test-Path -LiteralPath $cachePath) { $snapshot = Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json }
  } finally { $credential = $null; $secure = $null }
}
if (!$snapshot) {
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
}
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
  Show-FullScreenInboxAlarm -DueItems @($due)
  $notice.Dispose()
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
