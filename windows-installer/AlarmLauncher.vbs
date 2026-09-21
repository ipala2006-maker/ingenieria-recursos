Option Explicit
Dim shell, files, request, script, argument, token, expression, powerShell, failure
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
LogStage "received", 0
If WScript.Arguments.Count <> 1 Then
  LogStage "invalid-arguments", 1
  WScript.Quit 1
End If
request = WScript.Arguments(0)
Set expression = New RegExp
expression.Pattern = "^[A-Za-z]:\\"
If expression.Test(request) And LCase(files.GetExtensionName(request)) = "estudiemos-alarmas" And InStr(request, Chr(34)) = 0 Then
  script = "ConnectInboxAlarms.ps1"
  argument = " -ConnectionFile " & Chr(34) & request & Chr(34)
ElseIf LCase(request) = "estudiemos-alarms://test" Or LCase(request) = "estudiemos-alarms://test/" Then
  script = "InboxAlarm.ps1"
  argument = " -TestAlert"
ElseIf InStr(request, "estudiemos-alarms://connect?link=") = 1 Then
  token = Mid(request, Len("estudiemos-alarms://connect?link=") + 1)
  Set expression = New RegExp
  expression.Pattern = "^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"
  If Len(token) > 2048 Or Not expression.Test(token) Then
    LogStage "invalid-link", 2
    WScript.Quit 2
  End If
  script = "ConnectInboxAlarms.ps1"
  argument = " -Token " & Chr(34) & token & Chr(34)
Else
  LogStage "unsupported-action", 3
  WScript.Quit 3
End If
script = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), script)
If Not files.FileExists(script) Then
  LogStage "missing-component", 4
  WScript.Quit 4
End If
powerShell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
On Error Resume Next
shell.Run Chr(34) & powerShell & Chr(34) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34) & argument, 0, False
failure = Err.Number
On Error GoTo 0
If failure <> 0 Then
  LogStage "launch-failed", failure
  WScript.Quit 5
End If
LogStage "started", 0

Sub LogStage(stage, code)
  On Error Resume Next
  Dim directory, output
  directory = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Estudiemos\Windows\InboxAlarms"
  If Not files.FolderExists(directory) Then files.CreateFolder directory
  Set output = files.CreateTextFile(files.BuildPath(directory, "launcher-status.json"), True)
  output.Write "{""stage"":""" & stage & """,""code"":" & CStr(code) & "}"
  output.Close
  On Error GoTo 0
End Sub
