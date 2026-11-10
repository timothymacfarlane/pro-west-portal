$ErrorActionPreference = 'Stop'

$installDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ProWest\JobFolderOpener'
$installedExe = Join-Path $installDir 'ProWestJobFolderOpener.exe'
$protocolKey = 'HKCU:\Software\Classes\prowest-job'
$commandKey = Join-Path $protocolKey 'shell\open\command'
$expectedCommand = '"{0}" "%1"' -f $installedExe

if (Test-Path -LiteralPath $commandKey) {
    $registeredCommand = (Get-Item -LiteralPath $commandKey).GetValue('')
    if ($registeredCommand -ne $expectedCommand) {
        throw 'The prowest-job link is registered to a different application. Nothing was removed.'
    }
    Remove-Item -LiteralPath $protocolKey -Recurse -Force
}

if (Test-Path -LiteralPath $installedExe -PathType Leaf) {
    Remove-Item -LiteralPath $installedExe -Force
}

Write-Host 'Pro West Job Folder Opener uninstalled for the current Windows user.'
