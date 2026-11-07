$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Start-askForUserHelp.ps1')
exit $LASTEXITCODE
