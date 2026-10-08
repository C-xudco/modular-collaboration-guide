import { cp, mkdir, access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--home') { if (!args[++i] || args[i].startsWith('--')) throw new Error('--home 需要路径。'); }
  else if (!['--register', '--update'].includes(args[i])) throw new Error('支持 --register、--update、--home PATH');
}
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
const root = fileURLToPath(new URL('../', import.meta.url));
const homeIndex = args.indexOf('--home');
const codexHome = homeIndex >= 0 ? resolve(args[homeIndex + 1]) : resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
const target = join(codexHome, 'skills', 'modular-collaboration-guide');
await access(join(root, 'local', 'runtime.mjs'));
let existing = false;
try { await access(target); existing = true; } catch {}
if (existing) {
  if (!args.includes('--update')) throw new Error('已有同名 Skill。若确认更新本项目，请使用 --update；原版本会先备份。');
  const current = await readFile(join(target, 'SKILL.md'), 'utf8');
  if (!/^name: modular-collaboration-guide\s*$/m.test(current)) throw new Error('目录不是本项目 Skill，拒绝覆盖。');
  const backup = join(codexHome, 'skill-backups', 'modular-collaboration-guide-' + Date.now());
  await cp(target, backup, { recursive: true });
  console.log('原 Skill 已备份：' + backup);
}
await mkdir(join(codexHome, 'skills'), { recursive: true });
await cp(join(root, 'skills', 'modular-collaboration-guide'), target, { recursive: true });
const server = join(root, 'local', 'server.mjs');
const quote = s => "'" + s.replaceAll("'", process.platform === 'win32' ? "''" : "'\"'\"'") + "'";
const command = 'codex mcp add modular-collaboration-guide-local -- ' + quote(process.execPath) + ' ' + quote(server);
console.log('Skill 已安装：' + target);
console.log('接入命令（请保留项目目录）：\n' + command);
console.log('\n如果没有 Codex CLI，在 Codex 的 MCP 设置中添加 stdio 服务；也可合并以下内容到 config.toml：\n' +
  '[mcp_servers.modular-collaboration-guide-local]\ncommand = ' + JSON.stringify(process.execPath.replaceAll('\\', '/')) + '\nargs = [' + JSON.stringify(server.replaceAll('\\', '/')) + ']');
if (args.includes('--register')) {
  // The supported CLI preserves existing settings. No shell interpolation.
  const result = spawnSync('codex', ['mcp', 'add', 'modular-collaboration-guide-local', '--', process.execPath, server], { stdio: 'inherit', windowsHide: true, env: { ...process.env, CODEX_HOME: codexHome } });
  if (result.error || result.status !== 0) { console.error('自动接入未完成。Skill 已安装，请使用上面的命令或设置。'); process.exitCode = 1; }
  else console.log('本地 MCP 已接入。重新打开 Codex 对话后调用 $modular-collaboration-guide。');
}
