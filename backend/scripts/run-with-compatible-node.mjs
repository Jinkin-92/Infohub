import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

function quoteCmdArg(value) {
  if (value === '') {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function readEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, 'utf8');
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }

  return entries;
}

const envFile = readEnvFile(resolve(process.cwd(), '.env'));
const dbType = process.env.DB_TYPE ?? envFile.DB_TYPE ?? 'sqlite';
const currentMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const needsNode24Shim = dbType === 'sqlite' && currentMajor >= 25;
const isWindows = process.platform === 'win32';

const [target, ...args] = process.argv.slice(2);

if (!target) {
  console.error('Missing target script');
  process.exit(1);
}

const command = needsNode24Shim
  ? (isWindows ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe' : 'npx')
  : process.execPath;
const commandArgs = needsNode24Shim
  ? (
      isWindows
        ? ['/d', '/s', '/c', ['npx', '-y', 'node@24', target, ...args].map(quoteCmdArg).join(' ')]
        : ['-y', 'node@24', target, ...args]
    )
  : [target, ...args];

if (needsNode24Shim) {
  console.log('[runtime] sqlite detected on Node 25+, using Node 24 shim for backend process');
}

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
