# 项目文件说明

正式实现、开发验收与原始设计稿分开保存。原始重构稿已从 `ui__rebuild/sticky-note.html` 原样归档到 `prototype/rebuild/sticky-note.html`，迁移时核对 SHA256；它不是运行中的界面。

| 路径 | 用途 |
| --- | --- |
| `src/`、`index.html`、`favicon.svg` | 实际便签界面、样式、主题与页面入口；Vite 编译到 `dist/` |
| `core/` | 任务、回复、附件、缓存、持久化与参数校验 |
| `desktop/` | Electron 窗口、四边缩放、显示器恢复、IPC、系统能力和按需退出 |
| `adapters/` | AI 使用的 CLI、MCP 和本机 HTTP 协议 |
| `plugins/` | 网络 SPI、网页配置会话和内置插件 |
| `scripts/` | 打包工具与原生 CLI 启动器的 C 源码，仅构建时使用 |
| `tests/` | 自动验证、三个测试插件、独立验收服务与预览启动脚本 |
| `examples/` | 请求、插件与独立 Python SPI 服务示例 |
| `docs/` | 接入协议、架构、界面约定与验证说明 |
| `prototype/` | 历史原型和用户提供的重构原稿，仅供参考 |
| `查看界面.cmd` | 根目录的本地界面验收入口 |

根目录的其他 CMD/PowerShell 启动文件是原有开发入口，保留兼容；日常查看界面统一使用 `查看界面.cmd`。界面改动完成后，应先验证、更新本地构建，再启动验收便签供用户检查。

从源码首次查看界面：

开发环境需要 Node.js 22.12 或更新版本；Windows 打包需要 MinGW-w64 GCC，也可用 `HUMAN_CLI_CC` 指定编译器路径。便携包使用者不需要这些开发工具。

```powershell
npm ci
npm run package
.\查看界面.cmd
```

预览脚本从本地构建记录中选择最新可用构建，也可用 `tests/Start-TestPlugins.ps1 -PreviewDirectory <目录>` 指定。每次验收使用独立数据目录；CLI 默认等待用户完成，不设置人类操作期限。

`node_modules/`、`dist/`、`release/`、`.qa/` 和 `.taste-skill/` 不提交 Git。发行包使用编译后的界面、运行时代码、生产依赖及 CLI EXE；不带原型、测试、打包源码或根目录的开发启动脚本。运行时需要的 `desktop/capture-windows.ps1` 保留在发行包内。
