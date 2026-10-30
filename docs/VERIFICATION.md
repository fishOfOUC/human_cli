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

`npm run build`：通过。界面使用系统字体及本地资源，不依赖外部字体或 CDN 服务。前端样式检查 0 FAIL / 0 WARN；`git diff --check` 无空白错误。

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

## 新界面迁移（本地）

迁移来源为用户提供的 archive/prototype/rebuild/sticky-note.html，按用户选择保留原来的小便签尺寸。测试与截图均使用独立 .qa 数据目录，原稿及测试服务不随产品打包。

本次验证结果：68 项核心测试；25 项原生流程（`.qa/native-1ce873e3/report.json`）；25 项网页配置（`.qa/config-ui-3bee2f36/report.json`）；12 项生命周期（`.qa/lifecycle-7a6fb298/report.json`）；16 项迁移界面检查（`.qa/rebuild-c801a9b3/report.json`）；20 项打包 CLI/MCP（`.qa/cli-中文 空格-4OH0we/acceptance.json`）。四主题及扩大尺寸截图已检查，默认小尺寸与最小尺寸控制区均通过测量。

界面验收反馈修正：70 项核心测试通过；28 项迁移界面验证通过（`.qa/rebuild-52547165/report.json`），其中四边四角使用 Electron 向受测窗口发送鼠标事件，经真实 preload/IPC 更新原生 bounds。DIP 指针坐标只在测试进程中注入，不移动系统鼠标。另验证空回复直接完成与仅图片回复保留附件。网页配置 25 项（`.qa/config-ui-9f37b081/report.json`）、生命周期 12 项（`.qa/lifecycle-eaef8049/report.json`）通过。

修正版本的本地 EXE 验证通过 20 项（`.qa/cli-中文 空格-xEFbVL/acceptance.json`）。显示器变化会中断旧缩放会话；此项使用测试进程中的屏幕度量事件验证，未声称实际拔插硬件。

项目整理后再次通过 70 项核心测试及 20 项打包 CLI/MCP 检查（`.qa/cli-中文 空格-hl2lOQ/acceptance.json`）。新包确认不包含原型、测试、打包源码、根目录开发启动脚本或已移除的字体依赖；所需的 Windows 截图桥仍在 desktop 目录内。原始重构稿按 SHA256 原样归档，现位于 archive/prototype/rebuild。

回复区精简：30 项界面检查通过（`.qa/rebuild-ba4c62f9/report.json`），确认无上传按钮、保存标签或 textarea 原生缩放手柄，回复框覆盖输入容器的九成以上，顶部标题栏与任务标题标记为原生拖动区。25 项原生检查通过（`.qa/native-96008858/report.json`），覆盖回复框拖入图片、粘贴图片、整张便签拖入图片，以及 MCP 图片回传。

后续验收纠正：回复框恢复约 64px 默认高度及占位提示，增加整条上下边缘的高度调整区域。32 项界面检查通过（`.qa/rebuild-0e75fda5/report.json`），使用受测 WebContents 的鼠标事件分别验证上下边调整回复框高度，窗口大小保持不变；窗口顶部标题栏负责移动，输入框无右下角原生手柄。

回复框下边联动修正已通过 33 项界面检查，报告见最新 .qa/rebuild-*/report.json。专门核对回复框上边坐标固定、下边坐标和窗口高度等量改变，以及向上回拖时一起缩短。

## v2 有序回复与路径附件（2026-10-29）

默认回复改为 schemaVersion=1、有序 content[]，图片与普通文件只交付缓存绝对路径。回复缓存默认在软件目录/cache，状态及原始附件仍使用原数据目录；测试通过 HUMAN_CLI_CACHE_DIR 隔离缓存，不触碰日常数据。

