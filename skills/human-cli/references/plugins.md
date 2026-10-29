# 便签插件与脚本/程序启动入口

## 何时挂按钮

当用户需要打开某个操作程序、启动交互脚本、进入指定网页或采集现场信息时，把相应工具绑定到便签侧栏。用户左键点击才执行；右键或 Shift+F10 查看配置、结果与错误。创建请求不会自动执行按钮。

先调用 `human_plugins` / CLI `plugins` 检查已发现插件及 configSchema。现有内置插件为 `human.screenshot`、`human.open-url`、`human.clipboard`、`human.diagnostics`。打开网页可用 `human.open-url` 的 `url` 配置；**它不是任意程序/文件启动器**。当前没有内置的通用 `human.launch`，也没有 `ctx.exec` 或 `shell.exec` 这类声明能力，不能凭空调用。

脚本或程序启动入口需要实现一个插件。新插件推荐网络 SPI：提供者在用户机器上运行独立 HTTP 服务，human_cli 按协议发现插件、显示按钮、发起作业。语言不限；接入远程提供者会操作远程机器，不能用它代替用户本机的程序启动。

## 可运行的启动提供者

本 Skill 的 assets 包含一个只依赖 Python 3 标准库的 SPI 示例：

- [launch-provider.py](../assets/launch-provider.py)：HTTP JSON-RPC 提供者，实现发现、启动、状态、取消与释放。
- [launch-task.example.json](../assets/launch-task.example.json)：一个固定启动目标的配置。
- [manual-step.ps1](../assets/manual-step.ps1)：无副作用的交互示例脚本，显示提示并等待用户回车。

将这三个文件复制到稳定的本机插件目录，例如 `E:/Tools/human-cli-launcher`，将 `launch-task.example.json` 复制为 `task.json` 并修改目标。示例启动 Windows PowerShell 和同目录脚本；也可以改为 Python、某个 EXE 或其他解释器，使用参数数组：

```json
{
  "pluginId": "example.launch-preview",
  "name": "启动操作程序",
  "program": "powershell.exe",
  "args": ["-NoLogo", "-NoProfile", "-File", "manual-step.ps1"],
  "cwd": ".",
  "showConsole": true
}
```

`program` 可以是绝对路径或启动提供者时 PATH 能找到的可执行文件名。包含目录的相对 program、相对 cwd 均以 **task.json 所在目录** 为基准；args 不经过 shell，也不会自动插值。使用相对脚本参数时应让 cwd 指向脚本所在目录，复杂目标优先写绝对路径。启动 `.ps1` 用 `powershell.exe`/`pwsh.exe -File`，`.py` 用 Python 解释器，不把整条命令拼成一个字符串。程序运行所需的 Python、PowerShell 或其他环境由目标机器另行提供，human_cli 不内置这些依赖。

固定目标在提供者启动时读取，AI 绑定 config 为空对象。这样模型填写按钮参数不会意外改变要执行的命令。为不同目标使用不同 pluginId/端口或将提供者扩展为多插件目录；按钮名应清楚表示实际启动对象。只交付已获用户授权的操作程序，脚本启动入口不扩大原任务范围。

在本机启动服务（这一步只启动提供者，不启动操作程序）：

```powershell
python 'E:\Tools\human-cli-launcher\launch-provider.py' --task 'E:\Tools\human-cli-launcher\task.json' --port 7790
```

它输出一行包含 url/token 的本机连接信息，并持续运行；默认仅监听 127.0.0.1。需要固定令牌可预先设置 `HUMAN_CLI_SPI_TOKEN`。不要将令牌写进协助正文或公开日志。

在实际 human_cli 数据目录的 `plugins/providers.json` 中**合并新增**提供者，不覆盖其他条目。通常路径为 `%LOCALAPPDATA%/human_cli/plugins/providers.json`，自定义 HUMAN_CLI_DATA_DIR 或旧数据迁移环境应以实际目录为准：

```json
{
  "version": 1,
  "providers": [{
    "id": "local-launch-preview",
    "url": "http://127.0.0.1:7790/rpc",
    "token": "填写提供者输出的真实令牌",
    "enabled": true
  }]
}
```

human_cli 不自动启动外部提供者，也不热发现目录。让现有协助结束后重启桌面端，再查询插件目录，确认 `example.launch-preview` 存在。只重连 MCP 不保证重启已经运行的旧桌面端。

MCP 请求中绑定该按钮（这里只展示一个 plugins 元素，将它放进正常 human_request）：

```json
{
  "id": "launch-preview",
  "plugin": "example.launch-preview",
  "side": "right",
  "config": "{}"
}
```

CLI 的同一绑定改用 `"config": {}`。便签可写：“点击侧栏‘启动操作程序’，在弹出的窗口完成检查，然后回到便签说明结果，必要时附截图。”

