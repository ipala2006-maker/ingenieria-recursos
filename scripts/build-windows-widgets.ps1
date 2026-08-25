param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$packageRoot = Join-Path $repositoryRoot "windows-rainmeter"

if (-not $OutputPath) {
  $OutputPath = Join-Path $repositoryRoot "downloads\Estudiemos-Widgets.rmskin"
}

$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$temporaryArchive = Join-Path ([IO.Path]::GetTempPath()) ("Estudiemos-Widgets-{0}.zip" -f [Guid]::NewGuid().ToString("N"))

try {
  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $temporaryArchive -CompressionLevel Optimal
  Copy-Item -LiteralPath $temporaryArchive -Destination $OutputPath -Force

  $stream = [IO.File]::Open($OutputPath, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $packageLength = $stream.Position
    $writer = [IO.BinaryWriter]::new($stream, [Text.Encoding]::ASCII, $true)
    try {
      $writer.Write([Int64]$packageLength)
      $writer.Write([Byte]0)
      $writer.Write([Text.Encoding]::ASCII.GetBytes("RMSKIN"))
      $writer.Write([Byte]0)
    }
    finally {
      $writer.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }

  Write-Output $OutputPath
}
finally {
  if (Test-Path $temporaryArchive) {
    Remove-Item -LiteralPath $temporaryArchive -Force
  }
}
