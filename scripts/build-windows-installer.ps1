param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$installerRoot = Join-Path $repositoryRoot "windows-installer"
$vendorRoot = Join-Path $installerRoot "vendor"
$rainmeterFile = Join-Path $vendorRoot "Rainmeter-4.5.26.exe"
$rainmeterUrl = "https://github.com/rainmeter/rainmeter/releases/download/v4.5.26.3894/Rainmeter-4.5.26.exe"
$rainmeterHash = "A3A5579B1B54C03FB5301CAD3D68731D3AB4620F6BCB0BA2585AE5823B4187C7"
$innoCandidates = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)
$innoCompiler = $innoCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$defaultOutput = Join-Path $repositoryRoot "downloads\Estudiemos-Widgets-para-Windows.exe"
$legacyOutput = Join-Path $repositoryRoot "downloads\Estudiemos-Para-Windows.exe"

if (-not $OutputPath) {
  $OutputPath = $defaultOutput
}

if (-not $innoCompiler) {
  throw "Falta Inno Setup 6. Instalalo con: winget install JRSoftware.InnoSetup"
}

New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null

$downloadRequired = -not (Test-Path -LiteralPath $rainmeterFile)
if (-not $downloadRequired) {
  $downloadRequired = (Get-FileHash -LiteralPath $rainmeterFile -Algorithm SHA256).Hash -ne $rainmeterHash
}

if ($downloadRequired) {
  Invoke-WebRequest -Uri $rainmeterUrl -OutFile $rainmeterFile -UseBasicParsing
}

$actualHash = (Get-FileHash -LiteralPath $rainmeterFile -Algorithm SHA256).Hash
if ($actualHash -ne $rainmeterHash) {
  throw "El instalador oficial de Rainmeter no superó la verificación de integridad."
}

$signature = Get-AuthenticodeSignature -LiteralPath $rainmeterFile
if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "SignPath Foundation") {
  throw "La firma digital del instalador oficial de Rainmeter no es válida."
}

$installerScript = Join-Path $installerRoot "Estudiemos-Windows.iss"
& $innoCompiler "/Qp" $installerScript
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el instalador general de Windows." }

$widgetInstallers = @(
  @{ Widget = "workspace"; Output = "Agregar-Mi-Espacio-Estudiemos" },
  @{ Widget = "inbox"; Output = "Agregar-Inbox-Estudiemos" },
  @{ Widget = "calendar"; Output = "Agregar-Calendario-Estudiemos" },
  @{ Widget = "pomodoro"; Output = "Agregar-Pomodoro-Estudiemos" },
  @{ Widget = "streak"; Output = "Agregar-Racha-Estudiemos" }
)

foreach ($widgetInstaller in $widgetInstallers) {
  & $innoCompiler "/Qp" "/DRequestedWidget=$($widgetInstaller.Widget)" "/DOutputBaseName=$($widgetInstaller.Output)" $installerScript
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo crear el instalador de $($widgetInstaller.Widget)."
  }
}

if ([IO.Path]::GetFullPath($OutputPath) -ne [IO.Path]::GetFullPath($defaultOutput)) {
  Copy-Item -LiteralPath $defaultOutput -Destination $OutputPath -Force
}

Copy-Item -LiteralPath $defaultOutput -Destination $legacyOutput -Force

Get-Item -LiteralPath $OutputPath
