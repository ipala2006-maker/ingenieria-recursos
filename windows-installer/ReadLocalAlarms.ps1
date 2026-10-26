function Read-EstudiemosLocalAlarms {
  param([string]$StateDirectory)
  $configPath = Join-Path $StateDirectory 'local-config.json'
  if (!(Test-Path -LiteralPath $configPath)) { return $null }
  $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($config.deviceId -notmatch '^[a-f0-9-]{36}$' -or $config.owner -notmatch '^[a-f0-9-]{36}$' -or
      $config.path -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetExtension([string]$config.path) -ne '.estudiemos-local') { throw 'Invalid local alarm configuration.' }
  $file = Get-Item -LiteralPath $config.path -ErrorAction Stop
  if ($file.Length -gt 400000) { throw 'Local alarm file too large.' }
  $snapshot = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($snapshot.version -ne 2 -or $snapshot.kind -ne 'estudiemos-local-alarms' -or
      $snapshot.owner -ne $config.owner -or $snapshot.deviceId -ne $config.deviceId -or @($snapshot.items).Count -gt 500) { throw 'Invalid local alarm file.' }
  if ($snapshot.disabled -eq $true) { return @{version=1;items=@();study=$null} }
  # Visible widgets can also publish locally; the retired hidden bridge stays off.
  $widgetConfig = Join-Path $PSScriptRoot 'InboxAlarmConfig.json'
  if (Test-Path -LiteralPath $widgetConfig) {
    try {
      $resource = (Get-Content -LiteralPath $widgetConfig -Raw | ConvertFrom-Json).resourceDirectory
      if ($resource -match '^[A-Za-z]:\\') {
        $widgetFile = Get-Item -LiteralPath (Join-Path $resource 'InboxAlarms.inc') -ErrorAction Stop
        if ($widgetFile.LastWriteTimeUtc -gt $file.LastWriteTimeUtc -and $widgetFile.Length -le 620000) {
          $content = Get-Content -LiteralPath $widgetFile.FullName -Raw
          $countMatch = [regex]::Match($content,'(?m)^Count=(\d+)\s*$')
          $encoded = ''
          if ($countMatch.Success -and [int]$countMatch.Groups[1].Value -le 200) {
            for ($index=0; $index -lt [int]$countMatch.Groups[1].Value; $index++) {
              $part = [regex]::Match($content,("(?m)^Chunk{0}=([A-Za-z0-9+/=]{{1,3000}})\s*$" -f $index))
              if (!$part.Success) { throw 'Incomplete widget snapshot.' }
              $encoded += $part.Groups[1].Value
            }
            $widget = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
            if ($widget.version -eq 1 -and $widget.owner -eq $config.owner -and @($widget.items).Count -le 500) {
              return @{version=1;items=@($widget.items);study=$widget.study}
            }
          }
        }
      }
    } catch { }
  }
  return @{version=1;items=@($snapshot.items);study=$snapshot.study}
}
