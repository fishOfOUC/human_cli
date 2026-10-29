# AI 接入与本地缓存

human_cli 按需启动，没有主界面或托盘。用户完成、AI 取消或用户主动关闭后便签立即消失，最后一个任务结束、响应传完后桌面端自动退出；下次 CLI/MCP 调用会重新启动。查询历史只返回数据，不显示历史窗口。

human_cli 不设置用户完成协助的截止时间。用户长时间离开、客户端超时或 AI 退出时，请求与回复仍保存在本机。AI 自己判断工具调用是否成功；不需要额外发送接收回执。

## MCP 配置

```json
{
  "mcpServers": {
    "human_cli": {
      "command": "E:/你的便携目录/human_cli.exe",
      "args": ["mcp"]
    }
  }
}
```

便携包直接使用 human_cli.exe，无需安装 Node.js，也不需要指定源码、端点或令牌。它会按需自动启动同目录的 human_cli-desktop.exe。

开发环境仍可配置 command 为 node，args 指向本仓库 adapters/mcp.mjs；开发前执行 npm install 和 npm run build。

## 8 个工具

| 工具 | 用途 |
| --- | --- |
| `human_plugins` | 查询 SPI 插件及配置 Schema |
| `human_request` | 请求用户协助，默认等待并返回有序文字、图片/文件路径和诊断；支持幂等键 |
| `human_wait` | 恢复已有请求的等待，返回相同的有序路径回复 |
| `human_logs` | 按便签创建时间倒序查询标题、时间、状态及本地缓存绝对路径 |
| `human_get` | 即时查询指定请求及草稿、结果 |
| `human_update` | 携带版本更新 pending 请求 |
| `human_cancel` | AI 取消 pending 请求 |
| `human_list` | 列出请求和缓存状态 |

## 正常调用

### MCP 入参与 strict 客户端兼容

工具声明使用闭合对象及显式 required 字段；原本可选的字段可填 null，服务端将其视为省略并采用原有默认值。旧客户端直接省略这些参数也仍受支持。UUID、长度、范围及插件配置的业务校验继续在服务端执行。

兼容客户端或模型填入的空串占位：MCP 顶层 agent、idempotencyKey、format 的空字符串或纯空白按省略处理；分别采用默认 Agent、自动生成请求幂等键及 json 格式。plugins[].side、config 的空串占位也按省略处理。有效的自定义 Agent 和幂等键保持原值，不会为所有空键填写同一个常量。

这不是全局空串转换：标题、请求 UUID、插件 ID 仍严格校验；description/context 等正文、patch 中用于清空的空串，以及插件配置内部的空串和 null 均保留原意。null 原本即可使用；空串兼容不表示已确认是哪一层将 null 转成了空串。

plugins[].config 在模型声明中为 JSON 对象字符串，例如 `"{\"delayMs\":0,\"display\":\"primary\",\"autoAttach\":false}"`；实际 MCP 调用仍兼容原来的对象值。JSON 字符串内部的任意插件字段、数组与 null 值会原样保留，不被当成省略。config 本身传 null 则使用默认空配置；plugins=null 使用默认插件，plugins=[] 表示不挂载插件。

human_update 的 patch 中，字段省略或填 null 表示不修改，空字符串/空数组表示明确清空。此处的 JSON 字符串与 null 兼容只属于 MCP 入参适配；CLI/HTTP 的原有请求写法无需调整。

### 用户关闭与最小化

右上角“－”仅最小化，AI 继续等待；“×”、Alt+F4 和任务栏关闭会结束当前协助。正常回复为 status=cancelled、cancelledBy=user、cancelReason=用户关闭了协助窗口，不含正文、附件或 confirmation_only。用户关闭表示终止本次协助，不应自动重建同一便签。其他请求继续等待；完整 get 查询仍可查看保存过的草稿。

### 调用流程

用户未输入内容而直接点“完成并回复”时，返回示例：

```json
{
  "schemaVersion": 1,
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "status": "completed",
  "content": [],
  "submission": {
    "type": "confirmation_only",
    "message": "用户已提交完成确认，本次收到的正文和附件均为空。"
  }
}
```

submission 是系统生成的提交说明，不是替用户编造的正文。它只说明用户已完成提交及提交内容为空，不表示验收通过，也不判断输入是否丢失。仅文字、仅图片、仅文件或仅诊断等有实际内容时不加此标记；未完成、取消及丢弃的回复也不加。human_get 的顶层及 result.submission 均可查看该标记，result.content 不再保存无意义的空文字块。

1. 查询插件，调用 human_request。
2. 同一次调用会显示便签并等待用户完成、AI 取消或用户主动关闭，不设用户操作期限。用户打字、保存草稿或收起窗口都不会结束调用。
3. 调用返回有序 content[]，块类型为 text、image、file、diagnostic。文字与附件保留穿插位置；图片和文件块含 attachmentId、name、mimeType、size、path。AI 用自身工具按绝对路径读取。
4. MCP 外层仅有一个 text 内容块，其中 text 是与 CLI 相同的回复 JSON。内层 content[] 才是用户回复；不另传 Base64、图片块或分页。

