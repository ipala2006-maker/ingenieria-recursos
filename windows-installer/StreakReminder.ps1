$ErrorActionPreference = "SilentlyContinue"
$today = Get-Date -Format "yyyy-MM-dd"
$stateFile = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Rainmeter\Skins\Estudiemos\@Resources\ReminderState.inc"
$minutes = 0

if (Test-Path -LiteralPath $stateFile) {
  $savedDate = ((Select-String -LiteralPath $stateFile -Pattern '^TodayDate=(.*)$').Matches.Groups[1].Value).Trim()
  $savedMinutes = ((Select-String -LiteralPath $stateFile -Pattern '^TodayMinutes=(.*)$').Matches.Groups[1].Value).Trim()
  if ($savedDate -eq $today) {
    $parsedMinutes = 0
    if ([int]::TryParse($savedMinutes, [ref]$parsedMinutes)) {
      $minutes = [Math]::Max(0, $parsedMinutes)
    }
  }
}

if ($minutes -ge 25) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notice = New-Object System.Windows.Forms.NotifyIcon
$notice.Icon = [System.Drawing.SystemIcons]::Information
$notice.Visible = $true
$notice.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$notice.BalloonTipTitle = "Momento de estudiar"
$notice.BalloonTipText = "Todavía estás a tiempo de mantener tu racha. 25 min alcanzan."
$notice.ShowBalloonTip(15000)
Start-Sleep -Seconds 16
$notice.Dispose()