- 81 项核心/适配器/编辑模型测试通过，日志 `.qa/response-tests-final.log`。新增文字/图片/文件/诊断穿插、异步上传乱序、失败重试与阻止提交、空文件和同名文件、附件归属、完成失败回滚、旧记录迁移、软件目录移动后路径重建、CLI/MCP 一致性及显式 legacy 兼容。
- 10 项真实有序回复验收：`.qa/ordered-reply-2674107c/report.json`。通过受测 Electron WebContents 向真实编辑器派发粘贴/拖放/按钮事件，经 preload/IPC 和真实存储，验证“文 → 图 → 文 → 文件 → 文”、上移下移、损坏图片阻止完成、CLI/MCP JSON 完全一致及路径原始字节可读。浅色和深色截图已检查；不操作系统鼠标或键盘。
- 25 项原生流程：`.qa/native-89f5d8eb/report.json`；12 项生命周期：`.qa/lifecycle-d84acf2d/report.json`；33 项便签迁移/缩放/四主题：`.qa/rebuild-431448f5/report.json`；25 项插件网页配置：`.qa/config-ui-c0562297/report.json`，均通过。
- 发布包 EXE/MCP 通过 21 项检查：`.qa/cli-中文 空格-Vd4jD2/acceptance.json`。受测子进程 PATH 为空，验证不依赖系统 Node、中文及空格路径、UTF-8 标准输入、同次等待、取消、按需启动/退出、MCP 以及默认缓存确实位于发布软件目录。打包排除源码根缓存与测试目录，便携 ZIP 也排除根目录验收缓存。
- 延用现有便签样式与主题令牌，新增有序编辑区的源样式检查通过（0 FAIL、0 WARN）。实际原生窗口截图与最小尺寸检查作为桌面 UI 验收依据。

软件目录搬迁、旧记录和存储故障恢复通过隔离目录/注入故障验证；不宣称实际拔插硬件或真实磁盘耗尽。

## v2.0.1 MCP strict 声明兼容（2026-10-29）

- 88 项自动化测试通过：`.qa/strict-schema-tests-final.log`。新增闭合/required/nullable 声明、原有省略参数、默认值、任意插件 JSON 配置与旧对象兼容、配置内部 null 保留、无效 JSON、UUID/范围/长度校验，以及局部更新不清空未提供字段。
- 真实 MCP 调用验证 strict 风格完整 null 参数与旧式最少参数都可用，包含创建、查询日志、更新及取消；无效配置不会创建便签。服务端没有删除原有业务校验。
- 本机 CodeBuddy Code 2.178.1 的真实转换器复测：`.qa/codebuddy-schema-after.json`。只从已安装 dist/codebuddy.js 提取转换模块，在隔离 VM 中执行其开放对象检查和 strict 准备逻辑，不启动模型、不加载账号、不修改客户端。原工具列表在本机测得 3 项转换失败；修复后 3 次连接 × 每次 2 次 tools/list × 8 个工具，48 次转换全部成功。报告记录了客户端版本与 bundle SHA256。
- 10 项真实窗口与有序路径回复验收通过：`.qa/ordered-reply-c6ebe423/report.json`，确认文字/图片/文件顺序、保存失败保护、缓存字节、CLI/MCP 返回一致及无渲染错误。
- 发布包通过 22 项 EXE/MCP 检查：`.qa/cli-中文 空格-nIT4ye/acceptance.json`，包括空 PATH、中文/空格、同次等待、按需退出及发布版 strict 声明。包内 MCP 入口再次通过 48 次 CodeBuddy 转换，报告 `.qa/codebuddy-schema-packaged.json`。35 个运行模块与当前源码逐字节一致；便携 ZIP 排除根目录验收缓存。

可重复执行：`node tests/codebuddy-schema-smoke.mjs <已安装的dist/codebuddy.js> [修改前工具列表.json] [报告.json]`。转换模块提取以本机受测版本为准；客户端内部布局改变时测试会明确失败，不能静默跳过。更换软件后应重启旧桌面端并重连 MCP，使代码与工具声明刷新。

## v2.0.2 空内容确认与 MCP 空串占位（2026-10-29）

