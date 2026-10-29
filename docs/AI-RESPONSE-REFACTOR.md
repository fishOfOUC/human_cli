# AI 协助调用返回数据：实际样例与重构方案

本文供后续开发者修改返回结构使用。2026-10-29 按用户后续要求，将方案调整为“有序内容块 + 软件目录下的文件/图片缓存路径”，由 AI 按需读取。本次只更新文档，没有修改返回协议或运行代码。第 2、3 节保留历史实际返回，第 4 节起为最新推荐方案。

## 1. 使用场景与问题

AI 调用 human_cli，请用户协助完成操作。AI 已经知道自己提交的任务说明、步骤和插件配置；用户完成后，AI 需要的是完成状态、用户回复及实际交付的附件。

当前 CLI 默认请求结束时直接输出整个任务快照，因此重复返回任务原文、插件清单、JSON Schema、默认配置、空字段、缓存路径等。用户回复同时出现在顶层 `reply` 和 `result.reply`，被重复发送。

以下样例来自 2026-10-29 的实际界面验收，请求 ID 为 `28b45b5c-aefc-48fa-b38d-facaa611ff50`。第 2 节是最终 stdout 的完整 JSON，不是节选；它不包含工具执行平台自身的 session_id、exit_code 等外壳信息。

## 2. 当前完整实际返回：stdout

```json
{
  "title": "三种插件验收",
  "description": "侧栏从上到下：网页配置、简单配置、无需配置。左键直接执行，右键查看配置或结果。验收后可以在回复中说明问题。",
  "steps": [
    "网页：右键修改并保存，再左键执行",
    "简单：展开工具设置，保存后左键执行",
    "无配置：左键执行，右键查看计数结果"
  ],
  "context": "",
  "expectation": "",
  "agent": "本机验收",
  "project": "仅本地测试",
  "idempotencyKey": "c28cff22-2bb6-45df-b70d-c5852949506b",
  "id": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "version": 2,
  "status": "completed",
  "checks": [],
  "reply": "我验收了,现在你给我一个应用返回数据示例,此外,回复框偶尔会丢失字母,你记下这个问题,先不修.",
  "images": [],
  "diagnostics": [],
  "tools": [
    {
      "id": "web",
      "plugin": "acceptance.web",
      "side": "right",
      "config": {
        "label": "我的工具",
        "color": "#486044",
        "scale": 1
      },
      "state": "idle",
      "output": null,
      "error": null,
      "manifest": {
        "apiVersion": 1,
        "id": "acceptance.web",
        "name": "网页配置",
        "version": "1",
        "description": "右键打开插件自己的网页，修改文字、颜色和大小并保存；左键直接执行，结果显示当前配置。",
        "icon": "notebook-pen",
        "side": "right",
        "configSchema": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "label": {
              "type": "string",
              "minLength": 1,
              "maxLength": 80,
              "default": "我的工具"
            },
            "color": {
              "type": "string",
              "pattern": "^#[0-9a-f]{6}$",
              "default": "#486044"
            },
            "scale": {
              "type": "number",
              "minimum": 0.5,
              "maximum": 2,
              "default": 1
            }
          },
          "required": [
            "label",
            "color",
            "scale"
          ]
        },
        "configUi": {
          "type": "web",
          "path": "/ui"
        },
        "providerId": "acceptance"
      }
    },
    {
      "id": "simple",
      "plugin": "acceptance.simple",
      "side": "right",
      "config": {
        "message": "简单配置已经生效。",
        "repeat": 1,
        "format": "原文",
        "showCounter": true
      },
      "state": "idle",
      "output": null,
      "error": null,
      "manifest": {
        "apiVersion": 1,
        "id": "acceptance.simple",
        "name": "简单配置",
        "version": "1",
        "description": "右键展开工具设置，修改表单并保存；左键直接执行。",
        "icon": "terminal",
        "side": "right",
        "configSchema": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "message": {
              "type": "string",
              "title": "输出文字",
              "minLength": 1,
              "maxLength": 120,
              "default": "简单配置已经生效。"
            },
            "repeat": {
              "type": "integer",
              "title": "重复次数（1–3）",
              "minimum": 1,
              "maximum": 3,
              "default": 1
            },
            "format": {
              "type": "string",
              "title": "输出格式",
              "enum": [
                "原文",
                "加方括号"
              ],
              "default": "原文"
            },
            "showCounter": {
              "type": "boolean",
              "title": "显示运行次数",
              "default": true
            }
          },
          "required": [
            "message",
            "repeat",
            "format",
            "showCounter"
          ]
        },
        "configUi": {
          "type": "schema"
        },
        "providerId": "acceptance"
      }
    },
    {
      "id": "plain",
      "plugin": "acceptance.none",
      "side": "right",
      "config": {},
      "state": "idle",
      "output": null,
      "error": null,
      "manifest": {
        "apiVersion": 1,
        "id": "acceptance.none",
        "name": "无需配置",
        "version": "1",
        "description": "左键立即执行并计数；右键查看结果，无需填写任何配置。",
        "icon": "check",
        "side": "right",
        "configSchema": {
          "type": "object",
          "additionalProperties": false,
          "properties": {}
        },
        "configUi": {
          "type": "none"
        },
        "providerId": "acceptance"
      }
    }
  ],
  "result": {
    "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
    "status": "completed",
    "reply": "我验收了,现在你给我一个应用返回数据示例,此外,回复框偶尔会丢失字母,你记下这个问题,先不修.",
    "images": [],
    "diagnostics": [],
    "completedAt": "2026-10-29T03:54:14.490Z"
  },
  "cache": {
    "state": "saved",
    "savedAt": "2026-10-29T03:54:14.490Z",
    "directory": "E:\\Code\\my_code\\agent_communicate_tool\\.qa\\acceptance-0a5cc8599d0647598fc97f410fca43c4\\data\\cache\\28b45b5c-aefc-48fa-b38d-facaa611ff50",
    "requestPath": "E:\\Code\\my_code\\agent_communicate_tool\\.qa\\acceptance-0a5cc8599d0647598fc97f410fca43c4\\data\\cache\\28b45b5c-aefc-48fa-b38d-facaa611ff50\\request.json",
    "replyPath": "E:\\Code\\my_code\\agent_communicate_tool\\.qa\\acceptance-0a5cc8599d0647598fc97f410fca43c4\\data\\cache\\28b45b5c-aefc-48fa-b38d-facaa611ff50\\reply.json"
  },
  "createdAt": "2026-10-29T03:50:44.460Z",
  "updatedAt": "2026-10-29T03:54:14.490Z",
  "receiver": {
    "waiting": false
  }
}
```

