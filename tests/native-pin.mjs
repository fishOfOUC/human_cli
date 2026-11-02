// Inspect real Windows flags and stacking order without global input.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const output = resolve('.qa', `pin-${Date.now()}`);
mkdirSync(output, { recursive: true });
process.env.HUMAN_CLI_DATA_DIR = join(output, 'data');
process.env.HUMAN_CLI_CACHE_DIR = join(output, 'cache');
process.env.HUMAN_CLI_TEST_HIDDEN = '1';
const checks = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(fn) {
  for (let i = 0; i < 150; i++) { const value = await fn(); if (value) return value; await sleep(40); }
  throw new Error('Pin acceptance timed out');
}
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };

async function run() {
  try {
    assert.equal(process.platform, 'win32', 'This acceptance checks Windows native stacking');
    const desktop = await import('../desktop/main.mjs'); await desktop.ready;
    const runtime = JSON.parse(readFileSync(join(process.env.HUMAN_CLI_DATA_DIR, 'runtime.json'), 'utf8'));
    const api = async (path, method = 'GET', body) => {
      const response = await fetch(runtime.url + path, { method, headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value;
    };
    const request = await api('/requests', 'POST', { title: '置顶原生验收', plugins: [] });
    const win = await until(() => BrowserWindow.getAllWindows().find(w => w.requestId === request.id));
    const js = code => win.webContents.executeJavaScript(code, true);
    await until(() => !win.webContents.isLoading() && js('Boolean(document.querySelector("#reply"))'));
    win.showInactive(); await sleep(100);
    const cover = new BrowserWindow({ ...win.getBounds(), show: false, title: '普通窗口遮挡验证', alwaysOnTop: false });
    await cover.loadURL('data:text/html,<body style="background:%23666">普通窗口</body>');
    cover.showInactive(); cover.moveTop();
    const probe = join(output, 'probe.ps1');
    writeFileSync(probe, `param([long]$NoteHandle,[long]$CoverHandle)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class PinProbe {
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  public static string Inspect(IntPtr note, IntPtr cover) {
    int noteIndex=-1, coverIndex=-1, i=0;
    for (IntPtr w=GetTopWindow(IntPtr.Zero); w!=IntPtr.Zero && i<10000; w=GetWindow(w,2),i++) {
      if(w==note) noteIndex=i;
      if(w==cover) coverIndex=i;
    }
    return (GetWindowLongPtr(note,-20).ToInt64()&8)+"|"+noteIndex+"|"+coverIndex;
  }
}
'@
[PinProbe]::Inspect([IntPtr]$NoteHandle,[IntPtr]$CoverHandle)
`);
    const native = () => {
      const handle = w => w.getNativeWindowHandle().readBigUInt64LE().toString();
      const values = execFileSync('powershell.exe', ['-NoProfile', '-File', probe, handle(win), handle(cover)], { windowsHide: true, encoding: 'utf8' }).trim().split('|').map(Number);
      assert.equal(values.length, 3); assert.ok(values[1] >= 0 && values[2] >= 0);
      return { top: values[0] === 8, above: values[1] < values[2] };
    };
    let actual = native();
    check('Pinned note has WS_EX_TOPMOST and stays above a raised ordinary window', actual.top && actual.above && win.isAlwaysOnTop());
    await js('document.querySelector(".pin-control").click()');
    await until(() => !win.isAlwaysOnTop()); cover.moveTop(); actual = native();
    check('Turning pin off clears WS_EX_TOPMOST and allows ordinary windows above it', !actual.top && !actual.above);
    await js('document.querySelector(".pin-control").click()');
    await until(() => win.isAlwaysOnTop()); cover.moveTop(); actual = native();
    check('Turning pin on restores native topmost stacking and the pressed icon', actual.top && actual.above && await js('document.querySelector(".pin-control").getAttribute("aria-pressed")==="true"'));
    win.hide(); win.setAlwaysOnTop(false); win.showInactive();
    await until(() => win.isAlwaysOnTop()); cover.moveTop(); actual = native();
    check('Showing the note repairs a lost native topmost flag without changing its saved preference', actual.top && actual.above);
    win.minimize(); win.setAlwaysOnTop(false); win.restore();
    await until(() => win.isAlwaysOnTop()); cover.moveTop(); actual = native();
    check('Restoring from the taskbar repairs a lost native topmost flag', actual.top && actual.above);
    await js('document.querySelector(".pin-control").click()'); await until(() => !win.isAlwaysOnTop());
    win.hide(); win.showInactive(); await sleep(100); actual = native();
    check('Showing an unpinned note respects the off preference', !actual.top && !win.isAlwaysOnTop());
    let topCalls = 0;
    const setTop = win.setAlwaysOnTop.bind(win);
    win.setAlwaysOnTop = (...args) => { topCalls++; return setTop(...args); };
    await js('document.querySelector("#reply").value="置顶验证";document.querySelector("#reply").dispatchEvent(new Event("input",{bubbles:true}))');
    await until(async () => (await api(`/requests/${request.id}`)).reply === '置顶验证');
    check('Draft autosave does not repeatedly reset topmost state', topCalls === 0);
    cover.destroy();
    await api(`/requests/${request.id}/cancel`, 'POST', { reason: '自动验收完成' });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ checks }, null, 2));
    console.log(`PIN REPORT ${join(output, 'report.json')}`);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
}
void run();
