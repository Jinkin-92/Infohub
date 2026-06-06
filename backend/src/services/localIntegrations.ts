import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type IntegrationField = {
  key: string;
  label: string;
  description: string;
  placeholder: string;
};

export type IntegrationSetting = IntegrationField & {
  value: string;
  configured: boolean;
};

const RSSHUB_PORT = 1200;
const SERVICE_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const RSSHUB_ROOT = resolve(SERVICE_ROOT, 'rsshub-local');
const IS_WINDOWS = process.platform === 'win32';

const RSSHUB_FIELDS: IntegrationField[] = [
  {
    key: 'ZHIHU_COOKIES',
    label: 'Zhihu Cookie',
    description: 'Used by RSSHub routes that require a logged-in Zhihu session.',
    placeholder: 'z_c0=...; d_c0=...; q_c1=...;',
  },
  {
    key: 'WEIBO_COOKIES',
    label: 'Weibo Cookie',
    description: 'Used by RSSHub routes that require a logged-in Weibo session.',
    placeholder: 'SUB=...; SUBP=...;',
  },
  {
    key: 'XIAOHONGSHU_COOKIE',
    label: 'Xiaohongshu Cookie',
    description: 'Used by RSSHub routes that require a logged-in Xiaohongshu session.',
    placeholder: 'a1=...; webId=...;',
  },
  {
    key: 'TWITTER_AUTH_TOKEN',
    label: 'X / Twitter Auth Token',
    description: 'Used by RSSHub routes that require an X auth token.',
    placeholder: 'auth_token=...',
  },
];

function readEnvMap(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  const envText = readFileSync(envPath, 'utf8');
  const result: Record<string, string> = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    result[key] = value;
  }

  return result;
}

function writeEnvMap(envPath: string, envMap: Record<string, string>): void {
  const orderedKeys = [
    'PORT',
    'NODE_ENV',
    'LISTEN_INADDR_ANY',
    'CACHE_TYPE',
    ...RSSHUB_FIELDS.map((field) => field.key),
  ];
  const mergedKeys = Array.from(new Set([...orderedKeys, ...Object.keys(envMap)]));
  const lines = mergedKeys.map((key) => `${key}=${envMap[key] ?? ''}`);
  writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf8');
}

