$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$demoUrl = 'http://127.0.0.1:5173'

try {
    $demoResponse = Invoke-WebRequest -Uri $demoUrl -UseBasicParsing -TimeoutSec 2
    if ($demoResponse.Content -match 'Agent 协作便签') {
        Start-Process $demoUrl
        exit 0
    }
    throw '端口 5173 已由其他服务使用，请先释放该端口。'
} catch {
    if ($_.Exception.Message -like '*端口 5173*') { throw }
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '未找到 Node.js / npm。请先安装 Node.js 22 或更新版本。'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& npm.cmd run dev -- --port 5173 --strictPort --open
exit $LASTEXITCODE

