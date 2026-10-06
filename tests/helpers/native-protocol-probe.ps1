param([string]$Token, [switch]$TestAlert)
$ErrorActionPreference = 'Stop'
if (!$TestAlert -and $Token -ne 'pilot.signature-testing') { throw 'Unexpected test-only action.' }
& (Join-Path $PSScriptRoot 'windows-background-probe.ps1') -OutputPath (Join-Path $PSScriptRoot 'probe-result.json')
