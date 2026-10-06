param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EstudiemosConsoleProbe {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
}
'@
$console = [EstudiemosConsoleProbe]::GetConsoleWindow()
$process = Get-Process -Id $PID
$result = @{consoleVisible=[EstudiemosConsoleProbe]::IsWindowVisible($console);mainWindowVisible=($process.MainWindowHandle -ne [IntPtr]::Zero);processId=$PID}
[IO.File]::WriteAllText($OutputPath, ($result | ConvertTo-Json -Compress))
Start-Sleep -Seconds 3