## 3. 同次调用开始等待时的 stderr 事件

这条事件不是最终回复；它在便签创建后输出。记录在这里，避免把 stdout 和 stderr 混淆。

```json
{
  "event": "waiting_for_user",
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "title": "三种插件验收",
  "cache": {
    "state": "not_ready",
    "directory": "E:\\Code\\my_code\\agent_communicate_tool\\.qa\\acceptance-0a5cc8599d0647598fc97f410fca43c4\\data\\cache\\28b45b5c-aefc-48fa-b38d-facaa611ff50",
    "requestPath": "E:\\Code\\my_code\\agent_communicate_tool\\.qa\\acceptance-0a5cc8599d0647598fc97f410fca43c4\\data\\cache\\28b45b5c-aefc-48fa-b38d-facaa611ff50\\request.json",
    "replyPath": null
  }
}
```

## 4. 最终推荐方向：有序内容块 + 软件目录缓存路径

根据后续讨论，方案收敛为：

- 用户回复使用有序的 `content[]`，表达“文字 → 图片 → 文字 → 文件”等穿插顺序。
- 图片和普通文件都保存为软件目录内的缓存副本，回复只返回可读取的绝对路径与必要元数据。
- CLI 与 MCP 返回相同的业务 JSON。新格式不直接发送二进制、Base64 或 MCP 图片块，也不需要图片分页。
- AI 根据内容块顺序理解回复，需要图片时用自身图片读取工具打开 path，需要文件时按类型读取；拿到路径不代表已经读取内容。
- 本次仍是设计文档更新，尚未修改运行代码。第 2、3 节是历史实际输出，不代表新协议。

