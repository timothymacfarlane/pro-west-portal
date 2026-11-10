$ErrorActionPreference = 'Stop'

$sourceExe = Join-Path $PSScriptRoot 'dist\ProWestJobFolderOpener.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
    throw 'Build the helper with build.ps1 before installing it.'
}

$installDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ProWest\JobFolderOpener'
$installedExe = Join-Path $installDir 'ProWestJobFolderOpener.exe'
$protocolKey = 'HKCU:\Software\Classes\prowest-job'
$commandKey = Join-Path $protocolKey 'shell\open\command'
$expectedCommand = '"{0}" "%1"' -f $installedExe

if (Test-Path -LiteralPath $commandKey) {
    $existingCommand = (Get-Item -LiteralPath $commandKey).GetValue('')
    if ($existingCommand -and $existingCommand -ne $expectedCommand) {
        throw 'Another application is registered for prowest-job links. Installation stopped.'
    }
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force

New-Item -Path $protocolKey -Force | Out-Null
Set-Item -LiteralPath $protocolKey -Value 'URL:Pro West Job Folder'
New-ItemProperty -LiteralPath $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path $commandKey -Force | Out-Null
Set-Item -LiteralPath $commandKey -Value $expectedCommand

Write-Host 'Pro West Job Folder Opener installed for the current Windows user.'
Write-Host 'Test from Chrome with prowest-job://open/9170, using a job folder that exists.'
