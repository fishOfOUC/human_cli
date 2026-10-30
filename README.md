# human_cli

**把用户包装成可调用的工具，配合 AI 完成工作。**

AI 不方便继续操作时，例如需要人工验证、登录、观察真实界面或截图确认，可以调用 human_cli，把任务交给用户。用户收到一张小型置顶便签，完成操作后附上文字、图片或诊断，再把结果返回给 AI。

AI 负责创建、更新和取消任务；用户负责需要人参与的那一步，也可主动关闭当前请求。用户操作没有固定完成时限。应用没有主界面或托盘；AI 请求才出现便签，完成或取消后便签立即消失，最后一项任务结束、响应传完后桌面进程自动退出。

## 下载与启动

从 [GitHub Releases](https://github.com/fishOfOUC/human_cli/releases/latest) 下载 Windows x64 便携包，解压整个目录。

- `human_cli.exe`：CLI 和 MCP 入口，供 AI 或终端调用。
- `human_cli-desktop.exe`：按需便签运行时，由 CLI 自动启动；没有任务时不显示窗口，并自动退出。

**用户无需安装 Node.js。** 两个 EXE、resources 和其他运行库必须放在同一目录，不能只复制一个 EXE。

## 用 CLI 把一项工作交给用户

在便携包目录中打开 PowerShell，先检查可用功能：

```powershell
.\human_cli.exe --help
.\human_cli.exe plugins
```

创建一个 UTF-8 的 `request.json`：

```json
{
  "title": "请帮我确认深色界面",
  "agent": "我的 AI",
  "description": "我已经完成修改，请打开应用的外观设置页检查实际效果。",
  "steps": ["进入设置 → 外观", "切换深色，检查文字和按钮", "截图并回复是否正常"],
  "expectation": "有问题时附图说明。",
  "plugins": [{
    "id": "capture",
    "plugin": "human.screenshot",
    "side": "right",
    "config": {"display": "primary", "autoAttach": true}
  }]
}
```

用一次调用请求协助并等待答复：

```powershell
.\human_cli.exe request .\request.json
```

这条命令会一直等待用户点击“完成并回复”，然后返回最终结果；用户还在输入时不会结束。正常使用不需要另调 wait。

也可以直接运行包内示例：

```powershell
.\human_cli.exe request .\resources\app\examples\request.json
```

| 命令 | 用途 |
| --- | --- |
| `request <file.json>` | 请求用户协助，默认等到完成后返回回复 |
| `request -` | 从标准输入读取 UTF-8 JSON，同样默认等待回复 |
| `request <file.json> --background` | 明确后台创建，立即返回便签 ID |
| `wait <ID>` | 恢复等待已有便签，例如断线后或后台模式 |
| `get <ID>` | 即时查询状态、草稿和工具结果 |
| `result <ID>` | 获取有序回复，图片与文件返回缓存绝对路径 |
| `logs [limit] [offset]` | 按创建时间倒序查询便签标题、时间、状态及缓存绝对路径 |
| `list` | 列出请求 |
| `cancel <ID> [原因]` | 由 AI 取消尚未完成的请求 |
| `plugins` | 查询可挂载的侧栏插件及配置 Schema |
| `mcp` | 启动 MCP stdio 服务 |

最终结果写入 stdout，格式为 UTF-8 JSON。等待开始时，stderr 输出 waiting_for_user 及请求 ID，便于中断后恢复；错误也写入 stderr，并返回非零退出码。帮助输出为文本。更新说明目前通过 MCP 的 human_update 提供。

仅需要后台模式时显式指定 --background，再用 wait 等待已有任务；后台结果使用 requestId。正常请求无需拆成两步。旧调用者可显式使用 --format legacy 或 MCP format=legacy，旧格式不能完整表达穿插顺序；新格式无自动“已完成”占位。

## MCP 接入

在支持 MCP 的 AI 客户端中配置，替换为实际解压路径：

```json
{
  "mcpServers": {
    "human_cli": {
      "command": "C:/Tools/human_cli/human_cli.exe",
      "args": ["mcp"]
    }
  }
}
```

AI 先调用 `human_plugins` 查询功能，再调用 `human_request` 请求用户协助；同一次调用会等待并返回回复，无需另调 human_wait。只有需要后台创建时才指定 background: true。接口还包括 human_get、human_update、human_cancel、human_list 和 human_logs，共 8 个工具。CLI/MCP 默认返回相同的有序 content：文字、图片/文件缓存路径与附入诊断。AI 使用自身工具按路径读取，不传 Base64 或图片内容块，无需图片分页或接收回执。

完整参数、有序回复和恢复流程见 [AI 接入说明](docs/AI-INTEGRATION.md)。

v2.0.1 的 MCP 工具声明兼容 strict 模式客户端，避免重复打印 Schema 转换告警。可选参数可省略或填 null，原有默认值与服务端校验保留；插件 config 支持 JSON 对象字符串并兼容旧对象写法，具体约定见 AI 接入说明。更换发布包后请重新连接 MCP，刷新工具列表。

v2.0.2 进一步兼容可选 Agent/幂等键等空串占位。用户直接空内容确认时，结果增加 submission.type=confirmation_only 的系统说明，AI 可以明确区分“仅提交完成确认”和“提交了正文/附件”。

## 断线与 AI 重启

便签、回复和附件统一保存在本地。AI 工具调用超时或退出，不会取消用户的任务；用户完成后便签消失，回复保存在本机缓存。AI 重启后调用日志接口：

```powershell
.\human_cli.exe logs 50 0
```

按标题和时间找到目标便签，读取 cache.replyPath 指向的回复 JSON，图片与文件位置在 content[].path。无需记住原来的请求 ID。没有回复时 replyPath 为 null，请先查看请求状态。

默认位置：

```text
<软件目录>/cache/<requestId>/
  request.json
  reply.json
  attachments/

%LOCALAPPDATA%/human_cli/
  state.json
  attachments/
  plugins/providers.json
```

回复缓存默认在 human_cli.exe 同目录的 cache 下，源码运行时在项目根目录/cache；与启动时的工作目录无关。HUMAN_CLI_CACHE_DIR 可显式覆盖缓存根目录（例如隔离测试）。HUMAN_CLI_DATA_DIR 仍覆盖状态、原始附件及配置目录，不改变默认回复缓存位置。为保留改名前的数据，如果新目录尚无状态且旧 RelayNote 目录存在状态，会继续使用旧目录；旧 RELAY_DATA_DIR 也作为兼容配置接受。升级前应退出旧桌面端。读取不删除缓存；完成后不保留供用户浏览的历史窗口。缓存清理能力保留在领域层。

## 用户如何操作便签

- 默认纸面约 320 × 360 DIP，两侧各 30 DIP 书签，不占满屏幕。
- **左键侧栏按钮直接执行工具；右键打开共用的配置与结果页。** 执行不会强制切换当前页。
- 灰 / 蓝 / 绿 / 红按钮分别表示待运行 / 运行中 / 成功 / 出错。完整错误可以复制、附到回复或保存为文本。
- 支持在文字光标处粘贴图片、拖入普通文件，文字与附件按编排顺序提交。附件可预览图片、上下移动、移除，失败时可重试；提交等待所引用附件保存完成。
- 每项请求最多 8 张图片、单图 5 MiB；普通文件单个 20 MiB，图片/文件最多 20 个引用块、不同附件总计 100 MiB。空文件允许提交。截图时临时隐藏便签，完成后恢复。
- Ctrl+Enter 完成并回复；侧栏支持 Enter / 空格执行、Shift+F10 查看详情。
- 拖动顶部标题栏移动，拖动四个边或四个角调整大小；下一张便签记住位置和尺寸。原显示器断开时，窗口恢复到可用工作区。
- 纸黄、雾绿、浅色、深色四种主题可以切换，所有便签同步并记住偏好。
- 右上角“－”临时最小化，AI 继续等待；“×”关闭当前请求并通知 AI 用户已取消，不提交正文或完成确认。Alt+F4、任务栏关闭使用同一关闭流程。其他便签不受影响，最后一项结束后桌面端自动退出。
- 完成或取消后销毁便签，不显示完成页面。关闭前尽力保存可保存的草稿，已保存草稿仍可通过完整查询查看，不作为取消回复发送给 AI。

## AI 使用 Skill

项目随附 [human-cli Skill](skills/human-cli/SKILL.md)，说明适用场景、MCP/CLI 调用、图文文件回复与断线恢复，以及如何通过插件为用户提供脚本或程序启动入口。完整目录位于 `skills/human-cli/`，含用法参考与可运行的 Python SPI 启动插件示例，可按所用 AI 客户端的规则安装或直接提供给 AI 阅读。

## 网络 SPI 插件

侧栏功能通过 **HTTP + JSON-RPC 2.0 网络 SPI** 接入。提供者可以用 Python、Java、C#、Go、Node 等语言实现，不需要把插件代码加载到便签进程。

内置插件是 human.screenshot、human.open-url、human.clipboard、human.diagnostics，同样经过本机 SPI。外部提供者在数据目录的 plugins/providers.json 登记地址和 token，重启后发现。

仓库附有纯 Python 标准库示例：

```powershell
python examples/spi-python/provider.py --port 7788
```

将输出的 URL 与 token 填入 providers.json，再由 AI 把 example.python-note 绑定到便签。服务端实现 describe / start / status / cancel / forget，返回文字、图片或错误；前端共用配置和结果界面。

参阅 [插件开发](docs/PLUGINS.md)、[SPI 协议](docs/SPI.md) 和 [架构说明](docs/ARCHITECTURE.md)。远程提供者操作的是其所在机器资源，本机屏幕等能力需要本机提供者。

## 自定义配置界面（本地新增，尚未发布）

插件可声明 configUi: {"type":"web","path":"/ui/settings"}，在共用工具页内显示自己托管的网页。左键仍直接执行，右键打开配置；网页提交的参数经宿主校验、持久化后生效。关闭放弃未保存的修改，原有 schema 表单保持兼容。

参阅 [配置界面 SPI 接入说明](docs/CONFIG-UI.md)。本地测试提供者仅放在 tests/fixtures，不注册为产品按钮，不进入发布包。

## 从源码运行与构建

开发环境需要 Node.js 22.12 或更新版本；Windows 发布包构建另需 MinGW-w64 GCC，可通过 HUMAN_CLI_CC 指定编译器路径。

```powershell
git clone https://github.com/fishOfOUC/human_cli.git
cd human_cli
npm ci
npm start
```

源码 CLI / MCP 开发入口分别为 node adapters/cli.mjs 与 node adapters/mcp.mjs，也可双击“启动 human_cli.cmd”。打包：

```powershell
npm test
npm run package
```

产物目录见 release/latest.json。native Windows CLI 启动器复用包内运行时，开发依赖不需要交给使用者。

## 验证范围

当前生命周期改动的验证范围及报告见 [验证说明](docs/VERIFICATION.md)。包含默认请求在用户打字时保持等待、同一次调用接收完成回复、显式后台模式、真实截图、图片回传、断线恢复、日志路径、旧数据兼容、网络 SPI、主题、窗口记忆，以及清空子进程 PATH 后的 EXE 运行。生命周期规则见 [按需生命周期](docs/LIFECYCLE.md)。

```powershell
npm test
npm run build
npm run test:lifecycle  # 验证无主界面、结束销毁与进程自动退出
npm run test:native  # 会启动测试窗口并进行一次真实屏幕截图
npm run test:rebuild  # 验证迁移后的界面、进度和真实草稿状态
npm run test:config-ui  # 仅操作专用测试窗口，验证插件自己的网页界面
```

当前发行针对 Windows x64、本机单用户 AI 通道；实际多显示器硬件拔插仍需现场验收。没有外部服务自动安装、插件热重载、历史自动过期或自动更新；旧 Node Worker 兼容层不构成安全沙箱。原型快照保存在 archive/prototype/，保留原命名，不进入正式发布包。

界面继续保留小便签默认尺寸。

查看当前本地界面：双击项目根目录的 [查看界面.cmd](查看界面.cmd)，打开带三个测试插件的验收便签；点击完成后自动退出。

源码、开发入口、历史构建与原始设计稿的归档位置见 [项目文件说明](docs/PROJECT-LAYOUT.md)，协议和开发资料见 [文档索引](docs/README.md)。
