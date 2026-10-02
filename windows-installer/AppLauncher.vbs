Option Explicit

Dim shell, files, browser, candidate, url, roots, root
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
url = "https://estudiemos-app.vercel.app/?windows-bundle=1"
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "--setup" Then url = url & "&alarms-setup=1"
End If

' Use the browser's normal profile so existing sign-in can be reused.
browser = ""
roots = Array("%ProgramFiles(x86)%", "%ProgramFiles%", "%LOCALAPPDATA%")
For Each root In roots
  candidate = shell.ExpandEnvironmentStrings(root) & "\Microsoft\Edge\Application\msedge.exe"
  If files.FileExists(candidate) Then
    browser = candidate
    Exit For
  End If
Next
If browser = "" Then
  For Each root In roots
    candidate = shell.ExpandEnvironmentStrings(root) & "\Google\Chrome\Application\chrome.exe"
    If files.FileExists(candidate) Then
      browser = candidate
      Exit For
    End If
  Next
End If
If browser <> "" Then
  shell.Run Chr(34) & browser & Chr(34) & " --app=" & Chr(34) & url & Chr(34), 1, False
Else
  shell.Run url, 1, False
End If
