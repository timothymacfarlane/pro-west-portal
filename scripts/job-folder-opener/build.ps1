$ErrorActionPreference = 'Stop'

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'The Windows .NET Framework C# compiler is unavailable on this computer.'
}

$outputDir = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$helperExe = Join-Path $outputDir 'ProWestJobFolderOpener.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ "/out:$helperExe" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'JobLink.cs') (Join-Path $PSScriptRoot 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build the job folder opener.' }

$testExe = Join-Path $outputDir 'JobLinkTests.exe'
& $compiler /nologo /target:exe /platform:anycpu /optimize+ "/out:$testExe" (Join-Path $PSScriptRoot 'JobLink.cs') (Join-Path $PSScriptRoot 'tests\JobLinkTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build the job link tests.' }

& $testExe
if ($LASTEXITCODE -ne 0) { throw 'Job link validation failed.' }

Write-Host "Built $helperExe"
