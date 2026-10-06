param([ValidateSet('new', 'legacy', 'foreign', 'collision')][string]$Scenario)
$ErrorActionPreference = 'Stop'
$script:tasks = @{}
$script:registrations = 0
$script:folderCreated = $false
$script:user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$installer = Join-Path $PSScriptRoot '../../windows-installer/InstallStreakReminders.ps1'
$reminder = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../windows-installer/StreakReminder.ps1'))

function New-TestTask {
  $actions = [pscustomobject]@{Count=0;Entries=@()}
  $actions | Add-Member ScriptMethod Create {param($type)
    $entry = [pscustomobject]@{Path='';Arguments='';WorkingDirectory=''}
    $this.Entries += $entry; $this.Count++; return $entry
  }
  $actions | Add-Member ScriptMethod Item {param($index) return $this.Entries[$index - 1]}
  $triggers = [pscustomobject]@{Entries=@()}
  $triggers | Add-Member ScriptMethod Create {param($type)
    $entry = [pscustomobject]@{Type=$type;StartBoundary='';DaysInterval=0}
    $this.Entries += $entry; return $entry
  }
  return [pscustomobject]@{
    RegistrationInfo=[pscustomobject]@{Description=''}
    Principal=[pscustomobject]@{UserId='';LogonType=3;RunLevel=0}
    Settings=[pscustomobject]@{Enabled=$true;Hidden=$false;DisallowStartIfOnBatteries=$true;StopIfGoingOnBatteries=$true;MultipleInstances=0;ExecutionTimeLimit=''}
    Actions=$actions;Triggers=$triggers
  }
}
$script:folder = [pscustomobject]@{}
$script:folder | Add-Member ScriptMethod GetTask {param($name)
  if (!$script:tasks.ContainsKey($name)) { throw 'Test task not found.' }
  return [pscustomobject]@{Definition=$script:tasks[$name]}
}
$script:folder | Add-Member ScriptMethod CreateFolder {param($name)
  if ($name -ne 'Estudiemos') { throw 'Unexpected task folder.' }
  $script:folderCreated=$true; return $script:folder
}
$script:folder | Add-Member ScriptMethod RegisterTaskDefinition {param($name,$task,$flags,$user,$password,$logon)
  if ($flags -ne 6 -or $null -ne $password -or $logon -ne 3 -or $user -ne $task.Principal.UserId) { throw 'Invalid task registration.' }
  $script:tasks[$name]=$task; $script:registrations++
}
$script:service = [pscustomobject]@{}
$script:service | Add-Member ScriptMethod Connect {}
$script:service | Add-Member ScriptMethod GetFolder {param($path)
  if ($path -eq '\Estudiemos' -and !$script:folderCreated) { throw 'Test folder not found.' }
  if ($path -notin @('\','\Estudiemos')) { throw 'Unexpected folder.' }
  return $script:folder
}
$script:service | Add-Member ScriptMethod NewTask {param($flags) return (New-TestTask)}
function New-Object {
  param([string]$ComObject)
  if ($ComObject -ne 'Schedule.Service') { throw 'Unexpected COM creation.' }
  return $script:service
}

if ($Scenario -ne 'new') {
  $task=New-TestTask
  $task.Principal.UserId=if($Scenario -eq 'foreign'){'S-1-5-21-test-other'}else{$env:USERNAME}
  $task.Settings.Enabled=$false
  $action=$task.Actions.Create(0)
  $action.Path='powershell.exe'
  $action.Arguments='-File "' + $reminder + '"'
  $trigger=$task.Triggers.Create(2);$trigger.StartBoundary='2026-01-01T12:15:00';$trigger.DaysInterval=2
  $name='Racha 12-00'
  if ($Scenario -eq 'collision') { $name += ' ' + $script:user; $action.Arguments='-File "C:\unrelated\other.ps1"' }
  $script:tasks[$name]=$task
}
$rejected=$false
try { . $installer; . $installer } catch { if($Scenario -ne 'collision'){throw};$rejected=$true }
$result=@($script:tasks.GetEnumerator() | ForEach-Object {
  $task=$_.Value;$action=$task.Actions.Item(1)
  [pscustomobject]@{name=$_.Key;user=$task.Principal.UserId;enabled=$task.Settings.Enabled;hidden=$task.Settings.Hidden;
    limit=$task.Settings.ExecutionTimeLimit;path=$action.Path;arguments=$action.Arguments;working=$action.WorkingDirectory;
    triggers=$task.Triggers.Entries}
})
@{tasks=$result;registrations=$script:registrations;rejected=$rejected;user=$script:user} | ConvertTo-Json -Depth 5 -Compress
