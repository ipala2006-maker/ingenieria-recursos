param([string]$StateDirectory, [ValidateSet('online','offline','empty')][string]$Scenario)
$ErrorActionPreference = 'Stop'
function Invoke-RestMethod { throw 'Background network requests are forbidden' }
function Invoke-WebRequest { throw 'Background network requests are forbidden' }
if ($Scenario -eq 'empty') { '{"version":1,"items":[]}' | Set-Content -LiteralPath (Join-Path $StateDirectory 'cloud.json') -Encoding UTF8 }
& (Join-Path $PSScriptRoot '../../windows-installer/InboxAlarm.ps1') -StateDirectory $StateDirectory -Now '2026-09-11T18:01:00' -DryRun
