import { packager } from '@electron/packager';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'release', new Date().toISOString().replace(/[:.]/g, '-'));
const paths = await packager({
  dir: root, name: 'human_cli', platform: 'win32', arch: 'x64', out: output,
  asar: false, prune: true, overwrite: false,
  // Ship the runtime; keep design references, tests and development launchers in source only.
  ignore: [/^\/(\.git|\.qa|\.taste-skill|\.codebuddy|\.claude|\.codex|archive|cache|prototype|tests|release|ui__rebuild|scripts)(\/|$)/, /^\/(\.mcp\.json|\.env(?:\..*)?)$/i, /^\/(src|public)(\/|$)/, /^\/[^/]+\.(cmd|ps1)$/i],
  win32metadata: { CompanyName: 'human_cli', FileDescription: 'human_cli AI 协助便签', ProductName: 'human_cli' },
});
for (const path of paths) {
  renameSync(join(path, 'human_cli.exe'), join(path, 'human_cli-desktop.exe'));
  execFileSync(process.env.HUMAN_CLI_CC || 'gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', '-s', '-static', '-municode', join(root, 'scripts', 'windows-cli.c'), '-o', join(path, 'human_cli.exe')], { stdio: 'inherit' });
}
mkdirSync(join(root, 'release'), { recursive: true });
writeFileSync(join(root, 'release', 'latest.json'), JSON.stringify({ directories: paths }, null, 2));
for (const path of paths) process.stdout.write(`${join(path, 'human_cli-desktop.exe')}\n`);
