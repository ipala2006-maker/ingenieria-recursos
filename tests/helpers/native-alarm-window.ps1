param([Parameter(Mandatory=$true)][string]$CapturePath)
$ErrorActionPreference = 'Stop'
$script:CapturePath = [IO.Path]::GetFullPath($CapturePath)
$script:Failure = $null
$script:Captured = $false
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../windows-installer/InboxAlarm.ps1') -Raw
# Inspect the actual form from the shipping script, then dismiss only that form.
$probe = @'
$probeTimer = New-Object Windows.Forms.Timer
$probeTimer.Interval = 1800
$probeTimer.Add_Tick({
  $probeTimer.Stop()
  try {
    if (!$form.Visible -or !$form.TopMost -or $form.Bounds -ne [Windows.Forms.Screen]::PrimaryScreen.Bounds) { throw 'Alarm must cover the primary display.' }
    if ($dismissButton.Text -ne 'Entendido' -or !$dismissButton.Visible) { throw 'Dismiss action unavailable.' }
    if ($alarmName.Text -ne 'Tu alarma aparece en toda la pantalla') { throw 'Alarm title missing.' }
    $bitmap = New-Object Drawing.Bitmap($form.Width, $form.Height)
    try {
      $form.DrawToBitmap($bitmap, (New-Object Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
      $bitmap.Save($script:CapturePath, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
    $script:Captured = $true
  } catch { $script:Failure = $_.Exception.Message }
  finally { $form.Close() }
})
$probeTimer.Start()
try { [void]$form.ShowDialog() }
'@
$source = $source.Replace('try { [void]$form.ShowDialog() }', $probe)
$source = $source.Replace("  exit 0`r`n}", "  return`r`n}").Replace("  exit 0`n}", "  return`n}")
& ([ScriptBlock]::Create($source)) -TestAlert
if ($script:Failure) { throw $script:Failure }
if (!$script:Captured) { throw 'Alarm closed before verification.' }
Write-Output 'PASS native fullscreen form, title, topmost, dismiss action and capture. Audio invoked; physical output not verified.'
