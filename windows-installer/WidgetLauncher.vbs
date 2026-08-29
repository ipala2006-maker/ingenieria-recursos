Option Explicit

Dim shell, fileSystem, request, rainmeterPath, configName, iniName, command, widgetKey
Dim screenWidth, screenHeight, positionX, positionY, markerPath, appPath
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count = 0 Then WScript.Quit 1
request = LCase(WScript.Arguments(0))
rainmeterPath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Rainmeter\Rainmeter.exe"
If Not fileSystem.FileExists(rainmeterPath) Then WScript.Quit 2

configName = ""
iniName = ""
widgetKey = ""
positionX = 20
positionY = 20
If InStr(request, "widget=workspace") > 0 Then
  configName = "MiEspacio"
  iniName = "MiEspacio.ini"
  widgetKey = "workspace"
ElseIf InStr(request, "widget=inbox") > 0 Then
  configName = "Inbox"
  iniName = "Inbox.ini"
  widgetKey = "inbox"
ElseIf InStr(request, "widget=calendar") > 0 Then
  configName = "Calendario"
  iniName = "Calendario.ini"
  widgetKey = "calendar"
ElseIf InStr(request, "widget=pomodoro") > 0 Then
  configName = "Pomodoro"
  iniName = "Pomodoro.ini"
  widgetKey = "pomodoro"
ElseIf InStr(request, "widget=streak") > 0 Then
  configName = "Racha"
  iniName = "Racha.ini"
  widgetKey = "streak"
End If

If configName = "" Then WScript.Quit 3

screenWidth = 1366
screenHeight = 768
On Error Resume Next
Dim videoControllers, videoController
Set videoControllers = GetObject("winmgmts:\\.\root\cimv2").ExecQuery( _
  "SELECT CurrentHorizontalResolution, CurrentVerticalResolution FROM Win32_VideoController")
For Each videoController In videoControllers
  If IsNumeric(videoController.CurrentHorizontalResolution) And _
     IsNumeric(videoController.CurrentVerticalResolution) Then
    screenWidth = CLng(videoController.CurrentHorizontalResolution)
    screenHeight = CLng(videoController.CurrentVerticalResolution)
    Exit For
  End If
Next
On Error GoTo 0

Select Case configName
  Case "MiEspacio"
    positionX = Int((screenWidth - 380) / 2)
    positionY = 40
  Case "Inbox"
    positionX = screenWidth - 380
    positionY = 20
  Case "Calendario"
    positionX = 20
    positionY = 20
  Case "Pomodoro"
    positionX = 20
    positionY = screenHeight - 420
  Case "Racha"
    positionX = screenWidth - 360
    positionY = screenHeight - 340
End Select
If positionX < 0 Then positionX = 0
If positionY < 0 Then positionY = 0

If Not IsRainmeterRunning() Then
  shell.Run Chr(34) & rainmeterPath & Chr(34), 0, False
  WScript.Sleep 1800
End If

command = Chr(34) & rainmeterPath & Chr(34) & " !ActivateConfig " & _
  Chr(34) & "Estudiemos\" & configName & Chr(34) & " " & Chr(34) & iniName & Chr(34)
shell.Run command, 0, False
WScript.Sleep 900

RunBang "!Refresh", configName, ""
RunBang "!Show", configName, ""
RunBang "!ZPos", configName, "-2"

appPath = fileSystem.GetParentFolderName(WScript.ScriptFullName)
markerPath = fileSystem.BuildPath(appPath, "positioned-" & LCase(configName) & ".txt")
If Not fileSystem.FileExists(markerPath) Then
  WScript.Sleep 700
  command = Chr(34) & rainmeterPath & Chr(34) & " !Move " & _
    Chr(34) & CStr(positionX) & Chr(34) & " " & Chr(34) & CStr(positionY) & Chr(34) & " " & _
    Chr(34) & "Estudiemos\" & configName & Chr(34)
  shell.Run command, 0, False
  Dim markerFile
  Set markerFile = fileSystem.CreateTextFile(markerPath, True)
  markerFile.WriteLine CStr(positionX) & "," & CStr(positionY)
  markerFile.Close
End If

RunBang "!Redraw", configName, ""

If InStr(request, "callback=1") > 0 Then
  WScript.Sleep 900
  On Error Resume Next
  Err.Clear
  shell.Run "web+estudiemos://open?target=widget-added&widget=" & widgetKey, 0, False
  If Err.Number <> 0 Then
    Err.Clear
    shell.Run "https://estudiemos-app.vercel.app/?windows-widget-added=" & widgetKey, 0, False
  End If
  On Error GoTo 0
End If

Function IsRainmeterRunning()
  Dim processes
  IsRainmeterRunning = False
  On Error Resume Next
  Set processes = GetObject("winmgmts:\\.\root\cimv2").ExecQuery( _
    "SELECT ProcessId FROM Win32_Process WHERE Name='Rainmeter.exe'")
  If Err.Number = 0 Then IsRainmeterRunning = (processes.Count > 0)
  On Error GoTo 0
End Function

Sub RunBang(bangName, targetConfig, firstArgument)
  Dim bangCommand
  bangCommand = Chr(34) & rainmeterPath & Chr(34) & " " & bangName
  If firstArgument <> "" Then bangCommand = bangCommand & " " & firstArgument
  bangCommand = bangCommand & " " & Chr(34) & "Estudiemos\" & targetConfig & Chr(34)
  shell.Run bangCommand, 0, False
End Sub
