#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$taskName = 'ProWestJobFileGateway'
$gatewayPath = $PSScriptRoot
$configPath = Join-Path $gatewayPath '.env'
$entryPath = Join-Path $gatewayPath 'index.mjs'

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
  throw 'The gateway files or .env configuration are missing.'
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw "The $taskName startup task already exists; no changes were made."
}

$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument '--env-file=.env index.mjs' `
  -WorkingDirectory $gatewayPath
$principal = New-ScheduledTaskPrincipal `
  -UserId 'LOCALSERVICE' `
  -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $taskName `
  -Description 'Private Pro West job file gateway on 127.0.0.1:8787' `
  -Action $action `
  -Principal $principal `
  -Trigger $trigger `
  -Settings $settings | Out-Null

Write-Output "$taskName registered. Stop the interactive npm start process, then run Start-ScheduledTask -TaskName '$taskName'."
