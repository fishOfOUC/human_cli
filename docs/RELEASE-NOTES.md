# human_cli v1.2.0

新增“截图并附言”功能扩展示例：截取鼠标所在屏幕，自动附上 PNG 和一句话，保持正在输入的草稿。

## 使用

完整解压 human_cli-v1.2.0-win32-x64.zip，无需安装 Node.js。

把 resources/app/examples/plugins/cursor-capture-reply 复制到数据目录的 plugins 下，退出旧桌面端，再运行：

```powershell
.\human_cli.exe request .\resources\app\examples\cursor-capture-request.json
```

左键右侧相机按钮执行，右键配置附言、等待和自动附入。附言显示在回复框下方，可移除，完成时合并到最终回复。命令默认等待用户完成。

安装步骤见 [插件示例说明](https://github.com/fishOfOUC/human_cli/tree/main/examples/plugins/cursor-capture-reply)。

SPI 结果新增可选 replyText 字段，任何语言的提供者均可使用；未返回该字段的旧插件保持兼容。重复运行同一工具更新自己的附言，图片满 8 张时明确报错。

验证包含 54 项核心与集成测试、29 项原生窗口验收和 17 项打包 CLI/MCP EXE 验收。
