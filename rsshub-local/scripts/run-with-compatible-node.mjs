import { spawn } from 'node:child_process';
import process from 'node:process';

const [, , target, ...args] = process.argv;

if (!target) {
  console.error('Usage: node scripts/run-with-compatible-node.mjs <target> [...args]');
  process.exit(1);
}

const currentMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
const needsNode24 = Number.isFinite(currentMajor) && currentMajor >= 25;
const isWindows = process.platform === 'win32';

const command = needsNode24
  ? (isWindows ? 'npx.cmd' : 'npx')
  : process.execPath;
const commandArgs = needsNode24 ? ['-y', 'node@24', target, ...args] : [target, ...args];

if (needsNode24) {
  console.log('[runtime] RSSHub requires Node 24 on this machine, using Node 24 shim');
}

const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
