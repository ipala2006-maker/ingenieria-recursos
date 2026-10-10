# Windows owns the typography and layout; text is inserted as data, never markup.
function New-EstudiemosToastXml {
  param([string]$Title, [string]$Body)
  $xml = New-Object System.Xml.XmlDocument
  $xml.LoadXml('<toast activationType="protocol" launch="https://estudiemos-app.vercel.app/"><visual><binding template="ToastGeneric"><image placement="appLogoOverride"/><text/><text/></binding></visual></toast>')
  $image = $xml.SelectSingleNode('//image')
  $image.SetAttribute('src', ([uri](Join-Path $PSScriptRoot 'icon-180.png')).AbsoluteUri)
  $nodes = $xml.SelectNodes('//text')
  $nodes[0].InnerText = $Title
  $nodes[1].InnerText = $Body
  return $xml.OuterXml
}
function Show-EstudiemosToast {
  param([string]$Title, [string]$Body, [string]$Tag = 'study-reminder', [string]$Group = 'daily-goal')
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]
    $document = New-Object Windows.Data.Xml.Dom.XmlDocument
    $document.LoadXml((New-EstudiemosToastXml -Title $Title -Body $Body))
    $toast = [Windows.UI.Notifications.ToastNotification]::new($document)
    $toast.Tag = $Tag
    $toast.Group = $Group
    $toast.ExpirationTime = [DateTimeOffset]::Now.AddHours(2)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Estudiemos.Study').Show($toast)
  } catch { Write-Verbose ('Toast unavailable: ' + $_.Exception.GetType().Name) }
}
function Clear-EstudiemosStudyToast {
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
    [Windows.UI.Notifications.ToastNotificationManager]::History.Remove('study-reminder', 'daily-goal', 'Estudiemos.Study')
  } catch { Write-Verbose ('Toast history unavailable: ' + $_.Exception.GetType().Name) }
}
