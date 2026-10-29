# MCP、CLI 与回复处理

## 入口配置

便携包解压后保留整个目录：`human_cli.exe` 是 CLI/MCP 入口，`human_cli-desktop.exe` 是按需桌面运行时。使用者无需安装 Node.js。不要只复制一个 EXE。

MCP 客户端配置示例（用实际软件目录替换示例路径）：

```json
{
  "mcpServers": {
    "human_cli": {
      "command": "E:/Tools/human_cli/human_cli.exe",
      "args": ["mcp"]
    }
  }
}
```

配置完成后重新连接 MCP。已有 MCP 就直接调用；不通过普通终端启动 `mcp` 再向其输入自然语言。源码开发入口为 `node <仓库>/adapters/mcp.mjs`，需已安装依赖并完成前端构建。

## MCP 工具

| 工具 | 参数与作用 |
| --- | --- |
| `human_plugins` | `{}`，查询插件清单、配置 Schema 和提供者错误 |
| `human_request` | 创建协助，默认同次等待；见下方完整示例 |
| `human_wait` | `requestId`，可选 `format`、`imageOffset`；恢复等待，imageOffset 仅用于旧 legacy 图片分页 |
| `human_get` | `requestId`；取完整快照、版本、草稿与工具状态 |
| `human_logs` | `limit` 默认 50、范围 1–200，`offset` 默认 0；按创建时间倒序定位请求及缓存 |
| `human_update` | `requestId`、当前 `version`、`patch`；更新尚未结束的说明 |
| `human_cancel` | `requestId`、可选 `reason`；由 AI 取消不再需要的请求 |
| `human_list` | `{}`，查询已有请求，不创建便签 |

工具名称前缀由客户端决定。发起调用前按连接实际暴露的 Schema 填参数。

### 创建协助

下面是包含所有顶层字段的 MCP 示例。请求中的文件路径、页面位置和键应根据实际任务填写。

```json
{
  "title": "请确认游戏的全屏显示",
  "description": "请在已经打开的游戏内检查显示设置。便签可以最小化，检查后再回复。",
  "steps": [
    "进入设置 → 显示，切换为全屏",
    "观察画面是否完整、是否出现黑边或按钮错位",
    "回复结果；如有问题，点击侧栏截图按钮并说明异常位置"
  ],
  "context": "AI 已完成配置文件调整，现在需要观察真实游戏画面。",
  "expectation": "说明是否正常；异常时附截图。",
  "agent": "开发助手",
  "project": "游戏显示适配",
  "plugins": [{
    "id": "capture",
    "plugin": "human.screenshot",
    "side": "right",
    "config": "{\"display\":\"primary\",\"autoAttach\":true}"
  }],
  "idempotencyKey": "game-display-20261030-001",
  "format": "json",
  "background": false
}
```

`idempotencyKey` 是本次逻辑请求的唯一键；重试原请求保留它，新任务另生成。它不是 `requestId`；请求 UUID 由软件返回。

MCP 工具声明为 strict 客户端提供闭合对象，字段显式 required，原本可选字段允许 `null`；旧客户端也可直接省略可选字段。原始业务校验仍在服务端执行。要点：

- 只有 `title` 是原始创建契约中的必填字段，非空且最长 500 字符。
- `description` 最长 20000 字，`context` 最长 30000 字，`expectation` 最长 5000 字；steps 最多 30 项，每项最长 2000 字。
- 默认 `background = false`、`format = json`。`plugins = null` 或省略时使用默认截图按钮；`plugins = []` 才是没有按钮。
- `plugins[].id` 是请求内唯一的按钮绑定 ID；`plugin` 是已发现的全局插件 ID，二者不同。最多 20 个绑定。
- MCP 声明中的 `plugins[].config` 是 **JSON 对象字符串**，不是任意自由对象；实际调用仍兼容旧对象写法。CLI 则使用普通 JSON 对象。
- 可选 `agent`、`idempotencyKey`、`format` 以及插件 `side/config` 的空串占位按省略处理；不要把这个规则套到必填标题、插件标识、正文、patch 或配置内部字段上。
- 原本可选字段传 `null` 表示省略；如 strict 客户端要求所有字段齐全，按它的声明提供值或 null。优先填有意义的任务值，不编造共享幂等键。

### 更新、等待、取消

`human_get` 返回当前版本后，用 `human_update` 更新说明：

```json
{
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "version": 1,
  "patch": {
    "title": null,
    "description": "请再切换一次窗口模式，确认黑边是否仍出现。",
    "steps": null,
    "context": null,
    "expectation": null,
    "project": null
  }
}
```

patch 仅支持上述六类字段。省略或 null 表示不修改，空字符串/空数组表示明确清空；更换 steps 会重置步骤勾选。不能借此添加或改换插件绑定。

恢复等待的完整 strict 风格示例：

```json
{"requestId":"28b45b5c-aefc-48fa-b38d-facaa611ff50","format":"json","imageOffset":0}
```

取消示例：

```json
{"requestId":"28b45b5c-aefc-48fa-b38d-facaa611ff50","reason":"后续修改使这次检查不再需要。"}
```

