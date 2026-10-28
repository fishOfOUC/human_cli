# 验证记录

## 核心与协议

`npm test`：68 项通过，含按需进程生命周期和传输重试幂等测试。

覆盖请求参数、幂等重试、AI 版本更新、过期完成拒绝、完整错误附件、图片签名与大小、8 图上限、结果快照、等待与取消、监听器回收、运行防重、后台结果不污染完成回复、偏好与重启恢复。

新增默认行为回归：CLI request 和 MCP human_request 在同一次调用内创建、等待并返回回复。用户仍在打字时 stdout 无完成输出，进程/工具调用不结束；点击完成后返回最终文字和图片。后台创建必须显式选择，拼错参数不会悄悄改变行为。默认请求中途断线仍可从日志恢复。真实 Electron 中也验证默认 CLI 请求经过输入、草稿持久化及完成按钮，才返回回复。

新增验证：用户等待不创建期限定时器，模拟一天离开仍保留请求。真实 MCP 客户端超时、断开后，新客户端调用 human_logs，不依赖原 requestId 就能找到回复文件，自行读取 UTF-8 文字及原始图片。无需回执，工具目录不含 human_ack。

更名兼容验证包括 HUMAN_CLI_DATA_DIR 优先、旧 RELAY_DATA_DIR 与 RelayNote 数据目录回退、内置插件 ID 和默认配置迁移。

缓存验证包括按创建时间排序及分页、绝对路径、便签与回复 JSON、附件字节一致、重启重建丢失缓存、旧回执数据迁移保留、丢弃后删除回复文件与无引用图片、保留请求日志及独立工具结果。多张大图分页，每页控制在 MCP 默认缓冲限制内。

使用真实 MCP SDK stdio 客户端启动 `adapters/mcp.mjs`，验证工具列表、创建请求、等待、图片内容块、版本更新和取消。服务端使用临时数据目录，用户完成由领域服务模拟；这部分不声称是桌面点击验收。

网络 SPI 验证包括内置插件通过真实 HTTP 执行、二进制无损往返、作业超过单次连接时限仍继续运行、AI 取消传播、远端诊断保留、认证、runId 幂等、forget、不可达提供者隔离及无效 Base64 拒绝。独立启动 Python 标准库服务，验证中文配置及真实图片字节回传，不依赖 Node 插件加载。

旧插件兼容验证包括无需改核心加载示例插件、声明能力校验、Worker 执行超时、AI 取消停止 Worker、损坏清单拒绝、重复 ID 拒绝和插件被移除后保留历史。旧 Worker 超时不是用户协助期限。

显示器验证为纯函数测试：负坐标的左侧屏幕、原显示器断开迁回主屏、工作区缩小、DPI 改变不重复缩放。未声称实际拔插硬件验收。

## 构建

`npm run build`：通过。字体等资源本地打包，不依赖 Google Fonts 网络服务。前端样式检查 0 FAIL / 0 WARN；`git diff --check` 无空白错误。

## 原生验收

提供 `npm run test:native`。它启动专用临时数据目录的真实 Electron，测试原生置顶、窗口尺寸、AI 请求触发窗口、真实截图、preload IPC、右键结果、主题广播与保存、图片上传、MCP 图片回传、窗口几何记忆以及收起不取消。

测试只操作 human_cli 自己的 DOM 和窗口，不发送全局鼠标或键盘输入；会进行一次真实屏幕截图。生成的报告与截图保存在忽略的 `.qa/native-*/` 下，测试截图不进入发布包或 Git。

真实 Windows 原生验收：25 项通过，报告为 `.qa/native-f2e5225e/report.json`。覆盖真实屏幕 PNG、截图隐藏/恢复、图片上传/粘贴/拖入 IPC、MCP 四张图片回传、日志及缓存文件、主题与置顶、窗口几何记忆、最小化恢复、并行任务及结束窗口销毁。旧“回复已保存”和丢弃结果页已按新生命周期移除，不再作为界面验收项；缓存丢弃与删除能力仍有领域测试覆盖。

