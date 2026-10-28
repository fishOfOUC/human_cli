# AI 接入与本地缓存

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
| `human_request` | 请求用户协助，默认等待并返回最终文字和图片；支持幂等键 |
| `human_wait` | 恢复已有请求的等待，或补取图片后续页 |
| `human_logs` | 按便签创建时间倒序查询标题、时间、状态及本地缓存绝对路径 |
| `human_get` | 即时查询指定请求及草稿、结果 |
| `human_update` | 携带版本更新 pending 请求 |
| `human_cancel` | AI 取消 pending 请求 |
| `human_list` | 列出请求和缓存状态 |

## 正常调用

1. 查询插件，调用 human_request。
2. 同一次调用会显示便签并等待用户完成或 AI 取消，不设用户操作期限。用户打字、保存草稿或收起窗口都不会结束调用。
3. 调用直接返回文字、诊断和 image 内容块。若 imagePage.nextOffset 非 null，用 human_wait({ requestId, imageOffset }) 补取后续图片页。

只有明确需要后台任务时才设置 background: true，此时 human_request 立即返回请求 ID；之后可用 human_wait 恢复等待。默认 background 为 false。

收到结果后即可继续自己的工作，无需确认收到。回复统一保留到本地缓存，界面显示“回复已保存”，不维护待交付、已读或交付回执状态。

human_request 和 human_wait 都不提供用户完成超时参数。客户端宿主可以有自己的超时；连接断开只撤销本次等待监听，不取消便签或删除内容。

## AI 重启后的恢复

如果此前调用失败，或 AI 已忘记 requestId，调用：

```json
{"limit": 50, "offset": 0}
```

`human_logs` 返回类似：

```json
{
  "cacheDirectory": "C:/Users/用户名/AppData/Local/human_cli/cache",
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
      "directory": "C:/Users/用户名/AppData/Local/human_cli/cache/请求UUID",
      "requestPath": "C:/Users/用户名/AppData/Local/human_cli/cache/请求UUID/request.json",
      "replyPath": "C:/Users/用户名/AppData/Local/human_cli/cache/请求UUID/reply.json"
    }
  }],
  "nextOffset": null
}
```

AI 根据标题和时间找到原便签，直接读取 replyPath；其中的 images[].path 是图片文件的绝对路径，可以用自身的图片读取工具打开。requestPath 保存说明、状态、草稿、工具结果及完整回复快照。JSON 为 UTF-8，不包含图片 Base64，图片保留为独立原始文件。

创建时间 createdAt 是排序依据，不因后续编辑改变。limit 默认 50、最大 200，offset 从 0 开始；nextOffset 非 null 时继续翻页。返回所有请求，pending 表示用户尚未完成，cancelled 表示 AI 已取消；没有回复时 replyPath 为 null。时间使用 ISO 8601 UTC。

## 缓存布局与生命周期

```text
%LOCALAPPDATA%/human_cli/cache/
  <requestId>/
    request.json
    reply.json          # 完成且未丢弃时存在
    attachments/        # 该便签仍引用的图片及工具附件
      <attachmentId>.png
```

缓存目录位于工具数据目录下；设置 HUMAN_CLI_DATA_DIR 后，缓存也跟随该目录。每张便签创建及后续变更都会更新 request.json，用户完成后原子写入 reply.json。附件复制到便签自己的目录，不依赖正在运行的图片 URL。重启时根据持久状态重建缓存，旧版回复也会迁移保留。

所有回复统一保存，不尝试通过连接状态推断 AI 是否接收成功。成功调用、重复读取均不删除文件；当前无自动过期策略。用户可以在便签中明确丢弃缓存回复，删除 reply.json、回复内容和不再被工具结果引用的附件，日志保留 discarded 标记及请求记录。丢弃不能撤回 AI 已经读取的内容。

## 非 MCP 脚本

```powershell
./human_cli.exe request ./resources/app/examples/request.json
# 这一条命令默认等到用户完成，再返回回复。
./human_cli.exe logs 50 0
./human_cli.exe result <请求ID>
```

CLI request 默认等待用户完成；只有 --background 明确后台创建并立即返回 ID。wait <ID> 用于恢复等待已有任务。还支持 get、cancel、list、plugins；--help 显示用法。request - 从标准输入读取 UTF-8 JSON，最终输出写入 stdout，等待开始的 waiting_for_user 元数据和错误写入 stderr；错误返回非零退出码。

HTTP 接口为 `GET /logs?limit=50&offset=0`，使用现有本机 Bearer 认证。日志接口不读取调用者指定的任意路径，仅返回工具管理的缓存位置。

默认数据目录 `%LOCALAPPDATA%/human_cli`；适配器和桌面端应使用相同 HUMAN_CLI_DATA_DIR。runtime.json 含访问令牌，不是可分享配置。HUMAN_CLI_NO_AUTOSTART=1 可关闭自动启动。

缓存路径指向运行 human_cli 的机器。AI 若运行在另一台机器，需要自己已有的文件访问方式；human_cli 不会自动暴露文件到公网，也不会向已经结束的 AI 会话主动注入消息。
