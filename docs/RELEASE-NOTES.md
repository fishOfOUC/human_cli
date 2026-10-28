# human_cli v1.1.0

修正默认交互：请求用户协助，就在同一次调用中等待用户答复。

## 用法

```powershell
.\human_cli.exe request .\resources\app\examples\request.json
```

便签显示后，命令持续等待，用户点击“完成并回复”才返回最终结果。无需再补调 wait，不设用户操作期限。

MCP 的 human_request 同样默认等待并返回文字和图片。human_wait 用于断线后恢复等待或补取图片后续页。

只有明确需要后台创建时才使用：

```powershell
.\human_cli.exe request .\request.json --background
```

MCP 对应 background: true。旧脚本若依赖立即返回创建结果，应加上此显式选项。

断线缓存、日志恢复、图片分页、网络 SPI、主题和窗口记忆继续保留。CLI 通过 stderr 输出 waiting_for_user 和请求位置，最终回复通过 stdout 返回。

验证：49 项核心与集成测试，27 项原生窗口验收，17 项打包 CLI/MCP EXE 验收。新增测试明确覆盖“用户没有打完字，调用不得提前结束”。

下载 human_cli-v1.1.0-win32-x64.zip 并完整解压，无需安装 Node.js。CLI 为 human_cli.exe，桌面端为 human_cli-desktop.exe，MCP 入口为 human_cli.exe mcp。

完整说明：[README](https://github.com/fishOfOUC/human_cli#readme)。