新增 `npm run test:lifecycle`，12 项真实进程验证通过，报告 `.qa/lifecycle-f772fd2b/report.json`。启动无主界面、无任务自行退出；任务进行中 CLI 保持等待；任务完成销毁对应窗口；其他任务不受影响；最后一个任务的响应传完后进程退出；重启查询历史不打开窗口，查询结束后也不常驻。

Windows 在 125% 缩放下的物理像素 / DIP 取整会造成少量尺寸偏差。窗口初次显示后校正，并用可表示的 DPI 网格保存尺寸，避免恢复时逐次增大。对应新增纯函数测试。原生测试允许恢复后的 1 DIP 取整误差，不把这个误差当作布局适配或硬件拔插验收。

四种主题已在真实 Electron 窗口截图检查，产物 `.qa/visual-b5ca781b/`，覆盖纸黄、雾绿、浅色、深色及深色设置页。

## 便携包

Windows x64 便携包使用真实 MCP 客户端调用包内适配器，自动启动打包后的 `human_cli-desktop.exe`，通过网络 SPI 查询到 4 个内置插件，并完成创建 / 即时查询 pending / AI 取消 / 日志定位缓存文件，未手动提前打开桌面端。对应验收脚本为 `tests/autostart-smoke.mjs`；结果写入 `.qa/autostart-*/acceptance.json`。每次更新打包后运行此检查，并对 core、desktop、plugins、adapters、dist、docs、examples 与包内文件做 SHA256 一致性核对。

当前本地预览原生 EXE 入口验收通过 20 项，脚本为 tests/packaged-cli-smoke.mjs，报告为 `.qa/cli-中文 空格-mAmTW6/acceptance.json`：清空子进程 PATH，在含中文和空格的发布路径运行帮助、错误退出码、JSON 文件/标准输入、get/list/logs/result、wait/cancel、参数引号和反斜杠，并通过 human_cli.exe mcp 连接真实 MCP SDK。测试驱动本身使用 Node，受测 CLI/MCP 不依赖系统 Node。

另在实际 PowerShell 中验证 EXE 输出可通过 ConvertFrom-Json 管道解析，成功返回 0、未知命令返回 1。启动器导入表仅依赖 Windows 自带 KERNEL32.dll、msvcrt.dll。

## 自定义配置界面（本地新增，未发布）

新增 12 项协议与领域验证：schema 兼容、同源路径校验、保存后执行采用新配置、关闭与失效会话、无效提交重试、配置冲突、AI 更新/完成/取消、保存响应丢失前后的幂等恢复、持久化失败回滚、运行中禁止保存及协议错误。

提供 npm run test:config-ui，真实 Electron 验证共用页嵌入、原左键/右键语义、自定义交互和实时预览、保存与草稿保留、错误可复制、Node/宿主桥/凭据隔离、独立 Cookie、同源请求与导航、弹窗和窗口几何限制、断线时保留输入、关闭取消、404/打开失败、主题传入、缩放和 AI 取消。仅使用专用 .qa 数据目录，测试提供者不进入用户插件目录或打包产物。

原生网页验收通过 25 项。原生窗口使用 PrintWindow 捕获，仅包含受测窗口及其嵌入页面；处理了 Windows DPI 虚拟化。主 WebContents.capturePage 不含原生子视图，因此另保留插件页面截图。

本地网页配置最新报告：`.qa/config-ui-9866e4fc/report.json`（25 项）。同目录 native-window.png 为完整原生窗口截图，provider-page.png 为独立配置页截图。

本地预览 EXE 回归通过 20 项，报告为 `.qa/cli-中文 空格-mAmTW6/acceptance.json`；release/config-ui-preview.json 记录预览目录，release/latest.json 继续指向原正式本地副本。测试提供者目录已确认不在预览包内。

生命周期规则见 [LIFECYCLE.md](LIFECYCLE.md)。当前变更仅在本地预览，未上传或发布。
