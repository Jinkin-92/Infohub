import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

interface WeiboProfileMeta {
  targetUrl: string;
  cookiePreview?: string;
  verifiedAt: string;
  lastCheckedAt?: string;
  lastSuccessfulUseAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function removeChromeLockFiles(profileDir: string): void {
  const lockFiles = [
    'SingletonCookie',
    'SingletonLock',
    'SingletonSocket',
    join('Default', 'LOCK'),
  ];

  for (const lockFile of lockFiles) {
    try {
      rmSync(join(profileDir, lockFile), { force: true });
    } catch {
      // Best effort only.
    }
  }
}

export class WeiboProfileStore {
  private readonly root = resolve(process.cwd(), '.tmp', 'weibo-login');
  private readonly activeProfileDir = join(this.root, 'active-profile');
  private readonly runtimeRoot = join(this.root, 'runtime');
  private readonly metaPath = join(this.root, 'active-profile.json');

  constructor() {
    mkdirSync(this.root, { recursive: true });
    mkdirSync(this.runtimeRoot, { recursive: true });
  }

  hasActiveProfile(): boolean {
    return existsSync(this.activeProfileDir);
  }

  getMeta(): WeiboProfileMeta | null {
    if (!existsSync(this.metaPath)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(this.metaPath, 'utf8')) as WeiboProfileMeta;
    } catch {
      return null;
    }
  }

  activateProfile(profileDir: string, meta: Omit<WeiboProfileMeta, 'verifiedAt'>): void {
    mkdirSync(this.root, { recursive: true });
    rmSync(this.activeProfileDir, { recursive: true, force: true });
    cpSync(profileDir, this.activeProfileDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    removeChromeLockFiles(this.activeProfileDir);
    writeFileSync(
      this.metaPath,
      JSON.stringify(
        {
          ...meta,
          verifiedAt: nowIso(),
          lastCheckedAt: nowIso(),
          lastSuccessfulUseAt: nowIso(),
        },
        null,
        2
      ),
      'utf8'
    );
  }

  updateMeta(patch: Partial<WeiboProfileMeta>): void {
    const current = this.getMeta();
    if (!current) {
      return;
    }

    writeFileSync(
      this.metaPath,
      JSON.stringify(
        {
          ...current,
          ...patch,
        },
        null,
        2
      ),
      'utf8'
    );
  }

  markHealthyUse(): void {
    const stamp = nowIso();
    this.updateMeta({
      lastCheckedAt: stamp,
      lastSuccessfulUseAt: stamp,
    });
  }

  markChecked(): void {
    this.updateMeta({
      lastCheckedAt: nowIso(),
    });
  }

  clear(): void {
    rmSync(this.activeProfileDir, { recursive: true, force: true });
    rmSync(this.metaPath, { force: true });
  }

  createRuntimeProfile(): string {
    if (!this.hasActiveProfile()) {
      throw new Error('Weibo active profile not found. Please complete Weibo QR login first.');
    }

    const runtimeProfileDir = join(this.runtimeRoot, randomUUID());
    cpSync(this.activeProfileDir, runtimeProfileDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    removeChromeLockFiles(runtimeProfileDir);
    return runtimeProfileDir;
  }

  cleanupRuntimeProfile(profileDir: string): void {
    if (!profileDir.startsWith(this.runtimeRoot)) {
      return;
    }

    rmSync(profileDir, { recursive: true, force: true });
  }
}

export const weiboProfileStore = new WeiboProfileStore();
