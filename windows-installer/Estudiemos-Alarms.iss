[Setup]
AppId={{10257322-F14A-47E1-9C71-03CB33D39726}
AppName=Alarmas de Estudiemos
AppVersion=1.6.2
AppPublisher=Estudiemos
DefaultDirName={localappdata}\Estudiemos\Windows\AlarmService
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Uninstallable=no
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes
WizardStyle=modern
Compression=lzma2
OutputDir=..\downloads
OutputBaseFilename=Activar-Alarmas-Estudiemos
SetupIconFile=..\assets\estudiemos.ico
VersionInfoVersion=1.6.2
VersionInfoDescription=Alarmas a pantalla completa de Estudiemos
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Files]
Source: "AlarmLauncher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "InboxAlarm.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "InstallInboxAlarm.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "ConnectInboxAlarms.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "AlarmLauncher.vbs"; Flags: dontcopy
Source: "InboxAlarm.ps1"; Flags: dontcopy
Source: "InstallInboxAlarm.ps1"; Flags: dontcopy
Source: "ConnectInboxAlarms.ps1"; Flags: dontcopy
[Registry]
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms"; ValueType: string; ValueData: "URL:Estudiemos Alarmas"
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms"; ValueName: "URL Protocol"; ValueType: string; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms\shell\open\command"; ValueType: string; ValueData: "{sys}\wscript.exe ""{app}\AlarmLauncher.vbs"" ""%1"""
[Run]
Filename: "https://estudiemos-app.vercel.app/?alarms-setup=1"; Flags: shellexec nowait skipifsilent

[Code]
procedure CheckAlarmFile(Name: String);
begin
  ExtractTemporaryFile(Name);
  if GetSHA256OfFile(ExpandConstant('{app}\') + Name) <> GetSHA256OfFile(ExpandConstant('{tmp}\') + Name) then
    RaiseException('No se pudo verificar el componente de alarmas. Reintenta la instalacion.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CheckAlarmFile('AlarmLauncher.vbs');
    CheckAlarmFile('InboxAlarm.ps1');
    CheckAlarmFile('InstallInboxAlarm.ps1');
    CheckAlarmFile('ConnectInboxAlarms.ps1');
  end;
end;
