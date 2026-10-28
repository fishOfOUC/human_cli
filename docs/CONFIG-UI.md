# 插件自己的配置界面

本地新增实现，尚未发布。SPI v1 保持兼容：缺省仍是通用表单；声明 web 的插件可以提供自己的网页。

## 清单

spi.describe 中的插件清单增加可选 configUi：

```json
{
  "apiVersion": 1,
  "id": "my.capture",
  "name": "我的采集工具",
  "side": "right",
  "configSchema": {
    "type": "object",
    "properties": {"profileId": {"type": "string"}},
    "required": ["profileId"],
    "additionalProperties": false
  },
  "configUi": {"type": "web", "path": "/ui/settings"}
}
```

configUi 为 {"type":"none"} 时没有配置界面；右键仅显示结果及“无需配置”提示，不显示空表单或保存设置按钮。仍需声明空的 configSchema 对象，例如 {"type":"object","properties":{},"additionalProperties":false}。

configUi 缺省或 type=schema：由 human_cli 生成现有表单。type=web：提供者还需实现本文四个 SPI 方法，并自行提供 HTML、JS、CSS 以及页面所需的 HTTP API。configSchema 仍然用于宿主校验，不能因为有网页而省略。

path 是同提供者 origin 的绝对路径，不含查询参数、片段或凭据。配置页面及资源由提供者自己托管；不要求特定前端框架或后端语言。

## 用户交互

- 左键书签直接执行，不打开或跳转设置。
- 右键或 Shift+F10 打开共用工具页，web 插件默认显示配置页；“结果”标签显示执行结果。
- 页面中的保存按钮提交设置。宿主校验、持久化成功后，页面才显示保存成功。
- 关闭、返回便签、切换结果页会结束配置会话，放弃尚未提交的修改；已经保存的配置保留。
- AI 更新说明、取消请求或用户完成，会关闭当前配置页。工具运行期间的配置提交会被拒绝，保留原配置。

配置页不创建新的顶层窗口，不扩大便签尺寸；独立网页容器跟随共用区域缩放。提供者应使用可滚动内容和可见的保存/取消控件适配小窗口。

## 会话和保存流程

```text
打开 → editing → submitted → saved
                      ↘ editing + error
任意阶段 → closed
```

sessionId 由宿主生成，为 UUID；与插件执行的 runId 无关。一个窗口同时只有一个配置会话。提交 id 由提供者生成，每次用户提交使用一个新 UUID；同一提交重试不得改变内容。

### spi.ui.open

宿主通过带原有 Bearer 认证的 SPI 通道发送：

```json
{
  "sessionId": "会话UUID",
  "pluginId": "my.capture",
  "config": {"profileId": "default"},
  "request": {"id": "请求UUID", "title": "协助任务"},
  "theme": "paper"
}
```

返回：

```json
{
  "sessionId": "会话UUID",
  "url": "https://plugin.example/ui/settings#session=会话UUID&key=仅此会话的随机凭据"
}
```

URL 必须与 SPI 提供者同源，位于 configUi.path 本身或其子路径。宿主不会把 SPI 长期令牌、AI 接口令牌或 Node/IPC 桥传给页面。提供者应生成独立会话凭据，页面通过自己的 HTTP API 读取和编辑该会话；不要在 URL 中复用 SPI 长期令牌，宿主会拒绝明确复用的查询或片段参数。

theme 为 paper、sage、light、dark，表示打开时的宿主主题；页面自行应用。当前不推送主题的中途变化，重新打开时获取最新主题。

open 应当按 sessionId 幂等。close 后不能通过重复 open 复活同一个会话。

### spi.ui.status

宿主在页面打开期间查询，不设置用户编辑总时限：

```json
{"sessionId": "会话UUID"}
```

普通编辑时返回：

```json
{"sessionId": "会话UUID", "state": "editing"}
```

用户在插件网页中点击保存，提供者暂存提交，返回：

```json
{
  "sessionId": "会话UUID",
  "state": "submitted",
  "submission": {
    "id": "提交UUID",
    "config": {"profileId": "profile-v2"}
  }
}
```

config 必须是 JSON 对象，序列化 UTF-8 不超过 256 KB。单次只允许一个未决提交；在宿主 resolve 前保持原提交内容和 ID。状态也可为 saved 或 closed。closed 表示用户在插件页取消，宿主随即销毁页面和会话。

