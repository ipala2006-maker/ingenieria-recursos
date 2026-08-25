Option Explicit

Dim shell, fileSystem, startupFolder, shortcutPath, targetPath, shortcut

If WScript.Arguments.Count = 0 Then WScript.Quit 1

targetPath = WScript.Arguments(0)
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If Not fileSystem.FileExists(targetPath) Then WScript.Quit 2

Set shell = CreateObject("WScript.Shell")
startupFolder = shell.SpecialFolders("Startup")
shortcutPath = fileSystem.BuildPath(startupFolder, "Rainmeter.lnk")

Set shortcut = shell.CreateShortcut(shortcutPath)
shortcut.TargetPath = targetPath
shortcut.WorkingDirectory = fileSystem.GetParentFolderName(targetPath)
shortcut.Description = "Iniciar los widgets de Estudiemos con Windows"
shortcut.WindowStyle = 7
shortcut.Save

On Error Resume Next
shell.RegDelete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder\Rainmeter.lnk"
On Error GoTo 0