- 91 项自动化测试通过，日志 `.qa/confirmation-tests-final.log`。覆盖空文本/空白/only 完成标记、缓存及重启保留标记、human_get 可见性，有文字/图片/空文件时不误判为空，以及 pending/cancelled/discarded 不误标确认。
- 实际 MCP 调用传入 agent=""、idempotencyKey=""、format="" 后成功创建并在同次调用收到空提交说明。两次空幂等键调用生成不同请求与真实幂等键，不使用共享占位常量。必填标题、插件标识、有效幂等键以及插件内部空串保持原规则。
- 12 项真实窗口检查通过：`.qa/ordered-reply-ab14c0bd/report.json`。新增不输入内容直接点击完成，确认 AI 实际收到 confirmation_only，完整查询与持久完成结果也包含同一说明；有序图片/文件交付继续通过。
- 本机 CodeBuddy 转换器 48 次声明转换全部通过，报告 `.qa/confirmation-codebuddy-schema.json`。
- 发布包 22 项 EXE/MCP 检查通过：`.qa/cli-中文 空格-XgO6Ao/acceptance.json`；包内声明另经 48 次 CodeBuddy 转换，报告 `.qa/confirmation-codebuddy-packaged.json`。35 个运行模块与源码逐字节一致，文档 JSON 示例解析通过。已确认打包排除本地 .mcp.json，便携 ZIP 同时排除根目录验收缓存。

## v2.0.3 用户关闭控件（2026-10-29）

- 93 项自动化测试通过，日志 `.qa/user-close-tests-final.log`。新增用户关闭只取消目标、明确 cancelledBy=user、取消响应不携带草稿（含 legacy）、重复关闭与已完成竞争不误改状态、保存失败可重试及重启持久状态验证。
- 17 项真实窗口检查：`.qa/ordered-reply-33176802/report.json`，包含紧凑标题栏独立关闭/最小化控件、点击关闭向等待 AI 返回取消、保存草稿不作为回复交付、伴随请求继续等待、原生 close 事件与按钮同一路径，以及等待附件读取时仍可关闭。默认尺寸、浅色和深色截图已检查；不发送系统全局鼠标或按键。
- 12 项实际进程生命周期：`.qa/lifecycle-37244fb1/report.json`，验证最后一项由用户关闭后真实进程退出，重启无取消任务窗口复活，缓存查询可继续恢复历史。
- 25 项插件配置页检查：`.qa/config-ui-f3557017/report.json`，包括通过新关闭按钮取消任务并释放配置页会话。界面源码风格检查为 0 FAIL、0 WARN。
- 33 项便签界面回归：`.qa/rebuild-9d6264b9/report.json`，覆盖四主题、最小尺寸、窗口与回复框边缘缩放及完成流程。
- v2.0.3 便携包 EXE/MCP 通过 22 项检查：`.qa/cli-中文 空格-qjIm3V/acceptance.json`。35 个运行模块及 4 个前端产物与工作区逐字节一致，包内排除本地 MCP 配置及测试目录，便携 ZIP 排除根目录验收缓存。

## 编辑器组合输入回归（2026-10-30）

`npm run test:input` 通过 18 项检查，报告 `.qa/input-1793321169396/report.json`。在独立数据和缓存目录中启动隐藏的 Electron 窗口，通过 Chromium 原生组合输入接口验证自动保存、光标选区、拼音停顿后继续输入、组合提交/取消、快捷键、外部任务与主题更新、便签间通知隔离、附件异步完成及多段回复。测试不发送系统全局鼠标或按键，不等同于特定第三方输入法的逐项实机验收。

同轮核心测试 93 项、有序回复 17 项、界面与缩放 33 项、插件配置界面 25 项均通过；构建和打包成功。

## 目录整理与提交前回归（2026-10-30）

- `npm test` 93 项通过，`npm run build` 通过；日志分别为 `.qa/github-submit-tests.log`、`.qa/github-submit-build.log`。静态图标从 `public/` 正常复制到构建目录。
- 有序回复与关闭控件原生检查 17 项通过：`.qa/ordered-reply-ffba269a/report.json`；实际进程生命周期检查 12 项通过：`.qa/lifecycle-6d725dd0/report.json`。
- `skills/human-cli/` 格式检查通过，12 段 JSON 示例可解析，MCP/CLI 请求示例通过实际契约校验。启动提供者经真实 HTTP SPI、NetworkPluginHost 与 RequestService 验证 7 项通过：`.qa/skill-launch-cf2555af/report.json`。使用隔离目录及后台测试子程序，未声称验证交互窗口的视觉表现。
- 11 个历史原型文件迁移至 `archive/prototype/` 后，与 Git 原版本对象逐字节一致；`public/favicon.svg` 同样一致。迁移后的 PowerShell 启动脚本语法检查通过，未执行会打开日常应用的启动脚本。
