import { ipcMain, dialog, clipboard } from 'electron';
import { writeFileSync } from 'node:fs';
import { fail, errorData } from '../core/errors.mjs';

export function registerIpc(service, windows, configUis) {
  const state = (win) => ({ request: service.snapshot(win.requestId), preferences: service.store.data.preferences, configUi: configUis?.snapshot(win) || null });
  const broadcast = () => {
    for (const win of windows.windows.values()) if (!win.isDestroyed() && service.get(win.requestId).status === 'pending') { win.setAlwaysOnTop(service.store.data.preferences.pinned); win.webContents.send('human-cli:state', state(win)); }
  };
  service.on('change', broadcast); service.on('preferences', broadcast); service.on('connection', broadcast);
  configUis?.on('change', (win) => { if (win && !win.isDestroyed()) win.webContents.send('human-cli:state', state(win)); });
  ipcMain.handle('human-cli:command', async (event, { action, data = {} }) => {
    try {
      const win = windows.forSender(event.sender);
      fail(win && event.senderFrame === event.sender.mainFrame && event.senderFrame.url.startsWith('human-cli-app://ui/'), 'E_SENDER', '无效的桌面调用来源。', 403);
      const id = win.requestId;
      const needRequest = () => fail(id, 'E_NO_REQUEST', '当前没有 AI 请求。');
      switch (action) {
        case 'bootstrap': return { ok: true, value: state(win) };
        case 'hide': void configUis?.close(win); win.minimize(); break;
        case 'preferences': service.preferences(data); break;
        case 'resize': {
          const b = win.getBounds();
          fail(Number.isFinite(data.width) && Number.isFinite(data.height), 'E_BOUNDS', '无效的窗口尺寸。');
          win.setBounds({ ...b, width: Math.max(340, Math.min(1600, Math.round(data.width))), height: Math.max(300, Math.min(1200, Math.round(data.height))) });
          windows.displayChanged(); break;
        }
        case 'copyText': fail(typeof data.text === 'string' && data.text.length <= 100000, 'E_CLIPBOARD', '复制内容无效。'); clipboard.writeText(data.text); break;
        case 'draft': needRequest(); service.draft(id, data); break;
        case 'complete': needRequest(); service.complete(id, data); break;
        case 'addImage': needRequest(); service.addImage(id, { name: data.name, mime: data.mime, bytes: data.bytes }); break;
        case 'removeImage': needRequest(); service.removeAttachment(id, data.id); break;
        case 'attachImage': needRequest(); service.attach(id, data.id); break;
        case 'attachError': needRequest(); service.attachError(id, data.id); break;
        case 'removeError': needRequest(); service.removeError(id, data.id); break;
        case 'configureTool': needRequest(); service.configure(id, data.id, data.config); break;
        case 'openConfigUi': needRequest(); return { ok: true, value: await configUis.open(win, data.id, data.bounds) };
        case 'closeConfigUi': await configUis.close(win); break;
        case 'configUiBounds': configUis.setBounds(win, data.id, data.bounds); break;
        case 'runTool': needRequest(); service.run(id, data.id).catch(() => {}); break;
        case 'saveResult': {
          needRequest(); const r = service.get(id), tool = r.tools.find((t) => t.id === data.id);
          fail(tool, 'E_TOOL', '工具不存在。');
          const attachment = !tool.error && tool.output?.attachments?.[0];
          const a = attachment && service.attachments.forRequest(attachment, id);
          const text = tool.error ? `${tool.error.code}\n${tool.error.message}\n${tool.error.details || ''}` : tool.output?.text;
          fail(a || text, 'E_RESULT', '工具还没有结果。');
          const name = service.snapshot(id).tools.find((item) => item.id === data.id)?.manifest.name || tool.plugin;
          const selected = await dialog.showSaveDialog(win, { defaultPath: a?.name || `${name}-结果.txt` });
          if (!selected.canceled) writeFileSync(selected.filePath, a ? service.attachments.bytes(a.id) : text, { encoding: 'utf8' });
          return { ok: true, value: !selected.canceled };
        }
        default: fail(false, 'E_ACTION', '不支持的桌面操作。');
      }
      return { ok: true };
    } catch (error) { return { ok: false, error: errorData(error) }; }
  });
  return { state, broadcast };
}
