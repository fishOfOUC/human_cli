# human_cli v2.0.3（本地构建）

回复编辑器改为局部更新并保留文字输入节点。中文组合输入期间延后草稿保存及界面重绘，选词结束后处理；Escape、Ctrl+Enter 避开组合输入。请求状态按便签定向通知，置顶状态仅在变化时更新。对应回归入口为 `npm run test:input`。

标题栏增加独立“×”关闭按钮，位于最小化旁边；Alt+F4 和任务栏关闭走同一流程。关闭只取消当前请求，向等待中的 AI 返回 status=cancelled、cancelledBy=user 和关闭原因，不提交草稿或完成确认。已完成的请求不会因迟到的关闭操作被改成取消。

最小化继续保留等待，其他便签不受影响；最后一项关闭后桌面端自动退出。关闭前尽力保存可保存的草稿，完整 get 查询仍可查看保存内容；取消回复（包括 legacy）不发送草稿。插件配置页随所属窗口关闭，取消落盘失败时允许重试。

---

# human_cli v2.0.2（历史说明）

空内容完成时增加 submission.type=confirmation_only 和系统说明，明确告诉 AI 用户已提交完成确认、本次正文和附件为空。该说明不充当用户正文，也不表示验收通过或判定输入丢失。相同标记在 CLI、MCP、human_get、缓存及重启后均可读取。

MCP 可选 agent、idempotencyKey、format 以及插件 side/config 的空串占位按省略处理，修复真实调用中空幂等键触发 min(1) 的问题；原有 null 和省略参数继续可用。正文、更新字段及插件配置内部的空串不被吞掉，必填字段和有效值保持原校验。

打包排除本地 .mcp.json、环境文件及 Agent 私有配置目录，不修改这些本地文件。更新包后需重启旧桌面端并重新连接 MCP。

---

# human_cli v2.0.1（历史说明）

修复 CodeBuddy 在工具 Schema 转为 strict 模式时的兼容告警。tools/list 使用闭合、全部字段显式 required、可选值可传 null 的模型声明；实际调用继续经过原有 Zod 校验和默认值处理。插件 config 可使用 JSON 对象字符串，也兼容已有对象写法，不限制插件自定义字段或其内部 null 值。

同时修复局部更新的默认值泄漏：仅修改标题时不再将未提供的步骤、说明、上下文等清空。MCP 可选更新字段传 null 表示不更新；空字符串/空数组仍表示明确清空。CLI、有序回复、图片/文件路径交付和插件执行方式保持原有使用流程。

更新包后应退出旧桌面进程并重新连接 MCP，使运行代码和 tools/list 同步刷新；不需要修改 CodeBuddy 程序或客户端日志级别。

---

# human_cli v2.0.0（历史说明）

默认回复协议改为 schemaVersion=1 的有序 content[]。文字、图片、文件和诊断保留用户编排顺序；图片和文件只返回软件目录/cache 下的副本绝对路径，由 AI 使用自身工具读取。CLI 与 MCP 返回相同业务 JSON，不默认发送 Base64、图片内容块或图片分页。

桌面回复区支持在文字光标处插入图片/文件、继续输入、附件上移下移、移除及失败重试。提交会等待附件保存成功；空回复不自动生成“已完成”。

这是对默认输出的兼容性变更，因此使用主版本 2。旧脚本可显式指定 CLI --format legacy 或 MCP format=legacy；完整 get/logs 查询及旧持久记录仍保留。旧格式无法完整表达文字和附件穿插。

回复缓存与状态目录分离：发布版默认 <软件目录>/cache，源码默认 <项目根目录>/cache；HUMAN_CLI_CACHE_DIR 可显式覆盖。HUMAN_CLI_DATA_DIR 继续控制状态、原始附件和配置。切换目录时从持久状态及原始附件重建缓存，保留旧缓存源；移动软件后重新查询会生成新绝对路径。

验证范围见 VERIFICATION.md。

---

# human_cli v1.1.0（历史说明）

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
