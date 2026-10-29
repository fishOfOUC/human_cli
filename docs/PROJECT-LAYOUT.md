# 项目文件说明

正式实现、开发工具、运行数据和历史资料分别保存。原始重构稿位于 `archive/prototype/rebuild/sticky-note.html`，原型目录整理前后按 SHA256 核对，文件内容不变；它不是运行中的界面。

| 路径 | 用途 |
| --- | --- |
| `src/`、`index.html` | 实际便签界面、样式、主题与页面入口；Vite 编译到 `dist/` |
| `public/` | 静态资源，包含 `favicon.svg`；Vite 原样复制到 `dist/` |
| `core/` | 任务、回复、附件、缓存、持久化与参数校验 |
| `desktop/` | Electron 窗口、四边缩放、显示器恢复、IPC、系统能力和按需退出 |
| `adapters/` | AI 使用的 CLI、MCP 和本机 HTTP 协议 |
| `plugins/` | 网络 SPI、网页配置会话和内置插件 |
| `scripts/` | 打包工具、原生 CLI 启动器 C 源码与 `launchers/` 开发启动脚本 |
| `tests/` | 自动验证、三个测试插件、独立验收服务与预览启动脚本 |
| `examples/` | 请求、插件与独立 Python SPI 服务示例 |
| `skills/human-cli/` | 随项目维护的 AI 使用 Skill、MCP/CLI 参考和程序启动插件示例 |
| `docs/` | 接入协议、架构、界面约定与验证说明；从 [文档索引](README.md) 查找 |
| `archive/prototype/` | 历史原型和用户提供的重构原稿，仅供参考 |
| `启动 human_cli.cmd` | 从源码构建并启动应用 |
| `查看界面.cmd` | 根目录的本地界面验收入口 |
| `release/` | 本地构建记录、当前使用的构建和历史发布包，详见下文 |
| `cache/` | 本机请求与回复缓存，保留原位置以便 AI 按绝对路径读取 |
| `.qa/`、`.taste-skill/` | 本地验证报告、截图、隔离测试数据与设计检查记录 |

根目录保留两个日常 CMD 入口。PowerShell 实现集中在 `scripts/launchers/`，原来的 Demo CMD 也移入该目录，继续转到同一源码启动流程。脚本按自身位置定位项目，不依赖调用时的工作目录。日常查看界面使用 `查看界面.cmd`。

从源码首次查看界面：

开发环境需要 Node.js 22.12 或更新版本；Windows 打包需要 MinGW-w64 GCC，也可用 `HUMAN_CLI_CC` 指定编译器路径。便携包使用者不需要这些开发工具。

```powershell
npm ci
npm run package
.\查看界面.cmd
```

预览脚本从本地构建记录中选择最新可用构建，也可用 `tests/Start-TestPlugins.ps1 -PreviewDirectory <目录>` 指定。每次验收使用独立数据目录；CLI 默认等待用户完成，不设置人类操作期限。

本地发布目录按用途区分：

| 路径 | 用途 |
| --- | --- |
| `release/latest.json` | 打包工具生成的最新构建指针 |
| `release/*preview.json`、`release/local-camera-test.json` | 既有预览和专项测试构建指针，保持有效 |
| `release/<时间戳>/` | 当前指针或本机配置引用的构建，保留原路径 |
| `release/archive/<时间戳>/` | 整理时未被上述入口引用的旧构建，完整保留 |
| `release/packages/` | 历史 ZIP 发布包及对应 SHA256 文件，保留原文件名 |
| `release/skills/` | 已导出的 Skill 交付物 |

本次构建移动的原路径与新路径记录在 `.qa/folder-cleanup-release-moves.json`。历史报告中写死的旧构建绝对路径可按此记录定位；测试用目录联接同步指向归档位置。后续 `npm run package` 仍在 `release/` 下生成新时间戳目录并更新 `latest.json`。

`node_modules/`、`dist/`、`release/`、`cache/`、`.qa/` 和 `.taste-skill/` 不提交 Git。本地 AI 客户端配置继续留在各客户端要求的位置。发行包使用编译后的界面、运行时代码、生产依赖及 CLI EXE；不带 `archive/`、测试、打包源码或开发启动脚本。运行时需要的 `desktop/capture-windows.ps1` 保留在发行包内。