断线不等于取消。ID 已知时恢复原等待；ID 丢失时用 `human_logs`，例如 `{"limit":50,"offset":0}`，按标题、创建时间和上下文定位。`nextOffset` 非 null 时继续翻页。不要因客户端超时而自动重新创建同一请求。

## CLI

使用实际的 EXE 绝对路径。下面示例在 PowerShell 中运行：

```powershell
$HumanCli = 'E:\Tools\human_cli\human_cli.exe'
& $HumanCli --help
& $HumanCli plugins
```

将请求保存为 UTF-8 JSON；CLI 的插件 config 使用对象：

```json
{
  "title": "请完成人机验证",
  "description": "请在当前浏览器页面完成验证，成功后停留在页面上。",
  "steps": ["完成页面验证", "回复是否成功；失败时附截图"],
  "agent": "操作助手",
  "expectation": "完成情况或错误说明。",
  "plugins": [{
    "id": "capture",
    "plugin": "human.screenshot",
    "side": "right",
    "config": {"display": "primary", "autoAttach": true}
  }],
  "idempotencyKey": "browser-verification-20261030-001"
}
```

```powershell
& $HumanCli request 'E:\Work\协助请求.json'
# 默认等待用户完成或取消。stdout 是最终 UTF-8 JSON。
# stderr 中 waiting_for_user 事件包含 requestId，可在连接断开后恢复。
```

支持 `request -` 从标准输入读取 UTF-8 JSON；在不能保证 shell 管道编码时，优先使用 UTF-8 文件。PowerShell 7 可用 `Set-Content -Encoding utf8` 保存，Windows PowerShell 5.1 的 UTF-8 BOM 也受 CLI 接受。

只有明确后台创建时才使用：

```powershell
$Created = & $HumanCli request 'E:\Work\协助请求.json' --background | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '创建协助失败，请查看 stderr。' }
& $HumanCli wait $Created.requestId
```

其他命令：

```powershell
& $HumanCli get '28b45b5c-aefc-48fa-b38d-facaa611ff50'
& $HumanCli result '28b45b5c-aefc-48fa-b38d-facaa611ff50'
& $HumanCli logs 50 0
& $HumanCli list
& $HumanCli cancel '28b45b5c-aefc-48fa-b38d-facaa611ff50' '这次协助已不再需要。'
```

CLI 没有 `update` 子命令，更新说明使用 MCP `human_update`。错误返回非零退出码和 stderr JSON；不要将日志行与 stdout 结果拼接后一起解析。

## 回复结构

示意结果（路径和 UUID 为示例，使用真实返回值读取）：

```json
{
  "schemaVersion": 1,
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "status": "completed",
  "content": [
    {"type":"text","text":"切换后右侧仍有黑边，见图。"},
    {
      "type":"image",
      "attachmentId":"5979f4d0-d945-4cb9-8daf-b1581614818f",
      "name":"全屏截图.png","mimeType":"image/png","size":12345,
      "path":"E:/Tools/human_cli/cache/28b45b5c-aefc-48fa-b38d-facaa611ff50/attachments/5979f4d0-d945-4cb9-8daf-b1581614818f.png"
    },
    {"type":"text","text":"这是当前配置文件。"},
    {
      "type":"file",
      "attachmentId":"1120ce2e-0535-4727-9493-7b7f2e12abb7",
      "name":"settings.ini","mimeType":"application/octet-stream","size":256,
      "path":"E:/Tools/human_cli/cache/28b45b5c-aefc-48fa-b38d-facaa611ff50/attachments/1120ce2e-0535-4727-9493-7b7f2e12abb7.ini"
    }
  ]
}
```

读取时依次处理 content，不按类型重排。诊断块为 `type: diagnostic`，可带 code/message/details 等诊断内容。插件结果只有被用户附入回复或由插件配置自动附入时，才属于最终回复；工具成功状态本身不是用户结论。

空提交为 `content: []` 加 `submission: {"type":"confirmation_only","message":"用户已提交完成确认，本次收到的正文和附件均为空。"}`。用户主动关闭为 `status: cancelled`、`cancelledBy: user`、`cancelReason: 用户关闭了协助窗口。`，不含提交正文或空确认标记。

缓存布局为软件目录下 `cache/<requestId>/request.json`、`reply.json` 和 `attachments/`。`request.json` 是完整快照，含草稿；`reply.json` 是完成后的精简回复。以 logs 返回的实际路径为准，文件使用 UTF-8。默认结果无 Base64 或单独 MCP 图片块；`format = legacy` / `--format legacy` 仅用于旧调用者，会丢失文字附件的穿插表达，新任务使用 json。

`HUMAN_CLI_CACHE_DIR` 可改变缓存根目录；`HUMAN_CLI_DATA_DIR` 改变状态/原始附件/配置目录，默认通常为 `%LOCALAPPDATA%/human_cli`。旧 RelayNote 数据可能沿用旧目录，检查实际安装环境，不能仅凭默认值覆盖原配置。不同客户端应指向相同数据目录。不要把含访问令牌的 `runtime.json` 当成可分享的接入配置。