此前提出的 reply 字符串与独立 attachments 列表，不能完整表达文字和附件的穿插位置，已由本节起的方案替代。此前的 MCP 图片内容块、contentIndex、imagePage 与 Base64 分页也不再属于新格式。

## 5. 现有实现与所需变化

| 位置                   | 当前行为                                            | 计划变化                       |
| -------------------- | ----------------------------------------------- | -------------------------- |
| core/paths.mjs       | 默认数据目录为 LOCALAPPDATA/human_cli，兼容旧 RelayNote 目录 | 单独确定回复缓存根目录，默认位于软件目录/cache |
| core/attachments.mjs | 支持 PNG/JPEG/GIF/WebP 与纯文本，每项最多 5 MiB            | 增加普通文件存储和统一校验              |
| core/requests.mjs    | reply 与 images 分开保存，用户附件只接受图片，最多 8 张            | 草稿与完成快照保存有序内容块             |
| complete()           | 空文字及 only=true 自动生成“已完成”                        | 保存实际提交内容，不合成占位文字           |
| src/main.js、桌面 IPC   | 文字框与附件区分离，拖放最终调用 addImage                       | 支持按插入位置编排文字、图片、文件          |
| CLI / MCP            | CLI 返回完整快照，MCP 另取图片并发送 Base64 图片块               | 共享有序回复投影，统一返回路径            |

已有附件存储不等于已经支持用户提交任意文件。普通文件和穿插顺序都需要补齐编辑、存储及完成快照，不能只改对外字段名。

## 6. 回复结构

### 6.1 文字、图片与文件穿插示例

以下为目标 CLI stdout；示例安装目录为 E:/Tools/human_cli，ID、大小和文件路径仅用于说明，不表示文件实际存在：

```json
{
  "schemaVersion": 1,
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "status": "completed",
  "content": [
    {
      "type": "text",
      "text": "这里的按钮显示异常，截图如下："
    },
    {
      "type": "image",
      "attachmentId": "e652bb26-6480-4ae7-afba-afbca78672be",
      "name": "按钮截图.png",
      "mimeType": "image/png",
      "size": 183204,
      "path": "E:/Tools/human_cli/cache/28b45b5c-aefc-48fa-b38d-facaa611ff50/attachments/e652bb26-6480-4ae7-afba-afbca78672be.png"
    },
    {
      "type": "text",
      "text": "下面是我修改后的配置，请结合截图检查。"
    },
    {
      "type": "file",
      "attachmentId": "4567f671-b32e-480e-9009-d7e84895ee0d",
      "name": "修改后的配置.json",
      "mimeType": "application/json",
      "size": 824,
      "path": "E:/Tools/human_cli/cache/28b45b5c-aefc-48fa-b38d-facaa611ff50/attachments/4567f671-b32e-480e-9009-d7e84895ee0d.json"
    }
  ]
}
```

数组顺序是唯一的阅读顺序。无需额外增加 order/index 字段，也不从文件名、上传完成时间或附件 ID 推断位置。

### 6.2 顶层字段

| 字段            | 规则                                                   |
| ------------- | ---------------------------------------------------- |
| schemaVersion | 必需；新对外回复协议首版为 1，独立于任务乐观锁 version 和内部持久化版本            |
| requestId     | 必需；请求 UUID，用于查询、恢复和定位缓存                              |
| status        | 必需；pending / completed / cancelled，沿用内部任务状态          |
| content       | 已完成且回复未丢弃时必需，为有序内容块；空提交为 []，pending/cancelled/已丢弃时省略 |
| cancelReason  | 取消原因，有内容才返回                                          |
| replyState    | 仅缓存已丢弃时返回 discarded，正常成功省略                           |

新格式不再额外输出 reply、attachments、images、files 或 result，避免同一文字或附件再出现一份。

### 6.3 内容块

| type       | 字段                                      | 用途                    |
| ---------- | --------------------------------------- | --------------------- |
| text       | text                                    | 用户文字，原样保留换行及有意义的空白    |
| image      | attachmentId、name、mimeType、size、path    | 图片文件的缓存引用             |
| file       | attachmentId、name、mimeType、size、path    | 普通文件的缓存引用             |
| diagnostic | toolId、name、code、message，以及存在时的 details | 用户明确附入的结构化诊断，放在其选择的位置 |

