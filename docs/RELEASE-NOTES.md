# human_cli v1.0.0

把用户包装成可调用的工具，配合 AI 完成工作。

## 安装与使用

下载 human_cli-v1.0.0-win32-x64.zip，解压整个目录。用户无需安装 Node.js。

```powershell
.\human_cli.exe --help
.\human_cli.exe plugins
.\human_cli.exe request .\resources\app\examples\request.json
.\human_cli.exe logs 50 0
```

请求返回 ID 后，运行 human_cli.exe wait <ID> 等待用户完成。CLI 会按需启动 human_cli-desktop.exe。不要只移动一个 EXE。

MCP 配置：command 指向解压后的 human_cli.exe，args 为 ["mcp"]。工具为 human_request、human_wait、human_get、human_update、human_cancel、human_list、human_logs、human_plugins。

## 功能

- 小型置顶便签；AI 管理任务，用户操作、附图、完成回复。
- 侧栏左键直接运行、右键共用配置结果页，按钮颜色显示状态。
- 本地回复缓存和日志路径，断线或 AI 重启后自行恢复，无接收回执和用户完成期限。
- 语言无关的 HTTP JSON-RPC SPI，附纯 Python 服务示例。
- 四种主题、位置尺寸记忆及多显示器工作区恢复。

完整说明与示例见 [README](https://github.com/fishOfOUC/human_cli#readme)。

当前发行针对 Windows x64、本机单用户 AI 通道。实际显示器拔插仍需硬件验收；不含签名安装器、自动更新或插件热重载。旧 Node Worker 兼容层不是安全沙箱。
