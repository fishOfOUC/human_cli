$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22 或更新版本。' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& npm.cmd start
exit $LASTEXITCODE