附件字段约定：

- attachmentId 是稳定标识，重复读取不变。不同文件允许同名，不能以 name 为主键。
- 同一附件若被用户明确引用多次，可在多个位置出现同一 attachmentId，但物理文件只保存一份。
- name 是可识别的原文件名；存储名由内部 ID 生成，避免覆盖。
- mimeType 由当前内部 mime 映射，普通文件无法可靠识别时使用 application/octet-stream。
- size 为原始字节数，普通文件允许 0 字节。
- path 必须是缓存副本的绝对路径，不能指向用户原文件或仅在 Electron 内有效的 human-cli-asset URL。
- 首版经校验的 PNG/JPEG/GIF/WebP 归为 image；其他附件按 file 保存。非首版预览格式如 SVG 可作为普通文件交付。
- 不默认附加 Base64、自动摘要、哈希、上传时间或图片尺寸。

诊断也进入同一有序内容流，不再维护第二份顶层 diagnostics。日志文件作为 file；同一份诊断不自动生成重复文件。completed 只表示用户已提交，即使诊断包含插件失败，也不等于协助调用发生系统错误。

### 6.4 空回复与纯文字

空提交：

```json
{
  "schemaVersion": 1,
  "requestId": "28b45b5c-aefc-48fa-b38d-facaa611ff50",
  "status": "completed",
  "content": []
}
```

纯文字只包含一个 text 块；仅图或仅文件直接包含相应块，不生成占位文字。空编辑器产生的纯空白块可忽略，但不对真实文字统一 trim；用户自己输入“已完成”时必须保留。

## 7. 软件目录下的缓存

### 7.1 目录布局

```text
<软件目录>/
  human_cli.exe
  cache/
    <requestId>/
      request.json
      reply.json
      attachments/
        <attachmentId>.png
        <attachmentId>.json
```

- 发布版的软件目录指 human_cli.exe 所在目录，不是 resources/app，也不是调用者当前工作目录。
- 源码运行时指项目根目录。应显式区分源码与发布环境，不能拿 Node 的 process.execPath 当作项目目录。
- CLI、MCP 与桌面进程使用同一缓存根目录。仅调整回复缓存位置，不要求同时搬迁 state.json、runtime.json、插件配置和偏好。
- 当前代码默认仍使用 LOCALAPPDATA 下的缓存；软件目录缓存属于待实现变化，不能把现状描述成已经实现。
- 发布目录不可写时应明确报错，不能静默换到其他目录再声称回复保存在软件目录。

### 7.2 保存与读取

1. 用户插入附件时，将原始字节复制到工具管理的存储并记录内容块位置。
2. 提交前等待所引用附件全部保存成功，冻结有序内容块。
3. 在缓存 attachments 目录准备持久副本，再原子写入 reply.json；成功后才向 AI 返回这些路径。
4. AI 直接根据 content 中的 path 打开文件或图片，不必遍历软件目录猜文件位置。

如果前面有上传、复制或落盘失败，不得提交一个缺失附件的成功回复；保持可重试状态并明确报错。原文件移动或删除不影响缓存副本。

缓存回复在应用退出、AI 断线、重复读取和重启后仍应可用；不因一次成功读取自动删除。用户明确丢弃缓存时，删除不再引用的附件并保留 discarded 标记。已经读取的内容无法撤回。

### 7.3 路径稳定性与旧缓存

- 日常调用返回的 path 是当次实际解析出的绝对路径；内部存储受管理的附件 ID 与相对文件位置。
- 软件目录整体移动后，不能继续盲用旧缓存 JSON 中的旧绝对路径。下次启动或查询时，以当前软件根目录重新生成缓存路径和回复投影。
- 已经交给 AI 的旧绝对路径不能自动变更；AI 通过 result/wait 重新查询取得新路径。
- 首次切换缓存目录时复制旧缓存并验证完整性，再启用新位置；保留旧源，不直接删除历史数据。
- 文件路径属于运行 human_cli 的机器。本方案面向 AI 能读取该文件系统的使用方式；跨机器时需要已有共享访问，不在本次增加下载服务。

