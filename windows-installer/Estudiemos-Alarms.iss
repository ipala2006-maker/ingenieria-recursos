[Setup]
AppId={{10257322-F14A-47E1-9C71-03CB33D39726}
AppName=Alarmas de Estudiemos
AppVersion=2.1.0.0
ChangesAssociations=yes
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
VersionInfoVersion=2.1.0.0
VersionInfoDescription=Alarmas a pantalla completa de Estudiemos
[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
[Files]
Source: "StudyToast.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "AppLauncher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\icon-180.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\estudiemos.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "AlarmLauncher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "InboxAlarm.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "InstallInboxAlarm.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "ConnectInboxAlarms.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "ReadAlarmConnection.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "ReadLocalAlarms.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "InboxAlarm.ps1"; DestDir: "{localappdata}\Estudiemos\Windows"; Flags: ignoreversion; Check: LegacyWindowsSupport
Source: "StreakReminder.ps1"; DestDir: "{localappdata}\Estudiemos\Windows"; Flags: ignoreversion; Check: LegacyWindowsSupport
Source: "ReadLocalAlarms.ps1"; DestDir: "{localappdata}\Estudiemos\Windows"; Flags: ignoreversion; Check: LegacyWindowsSupport
Source: "StudyToast.ps1"; DestDir: "{localappdata}\Estudiemos\Windows"; Flags: ignoreversion; Check: LegacyWindowsSupport
Source: "AlarmLauncher.vbs"; Flags: dontcopy
Source: "InboxAlarm.ps1"; Flags: dontcopy
Source: "InstallInboxAlarm.ps1"; Flags: dontcopy
Source: "ConnectInboxAlarms.ps1"; Flags: dontcopy
Source: "ReadAlarmConnection.ps1"; Flags: dontcopy
Source: "ReadLocalAlarms.ps1"; Flags: dontcopy
[Icons]
Name: "{userprograms}\Estudiemos Alarmas"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\AppLauncher.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\estudiemos.ico"; AppUserModelID: "Estudiemos.Study"; AppUserModelToastActivatorCLSID: "77039F73-07C3-4E4C-9DFA-B3A4809C5C79"
[Registry]
Root: HKCU; Subkey: "Software\Classes\AppUserModelId\Estudiemos.Study"; ValueName: "DisplayName"; ValueType: string; ValueData: "Estudiemos"
Root: HKCU; Subkey: "Software\Classes\AppUserModelId\Estudiemos.Study"; ValueName: "IconUri"; ValueType: string; ValueData: "{app}\icon-180.png"
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms"; ValueType: string; ValueData: "URL:Estudiemos Alarmas"
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms"; ValueName: "URL Protocol"; ValueType: string; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\estudiemos-alarms\shell\open\command"; ValueType: string; ValueData: "{sys}\wscript.exe ""{app}\AlarmLauncher.vbs"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.estudiemos-alarmas"; ValueType: string; ValueData: "Estudiemos.AlarmConnection"
Root: HKCU; Subkey: "Software\Classes\Estudiemos.AlarmConnection"; ValueType: string; ValueData: "Conexion de alarmas de Estudiemos"
Root: HKCU; Subkey: "Software\Classes\Estudiemos.AlarmConnection\DefaultIcon"; ValueType: string; ValueData: "{sys}\shell32.dll,110"
Root: HKCU; Subkey: "Software\Classes\Estudiemos.AlarmConnection\shell\open\command"; ValueType: string; ValueData: "{sys}\wscript.exe ""{app}\AlarmLauncher.vbs"" ""%1"""
[Run]
Filename: "https://estudiemos.estudiemos-services.workers.dev/?alarms-setup=1"; Flags: shellexec nowait skipifsilent

[Code]
function LegacyWindowsSupport: Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\Estudiemos\Windows\InboxAlarm.ps1')) or
    FileExists(ExpandConstant('{localappdata}\Estudiemos\Windows\StreakReminder.ps1'));
end;

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
    CheckAlarmFile('ReadAlarmConnection.ps1');
    CheckAlarmFile('ReadLocalAlarms.ps1');
  end;
end;
