function Get-AlarmConnectionOrigin {
  param([Parameter(Mandatory=$true)][ValidateLength(1,2048)][ValidatePattern('^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')][string]$Token)
  # This only selects an allowlisted recipient. That server must verify the signature.
  $encoded = $Token.Split('.')[0].Replace('-','+').Replace('_','/')
  $encoded = $encoded.PadRight($encoded.Length + ((4 - $encoded.Length % 4) % 4), '=')
  $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json -ErrorAction Stop
  if ($data -isnot [pscustomobject]) { throw 'Invalid connection metadata.' }
  if (!$data.PSObject.Properties['origin']) { return 'https://estudiemos-app.vercel.app' }
  if ($data.origin -isnot [string] -or $data.origin -cnotin @('https://estudiemos-app.vercel.app','https://estudiemos.estudiemos-services.workers.dev')) { throw 'Untrusted connection origin.' }
  return $data.origin
}

function Read-AlarmConnectionToken {
  param([Parameter(Mandatory=$true)][string]$Path)
  if ($Path -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetExtension($Path) -ne '.estudiemos-alarmas') {
    throw 'Invalid connection file path.'
  }
  $file = Get-Item -LiteralPath $Path -ErrorAction Stop
  if ($file.PSIsContainer -or $file.Length -gt 8192 -or $file.Length -eq 0) { throw 'Invalid connection file size.' }
  $data = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
  if ($data -isnot [pscustomobject] -or $data.version -ne 1 -or $data.token -isnot [string]) {
    throw 'Invalid connection file format.'
  }
  if ((@($data.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'token,version') { throw 'Unexpected connection fields.' }
  if ($data.token.Length -gt 2048 -or $data.token -cnotmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') {
    throw 'Invalid connection token.'
  }
  return $data.token
}