## 8. CLI 与 MCP 交付方式

- CLI request/wait/result 返回第 6 节的同一 JSON，stdout 只输出一次最终结果；不混入二进制或 Base64。
- MCP 返回一个 text 内容块，其 text 是同一 JSON。不附 image 内容块，不额外读取/编码图片，也没有 imagePage、contentIndex 或图片补页。
- MCP 的外层 content 是工具协议包装；其中 JSON 的 content 才是用户有序回复。两层含义不同，解析后按内层数组阅读。
- 更新工具描述，明确“附件以本地路径交付，请按需读取图片和文件”。不宣称给了 path 就代表 AI 已看到图片。
- 既然已有可直接读取的文件，此次不新增 attachment 下载命令、二进制传输接口或 Base64 分块能力。
- get/logs/list/plugins 保留各自查询用途和完整恢复信息；正常回复不附整套缓存路径或任务快照。

本方案减少的是工具返回负担。AI 是否能够读取路径取决于它自己的文件/图片工具与权限；绝对路径本身不是图片内容。

## 9. 编辑与提交怎样保序

仅改变返回 JSON 无法恢复原有界面未保存的穿插位置，需要同步调整草稿模型：

- 编辑器按内容块保存文本、图片和文件，允许在光标/选定位置插入附件、继续输入，以及移动或删除块。
- 内部为编辑块保留稳定 blockId，用于定位异步上传和编辑；对外以数组顺序表达，默认不输出内部 blockId。
- 插入附件时立即建立原位置的上传占位块，完成后替换该块；不能按上传完成时间把所有附件追加到末尾。
- 多文件一次插入按输入列表顺序建立占位，用户之后可手动重排。
- 待保存的文本草稿、块位置与附件引用使用同一提交快照；提交前等待所有引用的上传结束。
- 附件上传失败应显示在原块位置并阻止带着该失败项成功提交，用户可以重试或移除。
- 仅当合并不改变位置与文字时才可合并相邻 text 块；不得越过图片、文件或诊断合并。

这是支持穿插所需的编辑能力设计，不将已知的偶发丢字问题视为已经解决，也不顺带排查该独立问题。

## 10. 后台、取消、丢弃和错误

- 后台创建仅返回 schemaVersion、requestId、实际 status，不自动发送用户草稿。幂等键命中已结束请求时返回真实终态，result/wait 可取回复。
- AI 取消返回 status=cancelled，存在时附 cancelReason，不发送未提交内容。
- 缓存已丢弃时仍为 status=completed，额外 replyState=discarded，省略 content，不能返回旧文字或旧附件路径。
- CLI 调用失败通过 stderr 返回结构化 error，含 code、message 及已知 requestId，退出码非零；MCP 使用 isError=true，携带同等信息。
- stderr 的 waiting_for_user 默认只含 event、requestId；已知 ID 用 wait/result 恢复，忘记 ID 用 logs 找到缓存。
- 不给用户操作设置期限，断线只结束当前等待，不自动取消请求或丢弃回复；默认 request 继续在同一次调用内等待用户提交。
- 不引入接收确认、已读回执或“AI 已读附件”状态。

## 11. 普通文件与存储约束

- 插件生成的文件不自动等于用户提交；只有用户附入或原有明确 autoAttach 策略选中的内容进入回复，其位置也必须记录。
- 建议初始限额：最多 8 张图片、单图 5 MiB；普通文件单个 20 MiB；图片与文件合计最多 20 个引用块、不同文件总计 100 MiB。这是拟定限额，前端、IPC、存储与插件入口应共享校验，后续可配置。
- PDF、JSON、CSV、DOCX、ZIP 等保存原始字节，不自动解析、解压或执行；声称是受支持图片却内容校验失败时明确拒绝。
- name 去除路径成分，存储名由附件 ID 生成；扩展名规范化，未知类型使用 .bin。
- 当前清理只匹配 png/jpg/gif/webp/txt，需改为根据受管理文件记录清理；操作前验证绝对路径仍位于相应目录。
- 删除某个内容块不应立即删除仍被其他内容块、工具结果或缓存引用的文件；丢弃后的清理同样检查引用。
- 内部完整快照继续为 UI、插件及 get/logs 服务，不因精简对外结构而删除任务正文、工具定义和恢复信息。

