Add-Type -AssemblyName System.Drawing

function New-RoundedRectangle {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-WidgetPreview {
  param(
    [string]$Path,
    [string]$Title,
    [string]$Subtitle,
    [string[]]$Items,
    [string]$Accent
  )

  $bitmap = New-Object System.Drawing.Bitmap 300, 304, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $panelPath = New-RoundedRectangle 4 4 292 296 18
  $panelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#111827"))
  $graphics.FillPath($panelBrush, $panelPath)

  $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Accent))
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#F1F5F9"))
  $mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#94A3B8"))
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#263650")), 1
  $brandFont = New-Object System.Drawing.Font "Segoe UI", 8, ([System.Drawing.FontStyle]::Bold)
  $titleFont = New-Object System.Drawing.Font "Segoe UI", 20, ([System.Drawing.FontStyle]::Bold)
  $itemFont = New-Object System.Drawing.Font "Segoe UI", 11, ([System.Drawing.FontStyle]::Bold)
  $metaFont = New-Object System.Drawing.Font "Segoe UI", 8

  $graphics.DrawString("ESTUDIEMOS", $brandFont, $accentBrush, 22, 20)
  $graphics.DrawString($Title, $titleFont, $textBrush, 20, 39)
  $graphics.DrawString($Subtitle, $metaFont, $mutedBrush, 22, 76)

  $y = 108
  foreach ($item in $Items) {
    $graphics.DrawLine($linePen, 20, $y - 9, 280, $y - 9)
    $graphics.FillEllipse($accentBrush, 22, $y + 4, 7, 7)
    $graphics.DrawString($item, $itemFont, $textBrush, 38, $y - 1)
    $y += 48
  }

  $directory = Split-Path -Parent $Path
  if (!(Test-Path $directory)) { New-Item -ItemType Directory -Path $directory | Out-Null }
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $brandFont.Dispose(); $titleFont.Dispose(); $itemFont.Dispose(); $metaFont.Dispose()
  $accentBrush.Dispose(); $textBrush.Dispose(); $mutedBrush.Dispose(); $linePen.Dispose()
  $panelBrush.Dispose(); $panelPath.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$assets = Join-Path $PSScriptRoot "..\assets"
New-WidgetPreview (Join-Path $assets "widget-inbox-preview.png") "Inbox" "Tareas pendientes" @("Resolver guía 2", "Preparar parcial", "Entregar trabajo") "#8BB5FF"
New-WidgetPreview (Join-Path $assets "widget-calendar-preview.png") "Calendario" "Próximas anotaciones" @("24/08  ·  Física", "25/08  ·  Cálculo", "27/08  ·  Entrega") "#67D8F4"
New-WidgetPreview (Join-Path $assets "widget-streak-preview.png") "Racha: 4 días" "Hoy llevás 18/25 min" @("Últimos 7 días", "5 días activos", "Estudiar 25 minutos") "#F59E0B"
