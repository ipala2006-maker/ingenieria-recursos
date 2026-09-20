Option Explicit
Dim shell, files, request, script, argument, token, expression, powerShell
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
request = WScript.Arguments(0)
If LCase(request) = "estudiemos-alarms://test" Or LCase(request) = "estudiemos-alarms://test/" Then
  script = "InboxAlarm.ps1"
  argument = " -TestAlert"
ElseIf InStr(request, "estudiemos-alarms://connect?link=") = 1 Then
  token = Mid(request, Len("estudiemos-alarms://connect?link=") + 1)
  Set expression = New RegExp
  expression.Pattern = "^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"
  If Len(token) > 2048 Or Not expression.Test(token) Then WScript.Quit 2
  script = "ConnectInboxAlarms.ps1"
  argument = " -Token " & Chr(34) & token & Chr(34)
Else
  WScript.Quit 3
End If
script = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), script)
If Not files.FileExists(script) Then WScript.Quit 4
powerShell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
shell.Run Chr(34) & powerShell & Chr(34) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34) & argument, 0, False