## 12. 实施与迁移

| 模块                                  | 计划职责                                 |
| ----------------------------------- | ------------------------------------ |
| 新增 adapters/reply.mjs               | 共享有序回复投影，只返回精简信封和实际提交内容              |
| adapters/human.mjs                  | 保留创建并等待流程，调用者取得快照后统一投影               |
| adapters/cli.mjs                    | 统一 request/wait/result/cancel，精简等待事件 |
| adapters/mcp.mjs                    | 返回同一 JSON 的 text 包装，移除新格式的图片编码/分页逻辑  |
| adapters/http.mjs                   | 保留完整查询，提供路径结果，避免新格式继续取 Base64 图片     |
| core/requests.mjs                   | 有序草稿、原子提交快照、附件归属及真实文字                |
| core/paths.mjs、core/cache.mjs       | 软件根目录下的回复缓存、路径重建与旧缓存迁移               |
| core/attachments.mjs                | 普通文件、统一限额与引用清理                       |
| desktop/ipc.mjs、desktop/preload.cjs | 有序草稿提交与通用附件能力                        |
| src/main.js、src/views.js            | 内容块编辑、插入位置、上传占位和提交保护                 |

推荐先确定 Schema 与缓存位置，再补齐有序编辑和文件能力，最后接入 CLI/MCP、更新文档与打包验证。仅从旧 images 映射出的新 JSON 不能算已经实现穿插编辑。

历史记录没有文字/附件插入位置，只能明确按“旧文字 → 旧图片原顺序 → 旧诊断原顺序”迁移，不能声称还原了原本未保存的穿插位置。旧占位“已完成”需结合草稿和存在的提交标记判断，证据不足则保留；新记录保存明确提交语义。only=true 仍表示不提交准备好的草稿和附件，对外 content=[]。

新默认结构属于协议变更。若需要过渡兼容，可保留显式 CLI --format legacy 与 MCP format=legacy；旧格式仅用于已有调用者，普通文件及穿插顺序以新格式为准。旧图片 Base64/分页如为兼容保留，也必须只限显式 legacy，不再作为新默认行为。legacy 无法无损表达穿插，应明确其限制，不悄悄改变新格式顺序。

## 13. 实施验收

本次仅更新方案，以下运行时验收尚未执行：

| 场景                  | 验证内容                            |
| ------------------- | ------------------------------- |
| 文 → 图 → 文 → 文件 → 文  | UI、草稿、缓存和 CLI/MCP 都保持同一顺序       |
| 多文件异步保存、拖动重排        | 不按完成时间重排，提交前所有引用均已落盘            |
| 空提交、纯文字、用户输入“已完成”   | 无占位回复，真实文字只出现一次                 |
| 仅图、仅文件、混合、同名、0 字节文件 | 路径存在、字节一致，ID 与物理副本正确            |
| 原文件删除、应用退出、断线与重启    | 缓存可读，重复查询不删除数据                  |
| 软件目录含中文/空格、不同工作目录启动 | 正确使用软件目录，返回真实绝对路径               |
| 软件目录整体移动            | 重新查询后路径更新，不继续返回旧位置              |
| 软件目录不可写、复制失败、上传失败   | 明确失败、可重试，不静默漏附件或换目录             |
| CLI/MCP 输出          | 相同业务 JSON，不含 Base64、图片块、分页或重复快照 |
| 插件附入、重复引用、删除与丢弃     | 位置明确、引用清理正确，不泄漏未提交/已丢弃内容        |
| 旧记录与旧缓存迁移           | 历史保留，迁移顺序明确，不虚构原始穿插位置           |
| 类型伪装、超限、附件归属        | 统一校验，不跨请求引用或越界读写/清理             |
| 发布包                 | 原生 CLI/MCP 正常，查询不创建便签，同次等待且无需回执 |

已知“回复框偶发丢失字母”见 [KNOWN-ISSUES.md](KNOWN-ISSUES.md)，继续遵循用户“先记录、暂不修复”的约定。
