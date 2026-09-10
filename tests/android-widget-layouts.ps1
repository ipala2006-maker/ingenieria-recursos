$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '../android-app/app/src/main'
$allowed = @('LinearLayout','FrameLayout','RelativeLayout','TextView','Chronometer','ImageView','ImageButton','ProgressBar','ListView','GridView','include')
$namespace = 'http://schemas.android.com/apk/res/android'
$layouts = Get-ChildItem -LiteralPath (Join-Path $root 'res/layout') -Filter '*widget*.xml'
foreach ($file in $layouts) {
    [xml]$xml = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($node in $xml.SelectNodes('//*')) {
        if ($node.LocalName -notin $allowed) { throw "Unsupported RemoteViews element: $($file.Name) $($node.LocalName)" }
        foreach ($attribute in $node.Attributes) {
            if ($attribute.Value -match '^@(drawable|layout)/(.+)$') {
                $type = $Matches[1]; $name = $Matches[2]
                $matches = Get-ChildItem -Path (Join-Path $root "res/$type*/$name.*")
                if (!$matches) { throw "Missing widget asset $($attribute.Value)" }
            }
        }
    }
}
foreach ($provider in @('Agenda','Calendar','Pomodoro','Streak','Workspace')) {
    $source = Get-Content -LiteralPath (Join-Path $root "java/com/estudiemos/app/${provider}WidgetProvider.java") -Raw
    if ($source -notmatch 'onAppWidgetOptionsChanged') { throw "$provider does not respond to resizing" }
}
[xml]$week = Get-Content -LiteralPath (Join-Path $root 'res/layout/calendar_widget_week.xml') -Raw
if ($week.SelectSingleNode('//GridView').GetAttribute('numColumns',$namespace) -ne '1') { throw 'Week must use readable rows' }
[xml]$month = Get-Content -LiteralPath (Join-Path $root 'res/layout/calendar_widget.xml') -Raw
if ($month.SelectSingleNode('//GridView').GetAttribute('numColumns',$namespace) -ne '7') { throw 'Month must preserve the grid' }
Write-Output "Validated $($layouts.Count) native widget layouts, asset references and five resize handlers."