只有明确需要后台任务时才设置 background: true，此时 human_request 立即返回请求 ID；之后可用 human_wait 恢复等待。默认 background 为 false。

收到结果后即可继续自己的工作，无需确认收到。回复统一保留到本地缓存，不维护待交付、已读或交付回执状态。

human_request 和 human_wait 都不提供用户完成超时参数。客户端宿主可以有自己的超时；连接断开只撤销本次等待监听，不取消便签或删除内容。

## AI 重启后的恢复

如果此前调用失败，或 AI 已忘记 requestId，调用：

```json
{"limit": 50, "offset": 0}
```

`human_logs` 返回类似：

```json
{
  "cacheDirectory": "E:/Tools/human_cli/cache",
  "total": 1,
  "entries": [{
    "id": "请求UUID",
    "title": "请确认页面效果",
    "createdAt": "2026-10-28T08:00:00.000Z",
    "updatedAt": "2026-10-28T08:05:00.000Z",
    "status": "completed",
    "cache": {
      "state": "saved",
      "savedAt": "2026-10-28T08:05:00.000Z",
      "directory": "E:/Tools/human_cli/cache/请求UUID",
      "requestPath": "E:/Tools/human_cli/cache/请求UUID/request.json",
      "replyPath": "E:/Tools/human_cli/cache/请求UUID/reply.json"
    }
  }],
  "nextOffset": null
}
```

AI 根据标题和时间找到原便签，直接读取 replyPath；其中 image/file 内容块的 content[].path 是缓存文件绝对路径，可用自身的图片/文件读取工具打开。requestPath 保存说明、状态、草稿、工具结果及完整回复快照。JSON 为 UTF-8，不包含图片 Base64，图片保留为独立原始文件。

创建时间 createdAt 是排序依据，不因后续编辑改变。limit 默认 50、最大 200，offset 从 0 开始；nextOffset 非 null 时继续翻页。返回所有请求，pending 表示用户尚未完成，cancelled 表示请求已取消；cancelledBy=user 则明确表示用户主动关闭；没有回复时 replyPath 为 null。时间使用 ISO 8601 UTC。

## 缓存布局与生命周期

```text
<软件目录>/cache/
  <requestId>/
    request.json
    reply.json          # 完成且未丢弃时存在
    attachments/        # 该便签仍引用的图片及工具附件
      <attachmentId>.png
```

回复缓存默认位于 human_cli.exe 所在软件目录/cache，源码运行时在项目根目录/cache，不使用调用者工作目录。HUMAN_CLI_CACHE_DIR 可显式指定其他缓存根目录（测试使用）；HUMAN_CLI_DATA_DIR 只影响状态、原始附件和配置。缓存目录不可写时明确报错，不静默切换位置。每张便签创建及后续变更都会更新 request.json，用户完成后原子写入仅含精简对外回复的 reply.json。附件复制到便签自己的目录，不依赖正在运行的图片 URL。重启时根据持久状态重建缓存，旧版回复按“文字 → 原图片顺序 → 原诊断顺序”迁移，原来未记录的穿插位置无法还原。软件目录移动后重新查询可获得按新位置生成的路径；原缓存源保留。

所有回复统一保存，不尝试通过连接状态推断 AI 是否接收成功。成功调用、重复读取均不删除文件；当前无自动过期策略。用户可以在便签中明确丢弃缓存回复，删除 reply.json、回复内容和不再被工具结果引用的附件，日志保留 discarded 标记及请求记录。丢弃不能撤回 AI 已经读取的内容。

## 非 MCP 脚本

```powershell
./human_cli.exe request ./resources/app/examples/request.json
# 这一条命令默认等到用户完成，再返回回复。
./human_cli.exe logs 50 0
./human_cli.exe result <请求ID>
```

CLI request 默认等待用户完成；只有 --background 明确后台创建并立即返回 ID。wait <ID> 用于恢复等待已有任务。还支持 get、cancel、list、plugins；--help 显示用法。默认结果包含 schemaVersion、requestId、status 与有序 content；空提交 content=[] 并附 submission.type=confirmation_only 的系统说明，取消不发送草稿，丢弃时返回 replyState=discarded 并省略 content。旧调用者可显式使用 --format legacy 或 MCP format=legacy，图片分页也只在 legacy 下保留；legacy 无法无损表达穿插。request - 从标准输入读取 UTF-8 JSON，最终输出写入 stdout，等待开始的 waiting_for_user 元数据和错误写入 stderr；错误返回非零退出码。

HTTP 接口为 `GET /logs?limit=50&offset=0`，使用现有本机 Bearer 认证。日志接口不读取调用者指定的任意路径，仅返回工具管理的缓存位置。

默认数据目录 `%LOCALAPPDATA%/human_cli`；适配器和桌面端应使用相同 HUMAN_CLI_DATA_DIR。runtime.json 含访问令牌，不是可分享配置。HUMAN_CLI_NO_AUTOSTART=1 可关闭自动启动。

缓存路径指向运行 human_cli 的机器。AI 若运行在另一台机器，需要自己已有的文件访问方式；human_cli 不会自动暴露文件到公网，也不会向已经结束的 AI 会话主动注入消息。