### spi.ui.resolve

宿主检查请求版本、配置是否冲突、工具是否正在运行，以及 JSON Schema。校验通过并持久化后发送：

```json
{
  "sessionId": "会话UUID",
  "submissionId": "提交UUID",
  "accepted": true,
  "config": {"profileId": "profile-v2"}
}
```

config 是宿主实际保存的值，可能包含 Schema 默认值。提供者返回 {sessionId, state: "saved"}，此时其网页可以显示已保存。

拒绝时发送：

```json
{
  "sessionId": "会话UUID",
  "submissionId": "提交UUID",
  "accepted": false,
  "error": {"code": "E_PLUGIN_CONFIG", "message": "插件配置无效。"}
}
```

提供者返回 {sessionId, state: "editing"}，保留页面草稿并显示错误；用户修改后使用新提交 ID 重试。

resolve 必须幂等。收到同一个提交的重复 resolve 时返回已有结果，不再次执行保存副作用。响应丢失时，宿主不会重复修改本地配置；可以重发 resolve 或通过 status=saved 恢复显示。

### spi.ui.close

```json
{"sessionId": "会话UUID"}
```

提供者回收页面会话、使会话凭据失效，返回 {sessionId, closed: true}。close 应当幂等，重复关闭或关闭尚未完成打开的会话均应安全；异步 open 完成时也要检查是否已关闭。

离开编辑页会主动 close。网络分区或进程被强制关闭时只能尽力清理，提供者负责回收失联会话；不要给仍在正常连接和编辑的用户设置固定完成期限。

## 配置归属

普通配置由宿主按请求绑定保存，并更新插件默认值；后续 spi.start 收到已保存配置。未保存的网页草稿不进入请求配置。检测到其他操作修改了配置，会关闭旧编辑会话，要求重新打开。

账号凭据等私有内容可以由提供者保存，configSchema 只返回 profileId 等引用。应使用持久化、不可变的配置版本引用：先准备新版本，再提交引用；不要在未获宿主接受时直接改写当前正在使用的配置。未采用的版本由提供者清理。

## 网页容器边界

使用独立的 Electron WebContentsView，sandbox/contextIsolation 开启、Node 关闭，无宿主 preload。每个会话有独立内存浏览器分区，关闭后清理存储。

页面仅可请求本提供者 origin 的资源；顶部导航还必须停留在 configUi.path 下。第三方 CDN、弹窗、外部导航、宿主窗口移动/缩放、下载及设备权限不开放。前端构建产物应由提供者同源托管。需要外部浏览器 OAuth 等额外流程时，需要另行扩展明确的交互机制，当前没有提供。

连接暂时失败时显示可复制错误，保留已加载编辑页及输入，自动重连；会话无效、页面加载失败或渲染进程退出时关闭页面，提供重新连接入口。保存失败不覆盖原配置或默认值。

实现依据：[WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)、[Electron Session](https://www.electronjs.org/docs/latest/api/session)、[Electron 安全边界](https://www.electronjs.org/docs/latest/tutorial/security)。

## Node 参考服务器的接入点

startSpiServer 可选传入 configUi 对象：

```javascript
startSpiServer({
  plugins,
  execute,
  configUi: {
    open(params, { origin }) { /* 返回 sessionId / 页面 URL */ },
    status(params) { /* 返回编辑或提交状态 */ },
    resolve(params) { /* 幂等记录宿主保存结果 */ },
    close(params) { /* 使会话凭据失效 */ },
    async handleHttp(req, res) { /* 仅处理自己的 UI 路由；已处理返回 true */ },
    dispose() { /* 服务停止时回收会话 */ }
  }
});
```

handleHttp 在 SPI 鉴权前处理网页路由，因此页面自己的会话认证、来源检查和提交大小限制由提供者负责；未处理的请求返回 false，继续走原有 SPI 认证。

## 本地验证

```powershell
npm test
npm run build
npm run test:config-ui
```

测试提供者位于 tests/fixtures/web-config-provider.mjs，仅加载到专用 .qa 数据目录，不注册到用户插件目录，也不进入发布包。验证报告和真实窗口截图保存在 .qa/config-ui-*，不上传。
