param([string]$StateDirectory, [ValidateSet('online','offline','empty')][string]$Scenario)
$ErrorActionPreference = 'Stop'
'test-only-read-only-credential' | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $StateDirectory 'feed.dpapi') -NoNewline
function Invoke-RestMethod {
  param($Uri, $Headers, $TimeoutSec)
  if ($Uri -ne 'https://estudiemos-app.vercel.app/api/widget-link?alarmFeed=1' -or $Headers.Authorization -ne 'Bearer test-only-read-only-credential') { throw 'Unexpected feed request' }
  if ($Scenario -eq 'offline') { throw 'Test: offline' }
  if ($Scenario -eq 'empty') { return @{ version=1;items=@() } }
  return (Get-Content -LiteralPath (Join-Path $StateDirectory 'cloud.json') -Raw | ConvertFrom-Json)
}
& (Join-Path $PSScriptRoot '../../windows-installer/InboxAlarm.ps1') -StateDirectory $StateDirectory -Now '2026-09-11T18:01:00' -DryRun
