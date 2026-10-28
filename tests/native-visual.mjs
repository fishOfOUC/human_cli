import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const output = resolve('.qa', `visual-${randomUUID().slice(0, 8)}`);
mkdirSync(output, { recursive: true }); process.env.HUMAN_CLI_DATA_DIR = join(output, 'data');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  try {
    const main = await import('../desktop/main.mjs'); await main.ready;
    const runtime = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'runtime.json'), 'utf8'));
    const response = await fetch(`${runtime.url}/requests`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '帮我确认一下，\n深色界面是否正常。', agent: 'AI Agent', steps: ['打开设置 → 外观', '检查文字和按钮', '附图告诉我结果'] }) });
    const request = await response.json();
    const win = BrowserWindow.getAllWindows().find((w) => w.requestId === request.id);
    await sleep(500);
    for (const theme of ['paper', 'sage', 'light', 'dark']) {
      await win.webContents.executeJavaScript(`window.humanCli.preferences({theme:${JSON.stringify(theme)}})`, true);
      await sleep(120); writeFileSync(join(output, `note-${theme}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await win.webContents.executeJavaScript('document.querySelector("[data-pane=settings]").click()', true);
    await sleep(100); writeFileSync(join(output, 'settings-dark.png'), (await win.webContents.capturePage()).toPNG());
    console.log(`VISUAL OUTPUT ${output}`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { if (process.exitCode) app.once('will-quit', () => app.exit(process.exitCode)); app.quit(); }
}
void run();
