#define AppVersion "1.2.4"
#define RainmeterInstaller "Rainmeter-4.5.26.exe"

[Setup]
AppId={{A75D2076-BCB9-4C41-A079-FE92871549C4}
AppName=Estudiemos para Windows
AppVersion={#AppVersion}
AppPublisher=Estudiemos
AppPublisherURL=https://estudiemos-app.vercel.app/
AppSupportURL=https://estudiemos-app.vercel.app/
DefaultDirName={localappdata}\Estudiemos\Windows
CreateAppDir=yes
Uninstallable=no
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
DisableWelcomePage=yes
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=yes
DisableFinishedPage=no
AllowCancelDuringInstall=no
SetupLogging=yes
CloseApplications=force
Compression=lzma2/ultra64
SolidCompression=yes
OutputDir=..\downloads
OutputBaseFilename=Estudiemos-Para-Windows
SetupIconFile=..\assets\estudiemos.ico
VersionInfoVersion={#AppVersion}
VersionInfoCompany=Estudiemos
VersionInfoDescription=Instalador de Estudiemos y sus widgets de escritorio
VersionInfoProductName=Estudiemos para Windows

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "vendor\{#RainmeterInstaller}"; Flags: dontcopy
Source: "WidgetLauncher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "StreakReminder.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\windows-rainmeter\Skins\Estudiemos\*"; DestDir: "{code:GetSkinDirectory}\Estudiemos"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\windows-rainmeter\Plugins\64bit\WebView2.dll"; DestDir: "{userappdata}\Rainmeter\Plugins"; Flags: ignoreversion restartreplace

[Icons]
Name: "{userstartup}\Rainmeter"; Filename: "{code:GetRainmeterExecutable}"; WorkingDir: "{code:GetRainmeterDirectory}"; Comment: "Iniciar los widgets de Estudiemos con Windows"

[Registry]
Root: HKCU; Subkey: "Software\Classes\estudiemos-widgets"; ValueType: string; ValueData: "URL:Estudiemos Widgets"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\estudiemos-widgets"; ValueName: "URL Protocol"; ValueType: string; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\estudiemos-widgets\DefaultIcon"; ValueType: string; ValueData: "{app}\WidgetLauncher.vbs"
Root: HKCU; Subkey: "Software\Classes\estudiemos-widgets\shell\open\command"; ValueType: string; ValueData: "{sys}\wscript.exe ""{app}\WidgetLauncher.vbs"" ""%1"""

[Run]
Filename: "https://estudiemos-app.vercel.app/?windows-widgets-ready=1"; Flags: shellexec nowait

[Code]
const
  RainmeterInstallerName = '{#RainmeterInstaller}';

function GetRainmeterDirectory(Param: String): String;
begin
  Result := ExpandConstant('{autopf}\Rainmeter');
end;

function GetRainmeterExecutable(Param: String): String;
begin
  Result := AddBackslash(GetRainmeterDirectory('')) + 'Rainmeter.exe';
end;

function GetSkinDirectory(Param: String): String;
var
  IniPath: String;
begin
  IniPath := ExpandConstant('{userappdata}\Rainmeter\Rainmeter.ini');
  Result := GetIniString('Rainmeter', 'SkinPath', '', IniPath);
  if Result = '' then
    Result := ExpandConstant('{userdocs}\Rainmeter\Skins');
  Result := RemoveBackslashUnlessRoot(Result);
end;

procedure StopRainmeter;
var
  ResultCode: Integer;
  RainmeterExe: String;
begin
  RainmeterExe := GetRainmeterExecutable('');
  if FileExists(RainmeterExe) then
  begin
    Exec(RainmeterExe, '!Quit', GetRainmeterDirectory(''), SW_HIDE,
      ewWaitUntilTerminated, ResultCode);
    Sleep(1200);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  InstallerPath: String;
begin
  Result := '';

  if not FileExists(GetRainmeterExecutable('')) then
  begin
    ExtractTemporaryFile(RainmeterInstallerName);
    InstallerPath := ExpandConstant('{tmp}\') + RainmeterInstallerName;
    if (not Exec(InstallerPath, '/S', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or
       (ResultCode <> 0) then
    begin
      Result := 'No pudimos instalar el soporte de widgets. Cerrá el instalador e intentá nuevamente.';
      Exit;
    end;
  end;

  StopRainmeter;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  RainmeterExe: String;
  ReminderScript: String;
  TaskCommand: String;
begin
  if CurStep = ssPostInstall then
  begin
    RegDeleteValue(HKCU,
      'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder',
      'Rainmeter.lnk');

    RainmeterExe := GetRainmeterExecutable('');
    Exec(RainmeterExe, '', GetRainmeterDirectory(''), SW_SHOWNORMAL,
      ewNoWait, ResultCode);
    Sleep(1800);
    Exec(RainmeterExe, '!RefreshApp', GetRainmeterDirectory(''), SW_HIDE,
      ewWaitUntilTerminated, ResultCode);
    Exec(RainmeterExe, '!ActivateConfig "Estudiemos\Setup" "Setup.ini"',
      GetRainmeterDirectory(''), SW_HIDE, ewNoWait, ResultCode);

    ReminderScript := ExpandConstant('{app}\StreakReminder.ps1');
    TaskCommand := '/Create /F /SC DAILY /TN "Estudiemos\Racha 12-00" /ST 12:00 /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + ReminderScript + '"""';
    Exec(ExpandConstant('{sys}\schtasks.exe'), TaskCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    TaskCommand := '/Create /F /SC DAILY /TN "Estudiemos\Racha 14-30" /ST 14:30 /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + ReminderScript + '"""';
    Exec(ExpandConstant('{sys}\schtasks.exe'), TaskCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    TaskCommand := '/Create /F /SC DAILY /TN "Estudiemos\Racha 17-00" /ST 17:00 /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + ReminderScript + '"""';
    Exec(ExpandConstant('{sys}\schtasks.exe'), TaskCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    TaskCommand := '/Create /F /SC DAILY /TN "Estudiemos\Racha 19-30" /ST 19:30 /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + ReminderScript + '"""';
    Exec(ExpandConstant('{sys}\schtasks.exe'), TaskCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    TaskCommand := '/Create /F /SC DAILY /TN "Estudiemos\Racha 22-00" /ST 22:00 /TR "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""' + ReminderScript + '"""';
    Exec(ExpandConstant('{sys}\schtasks.exe'), TaskCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
