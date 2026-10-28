# 功能插件：网络 SPI

human_cli 的插件客户端只通过网络 SPI 连接服务提供者，不要求插件采用 JavaScript，也不把外部服务的代码加载到便签进程。Python、Java、C#、Go、Node 等只要提供相同 HTTP JSON-RPC 接口，就可以生成侧栏按钮。

SPI 是本项目的服务提供者协议：HTTP + JSON-RPC 2.0，版本为 human_cli SPI v1。完整线协议见 [SPI.md](SPI.md)。

## 接入一个服务

1. 启动服务提供者。
2. 在 `%LOCALAPPDATA%\human_cli\plugins\providers.json` 中添加它的地址与令牌。
3. 重启 human_cli，让 AI 调用 `human_plugins` 查看目录，再在请求中绑定按钮。

```json
{
  "version": 1,
  "providers": [{
    "id": "my-python-service",
    "url": "http://127.0.0.1:7788/rpc",
    "token": "服务的访问令牌",
    "enabled": true
  }]
}
```

服务可在本机独立进程，也可在可访问的其他机器。远程服务操作的是它所在机器的资源；访问用户本机屏幕、剪贴板等需要本机提供者。远程部署建议 HTTPS。服务目录在启动时发现，不包含自动启动任意外部服务或热重载功能。

## Python 示例

已有不依赖第三方库的完整服务：`examples/spi-python/provider.py`。

```powershell
python examples/spi-python/provider.py --port 7788
```

它输出自己的 url 和随机 token，把二者填进 providers.json。该服务提供 `example.python-note`，支持中文配置、文字结果和 Base64 附件，未导入任何 human_cli 或 Node 模块。也可通过 `HUMAN_CLI_SPI_TOKEN` 指定固定令牌。

AI 绑定示例：

```json
{
  "title": "帮我记录现场",
  "plugins": [{
    "id": "record",
    "plugin": "example.python-note",
    "side": "right",
    "config": {"prefix": "现场说明", "includeImage": false}
  }]
}
```

## 服务需要提供什么

一个服务可以提供多个插件。`spi.describe` 返回每个插件的 id、名称、图标、缺省侧栏位置及配置 JSON Schema。清单不需要 entry 或语言信息。

用户左键点击时，human_cli 发送 `spi.start`，随后查询 `spi.status`。按钮状态由返回的 running / completed / failed / cancelled 映射为蓝 / 绿 / 红。右键统一显示结果、配置、错误与保存入口。

服务返回：

```json
{
  "text": "已采集完成",
  "attachments": [{
    "name": "现场.png",
    "mime": "image/png",
    "data": "Base64编码的真实图片内容"
  }]
}
```

human_cli 将网络附件解码、校验并保存在本机。插件结果每次最多 8 个附件、单个最多 5 MB，支持 PNG/JPEG/GIF/WebP 和纯文本。布尔配置项 autoAttach 可让图片自动加入回复；若结果还含 replyText，则附言也加入回复。附言作为可移除的附件条保存，完成时合并进最终文字，不覆盖用户草稿；关闭后只保留工具结果。

配置表单由 JSON Schema 生成；服务负责自己的业务逻辑和资源访问，human_cli 不要求自定义 HTML 或特定前端框架。

## 异步任务、断线与取消

`spi.start` 应尽快返回 runId/state，把长操作作为服务任务执行；human_cli 持续查询 status，不给网络插件设置总运行时间。每次网络请求有连接故障检测时限，它不是插件作业期限，更不是用户操作期限。

runId 由 human_cli 生成。相同 runId 重试 start 不得重复执行副作用。AI 更新、取消请求或用户完成后，human_cli 尽力发送 `spi.cancel`。网络分区时不能保证远端动作已经停止，因此提供者应实现幂等、取消和任务记录。

结果成功复制到本机后，human_cli 发送 `spi.forget` 释放服务端记录；提供者也应清理孤立的已结束任务。服务暂时不可达或结果无效只让该工具报错，不取消人机协作请求，不影响本地草稿和缓存回复。

## 内置服务与旧插件兼容

四个内置插件仍然可用：human.screenshot、human.open-url、human.clipboard、human.diagnostics。它们由 human_cli 自动启动的本机 SPI 提供者暴露；上层请求服务也通过网络连接它们。

此前的 manifest.json + plugin.mjs 插件继续作为兼容格式。把目录放进用户 plugins 下，它会由内置服务中的独立 Worker 适配成 SPI。`examples/plugins/clipboard-note` 保留为兼容示例。

兼容 Worker 默认的 30 秒保护只针对这类旧插件的单次代码执行，与人类完成请求无关。Worker 是故障隔离，不是第三方 Node 代码的安全沙箱。新插件推荐直接实现网络 SPI，不需要采用这套旧格式。

## 截图并附言示例

[examples/plugins/cursor-capture-reply](../examples/plugins/cursor-capture-reply/README.md) 是可直接安装的本机能力插件。它由内置本机 SPI 提供者通过 Worker 适配，调用 screen.capture 选择 cursor，再返回图片及 replyText。网络 SPI 客户端使用同一结果约定；独立语言服务也可返回该字段。请求示例见 examples/cursor-capture-request.json。
