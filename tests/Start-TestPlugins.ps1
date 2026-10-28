param([string]$PreviewDirectory)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (!$PreviewDirectory) {
    $pointer = Get-Content -LiteralPath (Join-Path $repo 'release/config-ui-preview.json') -Raw | ConvertFrom-Json
    $PreviewDirectory = $pointer.directories[0]
}
$cli = Join-Path $PreviewDirectory 'human_cli.exe'
$desktop = Join-Path $PreviewDirectory 'human_cli-desktop.exe'
if (!(Test-Path -LiteralPath $cli) -or !(Test-Path -LiteralPath $desktop)) { throw '请先准备含配置界面功能的本地预览版。' }
$run = Join-Path $repo ('.qa/acceptance-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$oldData = $env:HUMAN_CLI_DATA_DIR
$oldNode = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    $providerScript = Join-Path $PSScriptRoot 'acceptance-provider.mjs'
    $providerArgs = @('"{0}"' -f $providerScript; '"{0}"' -f $run)
    $provider = Start-Process -FilePath $desktop -ArgumentList $providerArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run 'provider.log') -RedirectStandardError (Join-Path $run 'provider-error.log') -PassThru
    $env:ELECTRON_RUN_AS_NODE = $oldNode
    $ready = Join-Path $run 'provider-ready.json'
    $startupDeadline = [DateTime]::UtcNow.AddSeconds(15)
    while (!(Test-Path -LiteralPath $ready)) {
        if ($provider.HasExited -or [DateTime]::UtcNow -gt $startupDeadline) { throw "测试服务未就绪，请查看 $run/provider-error.log" }
        Start-Sleep -Milliseconds 100
    }
    $request = @{
        title = '三种插件验收'; agent = '本机验收'; project = '仅本地测试'
        description = '侧栏从上到下：网页配置、简单配置、无需配置。左键直接执行，右键查看配置或结果。验收后可以在回复中说明问题。'
        steps = @('网页：右键修改并保存，再左键执行'; '简单：展开工具设置，保存后左键执行'; '无配置：左键执行，右键查看计数结果')
        plugins = @(@{id='web';plugin='acceptance.web';config=@{}}, @{id='simple';plugin='acceptance.simple';config=@{}}, @{id='plain';plugin='acceptance.none';config=@{}})
    }
    $requestPath = Join-Path $run 'request.json'
    [IO.File]::WriteAllText($requestPath, ($request | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $repo '.qa/acceptance-current.json'), (@{runDirectory=$run;previewDirectory=$PreviewDirectory;providerPid=$provider.Id} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $env:HUMAN_CLI_DATA_DIR = Join-Path $run 'data'
    Write-Host "验收环境：$run"
    Write-Host 'CLI 将持续等待你的回复。完成后便签消失，桌面端与测试服务自动退出。'
    & $cli request $requestPath
    if ($LASTEXITCODE -ne 0) { throw "CLI 返回错误：$LASTEXITCODE" }
} finally {
    $env:HUMAN_CLI_DATA_DIR = $oldData
    $env:ELECTRON_RUN_AS_NODE = $oldNode
}
