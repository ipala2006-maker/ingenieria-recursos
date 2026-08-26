Option Explicit

Dim shell, fileSystem, request, rainmeterPath, configName, iniName, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then WScript.Quit 1
request = LCase(WScript.Arguments(0))
rainmeterPath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Rainmeter\Rainmeter.exe"
If Not fileSystem.FileExists(rainmeterPath) Then WScript.Quit 2

configName = ""
iniName = ""
If InStr(request, "widget=workspace") > 0 Then
  configName = "MiEspacio"
  iniName = "MiEspacio.ini"
ElseIf InStr(request, "widget=inbox") > 0 Then
  configName = "Inbox"
  iniName = "Inbox.ini"
ElseIf InStr(request, "widget=calendar") > 0 Then
  configName = "Calendario"
  iniName = "Calendario.ini"
ElseIf InStr(request, "widget=pomodoro") > 0 Then
  configName = "Pomodoro"
  iniName = "Pomodoro.ini"
ElseIf InStr(request, "widget=streak") > 0 Then
  configName = "Racha"
  iniName = "Racha.ini"
End If

If configName = "" Then WScript.Quit 3

shell.Run Chr(34) & rainmeterPath & Chr(34), 0, False
WScript.Sleep 500
command = Chr(34) & rainmeterPath & Chr(34) & " !ActivateConfig " & _
  Chr(34) & "Estudiemos\" & configName & Chr(34) & " " & Chr(34) & iniName & Chr(34)
shell.Run command, 0, False

