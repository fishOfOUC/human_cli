# human_cli SPI v1 线协议

这是语言无关的服务提供者接口。传输使用 HTTP POST，消息遵循 [JSON-RPC 2.0](https://www.jsonrpc.org/specification)。不要求特定 SDK；可使用任意语言的 HTTP/JSON 实现。

## 传输

- 请求：`Content-Type: application/json`，推荐 UTF-8。
- 认证：配置令牌时发送 `Authorization: Bearer <token>`。
- 每条请求携带 `jsonrpc: "2.0"`、唯一 `id`、`method` 和对象 `params`。
- 响应回显同一个 id，只包含 result 或 error 之一。
- 参考服务只处理单条请求，不要求批量 JSON-RPC；不使用 WebSocket、反向回调或浏览器 CORS。
- human_cli 不跟随端点重定向，避免把令牌转发到另一个服务。

## 发现

请求：

```json
{"jsonrpc":"2.0","id":"catalog-1","method":"spi.describe","params":{}}
```

响应：

```json
{
  "jsonrpc": "2.0", "id": "catalog-1",
  "result": {
    "spiVersion": 1,
    "plugins": [{
      "apiVersion": 1, "id": "example.my-plugin", "version": "1.0.0",
      "name": "我的工具", "description": "采集当前环境",
      "icon": "terminal", "side": "right",
      "configSchema": {
        "type": "object", "additionalProperties": false,
        "properties": {"prefix": {"type": "string", "title": "标题", "default": "记录"}}
      }
    }]
  }
}
```

`spiVersion` 是网络协议版本；`apiVersion` 是插件清单/结果约定版本。插件 id 全局唯一；side 为 left/right；未知图标回退为拼图。当前一个提供者最多暴露 100 个插件。不兼容或不可达的提供者单独报告，不阻止内置服务启动。

## 可选自定义配置界面

清单可以声明 configUi: {"type":"web","path":"/ui/settings"}，并实现 spi.ui.open、spi.ui.status、spi.ui.resolve、spi.ui.close。未声明时按 type=schema 生成现有表单。执行作业仍使用以下五个原有方法，自定义 UI 不改变左键直接执行的语义。完整协议见 [CONFIG-UI.md](CONFIG-UI.md)。

## 开始作业

```json
{
  "jsonrpc":"2.0", "id":"start-1", "method":"spi.start",
  "params":{
    "runId":"00000000-0000-4000-8000-000000000001",
    "pluginId":"example.my-plugin",
    "request":{"id":"请求UUID","title":"协助说明","agent":"AI Agent","project":"项目"},
    "config":{"prefix":"现场记录"}
  }
}
```

返回 `{"runId":"同一个UUID","state":"running"}`。应快速接受任务，耗时工作在服务内部执行；相同 runId 的再次 start 返回已有任务，不能重复触发操作。需要拒绝参数时返回 JSON-RPC error。

## 查询作业

`spi.status` 的 params 为 `{"runId":"..."}`。result 回显 runId，state 为：

| state | 含义与字段 |
| --- | --- |
| running | 继续工作，不携带最终 output |
| completed | output 包含 text 和可选 attachments |
| failed | error 包含 code/message，可附 details |
| cancelled | 已停止；可提供 error 说明 |

completed 示例：

```json
{
  "runId":"00000000-0000-4000-8000-000000000001",
  "state":"completed",
  "output":{
    "text":"记录已生成",
    "attachments":[{"name":"记录.txt","mime":"text/plain","data":"SGVsbG8="}]
  }
}
```

text 最多 100000 字符，最多 8 个附件；每个附件 name/mime/data 必填，data 是规范 Base64，受支持预览图片解码后 1 字节至 5 MiB；普通文件 0 字节至 20 MiB。PNG/JPEG/GIF/WebP 的 MIME 与真实签名必须一致；其他类型按普通文件保存。这里的 Base64 仅用于内部 SPI 传输，默认 AI 回复返回缓存路径。服务附件不使用任意文件路径或远程下载 URL，避免客户端依赖服务所在机器的文件系统。

## 取消和释放

- `spi.cancel({runId})`：尽力停止指定作业，返回 runId 和当前 state。
- `spi.forget({runId})`：human_cli 已复制最终结果或终止运行后，释放记录，返回 `{"forgotten":true}`。不要释放仍在运行的作业。

没有在 SPI 中设置人类操作期限。每个 HTTP 调用的故障检测期限不等于作业期限；一次慢作业可在多次 status 调用之间持续运行。网络分区后取消不能保证已送达，提供者需要管理作业资源及孤立任务。

## 错误

```json
{
  "jsonrpc":"2.0", "id":"status-1",
  "error":{
    "code":-32000, "message":"采集服务暂不可用",
    "data":{"code":"E_CAPTURE_OFFLINE","details":"可供复制或附入回复的诊断内容"}
  }
}
```

保留 JSON-RPC 数值 code，应用错误码放 data.code。状态为 failed 的 job.error 使用相同应用错误结构。错误会进入侧栏状态和通用详情，不修改用户请求或回复交付状态。

## 提供者参考

- `examples/spi-python/provider.py`：独立 Python 标准库实现，支持配置、异步任务、取消、中文及二进制附件。
- `plugins/spi-server.mjs`：Node 参考服务器，可通过 startSpiServer({ plugins, execute }) 提供任意业务。
- `plugins/network-host.mjs`：human_cli 网络客户端与目录校验。

远程服务运行在自己的机器上。它不会因为接入 human_cli 就自动拥有桌面端的屏幕或剪贴板；这些本机能力由内置的本机提供者实现。接入服务应受信任，远程传输建议使用 HTTPS。
