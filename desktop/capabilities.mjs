import { desktopCapturer, screen, clipboard, shell, app, nativeImage } from 'electron';
import { platform, release, arch } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fail } from '../core/errors.mjs';

export function createCapabilities(windows) {
  return {
    'clipboard.read': () => clipboard.readText(),
    'clipboard.write': ({ text }) => { fail(typeof text === 'string' && text.length <= 100000, 'E_CLIPBOARD', '剪贴板内容过长。'); clipboard.writeText(text); return true; },
    'shell.openUrl': async ({ url }) => {
      const target = new URL(url); fail(['https:', 'http:'].includes(target.protocol), 'E_URL', '仅允许打开 http/https 页面。');
      fail(!target.username && !target.password, 'E_URL', '页面地址不能包含账户凭据。');
      await shell.openExternal(target.href); return true;
    },
    'system.info': () => ({ platform: platform(), release: release(), arch: arch(), humanCliVersion: app.getVersion(), electron: process.versions.electron, displays: screen.getAllDisplays().map(({ id, workArea, scaleFactor }) => ({ id, workArea, scaleFactor })), time: new Date().toISOString() }),
    'screen.capture': async ({ display = 'cursor', delayMs = 500 }) => {
      fail(Number.isInteger(delayMs) && delayMs >= 0 && delayMs <= 10000, 'E_CAPTURE_DELAY', '截图等待必须为 0 至 10000 毫秒。');
      const selected = display === 'primary' ? screen.getPrimaryDisplay() : display === 'cursor' ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getAllDisplays().find((d) => String(d.id) === String(display));
      fail(selected, 'E_DISPLAY', '选择的显示器已断开，请重新选择。');
      return windows.withoutNotes(async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        if (process.platform === 'win32') {
          // Chromium can return empty display_id on Windows. Capture an exact physical
          // rectangle instead of guessing source order across mixed-DPI monitors.
          const rect = screen.dipToScreenRect(null, selected.bounds);
          const { stdout } = await promisify(execFile)('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
            '-File', join(windows.root, 'desktop', 'capture-windows.ps1'),
            '-X', String(rect.x), '-Y', String(rect.y), '-Width', String(rect.width), '-Height', String(rect.height),
          ], { windowsHide: true, timeout: 20000, maxBuffer: 32 * 1024 * 1024 });
          let image = nativeImage.createFromBuffer(Buffer.from(stdout.trim(), 'base64'));
          fail(!image.isEmpty(), 'E_CAPTURE', 'Windows 未返回有效屏幕图像。');
          const size = image.getSize();
          if (Math.max(size.width, size.height) > 1920) image = image.resize(size.width >= size.height ? { width: 1920 } : { height: 1920 });
          return image.toPNG();
        }
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.min(Math.round(selected.size.width * selected.scaleFactor), 1920), height: Math.min(Math.round(selected.size.height * selected.scaleFactor), 1920) } });
        const source = sources.find((s) => s.display_id === String(selected.id) || (s.display_id && (Number(s.display_id) >>> 0) === (selected.id >>> 0))) || (sources.length === 1 ? sources[0] : undefined);
        fail(source && !source.thumbnail.isEmpty(), 'E_CAPTURE', `未能取得屏幕图像，请检查系统截图权限。屏幕 ${selected.id}；可用源 ${sources.map((s) => `${s.display_id || s.id}${s.thumbnail.isEmpty() ? '(空)' : ''}`).join(', ') || '无'}。`);
        return source.thumbnail.toPNG();
      });
    },
  };
}
