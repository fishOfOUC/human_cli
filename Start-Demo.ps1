$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'Start-human_cli.ps1')
exit $LASTEXITCODE
