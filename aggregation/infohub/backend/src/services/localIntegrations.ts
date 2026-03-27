import { mkdirSync, openSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

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

const RSSHUB_FIELDS: IntegrationField[] = [
  {
    key: 'ZHIHU_COOKIES',
    label: '知乎 Cookie',
    description: '登录知乎后复制完整 Cookie，至少需要包含 z_c0。',
    placeholder: 'z_c0=...; d_c0=...; q_c1=...;',
  },
  {
    key: 'WEIBO_COOKIES',
    label: '微博 Cookie',
    description: '微博相关路由需要登录态时使用。',
    placeholder: 'SUB=...; SUBP=...;',
  },
  {
    key: 'XIAOHONGSHU_COOKIE',
    label: '小红书 Cookie',
    description: '小红书相关路由需要登录态时使用。',
    placeholder: 'a1=...; webId=...;',
  },
  {
    key: 'DOUBAN_COOKIE',
    label: '豆瓣 Cookie',
    description: '豆瓣相关路由需要登录态时使用。',
    placeholder: 'dbcl2=...; ck=...;',
  },
  {
    key: 'TWITTER_AUTH_TOKEN',
    label: 'X / Twitter Auth Token',
    description: 'X/Twitter 相关路由可使用 auth_token。',
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
  const orderedKeys = ['PORT', 'NODE_ENV', 'LISTEN_INADDR_ANY', 'CACHE_TYPE', ...RSSHUB_FIELDS.map((field) => field.key)];
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

export class LocalIntegrationsService {
  private readonly rsshubRoot = resolve(process.cwd(), '..', 'rsshub-local');
  private readonly rsshubEnvPath = resolve(this.rsshubRoot, '.env');
  private readonly rsshubTmpDir = resolve(this.rsshubRoot, '.tmp');
  private readonly rsshubPidPath = resolve(this.rsshubTmpDir, 'rsshub.pid');
  private readonly rsshubStdoutPath = resolve(this.rsshubTmpDir, 'rsshub.stdout.log');
  private readonly rsshubStderrPath = resolve(this.rsshubTmpDir, 'rsshub.stderr.log');

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

  async restartRsshub(): Promise<void> {
    mkdirSync(this.rsshubTmpDir, { recursive: true });
    await this.stopRsshub();

    const stdoutFd = openSync(this.rsshubStdoutPath, 'a');
    const stderrFd = openSync(this.rsshubStderrPath, 'a');
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const child = spawn(command, ['run', 'start'], {
      cwd: this.rsshubRoot,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    });

    child.unref();

    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (await isPortReachable(RSSHUB_PORT)) {
        return;
      }
      await delay(1000);
    }

    throw new Error('RSSHub local service did not become healthy after restart');
  }

  private async stopRsshub(): Promise<void> {
    if (existsSync(this.rsshubPidPath)) {
      const pid = Number.parseInt(readFileSync(this.rsshubPidPath, 'utf8').trim(), 10);
      if (!Number.isNaN(pid)) {
        try {
          process.kill(pid);
        } catch {
          // Ignore stale pid files.
        }
      }
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (!(await isPortReachable(RSSHUB_PORT))) {
        return;
      }
      await delay(500);
    }
  }
}

export const localIntegrationsService = new LocalIntegrationsService();
