# 截图并附言

插件 ID：example.cursor-capture-reply。

点击右侧相机书签，截取鼠标所在屏幕，临时隐藏便签后采集；自动附上 PNG 和“已截取鼠标所在屏幕，请查收截图。”。右键可改附言、截图等待和自动附入选项。

这是内置本机 SPI 提供者的能力插件示例：manifest.json 和 plugin.mjs 在其内部由 Worker 加载，复用 screen.capture；请求服务仍经 HTTP SPI 调用。插件本身只有一次截图调用和一个返回值，不需要修改前端或插件专用 IPC。

## 安装

使用 v1.2.0 或更新桌面端。把本目录复制到实际数据目录的 plugins/cursor-capture-reply 下，然后重启桌面端。默认数据目录为 %LOCALAPPDATA%/human_cli；若使用自定义或旧数据目录，以 human_cli.exe logs 返回的 cacheDirectory 的父目录为准。

```powershell
# 在解压后的便携目录中运行
$logs = .\human_cli.exe logs 1 0 | ConvertFrom-Json
$pluginRoot = Join-Path (Split-Path -Parent $logs.cacheDirectory) 'plugins'
New-Item -ItemType Directory -Path $pluginRoot -Force | Out-Null
Copy-Item -LiteralPath .\resources\app\examples\plugins\cursor-capture-reply -Destination $pluginRoot -Recurse
# 从托盘退出旧桌面端，再运行下面的请求；CLI 会自动启动桌面端。
.\human_cli.exe request .\resources\app\examples\cursor-capture-request.json
```

从源码试用时，复制 examples/plugins/cursor-capture-reply，再运行 node adapters/cli.mjs request examples/cursor-capture-request.json。

## 返回值

```javascript
return {
  text: message,
  replyText: message,
  attachments: [{name: '鼠标所在屏幕.png', mime: 'image/png', bytes}]
};
```

text 显示在工具结果页；replyText 是可选的回复附言。autoAttach 为 true 时，图片进入回复附件，附言显示在回复框下面，完成时拼入最终回复。它不改写正在编辑的草稿；可点叉移除。同一个按钮重复运行会更新自己的附言，避免重复插入文字。

任何独立网络 SPI 提供者也可使用 replyText 字段，最多 2000 字符。图片已满 8 张时会明确报错，移除一张后重试。