示例语义是**启动后移交给用户**：收到进程 PID 即报告按钮执行成功，不等待程序退出，不代表检查通过。用户关闭便签不会终止已经打开的外部程序；取消只能阻止尚未执行的启动作业。示例对同一 runId 在同一提供者进程生命周期内不重复启动，forget 仍保留轻量收据。它不提供跨进程重启的持久去重；服务意外退出后，应先确认原程序是否已启动，再决定是否重新操作。不同点击会产生不同 runId，仍可以重复启动；需要单实例的程序应自行实现实例检查。

如果希望按钮覆盖整个长任务，需要扩展提供者，保持 running 直至真正完成，管理子进程及取消，并返回实际结果；不能把这个示例的“启动成功”文案直接改为“任务已完成”。

## 自己编写 SPI 插件

HTTP POST `/rpc`，`Content-Type: application/json`，配置令牌后验证 `Authorization: Bearer ...`。请求为 `{"jsonrpc":"2.0","id":"调用ID","method":"spi.describe","params":{}}`；响应回显 id，包含 result 或 error 之一。不要在 HTTP 处理线程中等待用户完成操作。

需要五个方法：

| 方法 | params | result / 行为 |
| --- | --- | --- |
| `spi.describe` | `{}` | `{spiVersion:1, plugins:[清单...]}` |
| `spi.start` | `runId, pluginId, request, config` | 快速返回 `{runId,state}`；相同 runId 重试不能重复执行副作用 |
| `spi.status` | `runId` | `{runId,state}`，完成时带 output，失败时带 error |
| `spi.cancel` | `runId` | 尽力停止该作业，返回当前状态；已发生的外部动作不能假装回滚 |
| `spi.forget` | `runId` | 释放已结束结果，返回 `{forgotten:true}`；不得释放运行中的作业 |

插件清单字段：

```json
{
  "apiVersion": 1,
  "id": "example.launch-preview",
  "version": "1.0.0",
  "name": "启动操作程序",
  "description": "用户点击后打开配置好的操作程序。",
  "icon": "terminal",
  "side": "right",
  "configSchema": {"type":"object","properties":{},"additionalProperties":false},
  "configUi": {"type":"none"}
}
```

网络清单不需要 entry 或 Node permissions。`configSchema` 是插件配置的 JSON Schema；需要用户选参数时定义 properties/required/default 等，宿主会校验配置。`configUi` 省略时由 Schema 生成通用表单，none 表示无需配置。全局插件 ID 要唯一，名称最长 60 字符，side 为 left/right。

状态为 `running`、`completed`、`failed`、`cancelled`。成功输出例如：

```json
{
  "runId": "00000000-0000-4000-8000-000000000001",
  "state": "completed",
  "output": {"text":"操作程序已启动；请在程序中完成操作后回复。","attachments":[]}
}
```

失败可返回 `state: failed` 和 `error: {code,message,details}`；JSON-RPC 层错误使用数值 code，并将应用错误码放到 data.code。保留可复制诊断，不把插件失败当成用户取消。

需要产出附件时，SPI output.attachments 元素是 `{name,mime,data}`，data 为规范 Base64。最多 8 个附件，PNG/JPEG/GIF/WebP 每个 1 字节至 5 MiB，普通文件每个最多 20 MiB；真实图片签名要与 MIME 相符。**这是插件到宿主的内部传输**，不是 AI 回复格式；宿主落盘后，对 AI 仍返回本机缓存绝对路径。不能在 SPI 附件中用提供者的任意文件路径代替内容，因为提供者可能在另一台机器上。

AI 更新/取消请求、用户完成或主动关闭时，宿主尽力取消仍在运行的插件作业；网络中断不能保证取消送达。提供者管理自己的作业与资源，不给人类协助设置截止时间。成功结果被宿主复制后会 forget，幂等收据与完整附件可以分别管理。

## 兼容格式与自定义配置页

已有 `manifest.json + plugin.mjs` 仍可放入数据目录的 `plugins/<插件目录>/`，由内置 SPI 提供者通过 Worker 适配。manifest 要包含 apiVersion/id/name/version/side/entry/permissions/configSchema；模块导出 `async run(ctx)`，返回 `{text,attachments?}`。该格式的附件为 `{name,mime,bytes}`，由适配器转为 SPI Base64。

可声明的宿主能力仅有 `screen.capture`、`clipboard.read`、`clipboard.write`、`shell.openUrl`、`system.info`；ctx 对应 `captureScreen`、`clipboard.readText/writeText`、`openUrl`、`systemInfo`，以及 request/config。Worker 不是安全沙箱，Node 插件仍是受信任代码。旧 Worker 默认 30 秒执行保护仅属于旧插件，不能当作用户操作期限。新启动插件优先采用上面的独立 SPI 提供者。

需要复杂配置页时，清单声明 `configUi: {type:"web",path:"/ui/settings"}`，实现 `spi.ui.open/status/resolve/close` 并托管同源页面。页面通过独立会话凭据提交配置，宿主校验和持久化后 resolve 接受，才显示保存成功；页面没有 Node 或宿主 IPC 能力，不携带 SPI 长期令牌。普通启动按钮不需要开发网页。进一步扩展时，以安装版附带的 `docs/CONFIG-UI.md` 为协议依据（便携包位于 `resources/app/docs/`）。