async function isPortReachable(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`http://localhost:${port}/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function parseListeningPids(netstatOutput: string, port: number): number[] {
  const pids = new Set<number>();
  const portMarker = `:${port}`;

  for (const rawLine of netstatOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes(portMarker) || !line.includes('LISTENING')) {
      continue;
    }

    const parts = line.split(/\s+/);
    const pid = Number.parseInt(parts[parts.length - 1] ?? '', 10);
    if (!Number.isNaN(pid)) {
      pids.add(pid);
    }
  }

  return [...pids];
}

function findListeningPids(port: number): number[] {
  try {
    const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseListeningPids(output, port);
  } catch {
    return [];
  }
}

function readProcessCommandLine(pid: number): string {
  if (!IS_WINDOWS) {
    return '';
  }

  try {
    return execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
      ],
      {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim();
  } catch {
    return '';
  }
}

function isManagedRsshubPid(pid: number): boolean {
  const commandLine = readProcessCommandLine(pid);
  return commandLine.includes('rsshub-local') || commandLine.includes('start-rsshub.mjs');
}

async function waitForPortState(
  port: number,
  reachable: boolean,
  attempts: number,
  delayMs: number
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await isPortReachable(port)) === reachable) {
      return true;
    }
    await delay(delayMs);
  }

  return false;
}

function buildRsshubLaunchCommand(): { command: string; args: string[] } {
  const currentMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  const needsNode24Shim = Number.isFinite(currentMajor) && currentMajor >= 25;

  if (!needsNode24Shim) {
    return {
      command: process.execPath,
      args: [join(RSSHUB_ROOT, 'scripts', 'start-rsshub.mjs')],
    };
  }

  if (IS_WINDOWS) {
    return {
      command: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npx -y node@24 scripts/start-rsshub.mjs'],
    };
  }

  return {
    command: 'npx',
    args: ['-y', 'node@24', 'scripts/start-rsshub.mjs'],
  };
}

function buildRsshubChildEnv(envPath: string): NodeJS.ProcessEnv {
  const envMap = readEnvMap(envPath);

  return {
    ...process.env,
    PORT: envMap.PORT || String(RSSHUB_PORT),
    NODE_ENV: envMap.NODE_ENV || 'production',
    LISTEN_INADDR_ANY: envMap.LISTEN_INADDR_ANY || 'true',
    CACHE_TYPE: envMap.CACHE_TYPE || 'memory',
    ZHIHU_COOKIES: envMap.ZHIHU_COOKIES || '',
    WEIBO_COOKIES: envMap.WEIBO_COOKIES || '',
    XIAOHONGSHU_COOKIE: envMap.XIAOHONGSHU_COOKIE || '',
    TWITTER_AUTH_TOKEN: envMap.TWITTER_AUTH_TOKEN || '',
  };
}

export class LocalIntegrationsService {
  private readonly rsshubRoot = RSSHUB_ROOT;
  private readonly rsshubEnvPath = resolve(this.rsshubRoot, '.env');
  private readonly rsshubTmpDir = resolve(this.rsshubRoot, '.tmp');
  private readonly rsshubPidPath = resolve(this.rsshubTmpDir, 'rsshub.pid');
  private readonly rsshubStdoutPath = resolve(this.rsshubTmpDir, 'rsshub.stdout.log');
  private readonly rsshubStderrPath = resolve(this.rsshubTmpDir, 'rsshub.stderr.log');
  private readonly watchdogIntervalMs = 2 * 60 * 1000;
  private restartPromise: Promise<void> | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  async getRsshubSettings(): Promise<{
    running: boolean;
    port: number;
    envPath: string;
    settings: IntegrationSetting[];
  }> {
    const envMap = readEnvMap(this.rsshubEnvPath);
    const running = await isPortReachable(RSSHUB_PORT);

    return {
      running,
      port: RSSHUB_PORT,
      envPath: this.rsshubEnvPath,
      settings: RSSHUB_FIELDS.map((field) => ({
        ...field,
        value: envMap[field.key] ?? '',
        configured: Boolean((envMap[field.key] ?? '').trim()),
      })),
    };
  }

  async saveRsshubSettings(values: Record<string, string>): Promise<{
    running: boolean;
    port: number;
    envPath: string;
    settings: IntegrationSetting[];
  }> {
    const envMap = readEnvMap(this.rsshubEnvPath);

    envMap.PORT = envMap.PORT || String(RSSHUB_PORT);
    envMap.NODE_ENV = envMap.NODE_ENV || 'production';
    envMap.LISTEN_INADDR_ANY = envMap.LISTEN_INADDR_ANY || 'true';
    envMap.CACHE_TYPE = envMap.CACHE_TYPE || 'memory';

    for (const field of RSSHUB_FIELDS) {
      if (field.key in values) {
        envMap[field.key] = values[field.key].trim();
      }
    }

    writeEnvMap(this.rsshubEnvPath, envMap);
    await this.restartRsshub();
    return this.getRsshubSettings();
  }

  async ensureRsshubRunning(): Promise<void> {
    if (await isPortReachable(RSSHUB_PORT)) {
      return;
    }

    await this.performRestart(false);
  }

  async restartRsshub(): Promise<void> {
    await this.performRestart(true);
  }

  startWatchdog(): void {
    if (this.watchdogTimer) {
      return;
    }

    this.watchdogTimer = setInterval(() => {
      void this.ensureRsshubRunning().catch((error) => {
        console.error('[RSSHub] Watchdog failed to recover local RSSHub:', error);
      });
    }, this.watchdogIntervalMs);

    this.watchdogTimer.unref?.();
  }

  stopWatchdog(): void {
    if (!this.watchdogTimer) {
      return;
    }

    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private async performRestart(force: boolean): Promise<void> {
    if (this.restartPromise) {
      return this.restartPromise;
    }

    this.restartPromise = this.restartRsshubInternal(force).finally(() => {
      this.restartPromise = null;
    });

    return this.restartPromise;
  }

  private async restartRsshubInternal(force: boolean): Promise<void> {
    if (!force && (await isPortReachable(RSSHUB_PORT))) {
      return;
    }

    mkdirSync(this.rsshubTmpDir, { recursive: true });
    await this.stopRsshub();

    const blockingPids = findListeningPids(RSSHUB_PORT).filter((pid) => !isManagedRsshubPid(pid));
    if (blockingPids.length > 0) {
      throw new Error(
        `Port ${RSSHUB_PORT} is occupied by another application (${blockingPids.join(', ')}). Close that app before starting InfoHub.`
      );
    }

    const stdoutFd = openSync(this.rsshubStdoutPath, 'a');
    const stderrFd = openSync(this.rsshubStderrPath, 'a');
    const launch = buildRsshubLaunchCommand();
    const childEnv = buildRsshubChildEnv(this.rsshubEnvPath);

    const child = spawn(launch.command, launch.args, {
      cwd: this.rsshubRoot,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
      shell: false,
      env: childEnv,
    });

    child.unref();
    closeSync(stdoutFd);
    closeSync(stderrFd);

    // RSSHub cold-starts (require('./app') eagerly loads 594 route directories)
    // take ~30-40s on a typical machine. 40 attempts × 1s was borderline-failing
    // even on a healthy machine, so give it a real margin here.
    if (await waitForPortState(RSSHUB_PORT, true, 90, 1000)) {
      return;
    }

    throw new Error('RSSHub local service did not become healthy after restart');
  }

  private async stopRsshub(): Promise<void> {
    const pidsToStop = new Set<number>();

    if (existsSync(this.rsshubPidPath)) {
      const pid = Number.parseInt(readFileSync(this.rsshubPidPath, 'utf8').trim(), 10);
      if (!Number.isNaN(pid)) {
        pidsToStop.add(pid);
      }
    }

    for (const pid of findListeningPids(RSSHUB_PORT)) {
      if (isManagedRsshubPid(pid)) {
        pidsToStop.add(pid);
      }
    }

    for (const pid of pidsToStop) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Ignore stale pid files and already-exited processes.
      }
    }

    if (await waitForPortState(RSSHUB_PORT, false, 10, 500)) {
      rmSync(this.rsshubPidPath, { force: true });
      return;
    }

    for (const pid of findListeningPids(RSSHUB_PORT)) {
      if (!isManagedRsshubPid(pid)) {
        continue;
      }
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Ignore if force kill fails.
        }
      }
    }

    await waitForPortState(RSSHUB_PORT, false, 10, 500);
    rmSync(this.rsshubPidPath, { force: true });
  }
}

export const localIntegrationsService = new LocalIntegrationsService();
