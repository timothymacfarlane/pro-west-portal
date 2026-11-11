#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$taskName = 'ProWestJobFileGateway'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $task) {
  Write-Output "$taskName is not registered."
  return
}

if ($task.State -eq 'Running') {
  Stop-ScheduledTask -TaskName $taskName
}
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Output "$taskName removed. Gateway files and the job share were not changed."
