import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { localIntegrationsService } from './localIntegrations.js';
import { credentialStore } from './auth/credentialStore.js';
import { weiboProfileStore } from './weiboProfileStore.js';

const DEFAULT_WEIBO_URL = 'https://weibo.com/1788911247?refer_flag=1001030103_';
const PREFERRED_COOKIE_NAMES = ['SUB', 'SUBP', 'SCF', 'ALF', 'WBPSESS', 'SSOLoginState', 'XSRF-TOKEN'];

type SessionState =
  | 'launching'
  | 'awaiting_login'
  | 'login_detected'
  | 'cookie_saved'
  | 'failed'
  | 'cancelled';

export interface WeiboLoginSessionSnapshot {
  sessionId: string;
  state: SessionState;
  message: string;
  startedAt: string;
  updatedAt: string;
  targetUrl: string;
  currentUrl?: string;
  cookieConfigured: boolean;
  cookiePreview?: string;
  error?: string;
}

interface WeiboLoginSessionInternal {
  sessionId: string;
  state: SessionState;
  message: string;
  startedAt: string;
  updatedAt: string;
  targetUrl: string;
  profileDir: string;
  browser: Browser | null;
  page: Page | null;
  cookieConfigured: boolean;
  cookiePreview?: string;
  currentUrl?: string;
  error?: string;
  extractedCookie?: string;
  loginConfirmedAt?: number; // timestamp when login was confirmed (URL changed from login page)
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWeiboUrl(input?: string): string {
  if (!input?.trim()) {
    return DEFAULT_WEIBO_URL;
  }

  const value = input.trim();
  const url = new URL(value);
  if (!/(\.|^)weibo\.com$/.test(url.hostname)) {
    throw new Error('Weibo login only supports weibo.com URLs');
  }
  return url.toString();
}

function buildCookieString(
  cookies: Array<{ name: string; value: string }>
): string {
  const ordered = [...cookies].sort((a, b) => {
    const aPriority = PREFERRED_COOKIE_NAMES.indexOf(a.name);
    const bPriority = PREFERRED_COOKIE_NAMES.indexOf(b.name);
    if (aPriority !== -1 || bPriority !== -1) {
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    }
    return a.name.localeCompare(b.name);
  });

  return ordered.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function verifyWeiboCookie(cookieString: string): Promise<{ valid: boolean; message?: string }> {
  const response = await fetch('https://weibo.com/ajax/profile/info?custom=1788911247', {
    headers: {
      cookie: cookieString,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      accept: 'application/json, text/plain, */*',
      referer: 'https://weibo.com/',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return {
      valid: false,
      message: `Weibo verification returned HTTP ${response.status}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: number; msg?: string; data?: { user?: { screen_name?: string } } }
    | null;

  if (!payload) {
    return {
      valid: false,
      message: 'Weibo verification returned an unreadable response',
    };
  }

  if (payload.data?.user?.screen_name || payload.ok === 1) {
    return { valid: true };
  }

  return {
    valid: false,
    message: payload.msg || 'Weibo login could not be verified',
  };
}

function summarizeCookie(cookieString: string): string {
  return cookieString
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, value = ''] = part.split('=');
      if (!value) {
        return name;
      }
      if (value.length <= 10) {
        return `${name}=***`;
      }
      return `${name}=${value.slice(0, 4)}...${value.slice(-4)}`;
    })
    .join('; ');
}

export function resolveChromeExecutablePath(): string {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const commonWindowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application', 'chrome.exe'),
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  for (const candidate of commonWindowsPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const cacheRoot = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (existsSync(cacheRoot)) {
    const versions = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('win64-'))
      .map((entry) => ({
        name: entry.name,
        path: join(cacheRoot, entry.name, 'chrome-win64', 'chrome.exe'),
      }))
      .filter((entry) => existsSync(entry.path))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

    if (versions[0]?.path) {
      return versions[0].path;
    }
  }

  throw new Error(
    'Chrome executable not found. Set backend/.env CHROME_EXECUTABLE_PATH or install Chrome via `npx puppeteer browsers install chrome`.'
  );
}

export class WeiboLoginService {
  private readonly sessions = new Map<string, WeiboLoginSessionInternal>();
  private readonly sessionRoot = resolve(process.cwd(), '.tmp', 'weibo-login');

  async startSession(targetUrl?: string): Promise<WeiboLoginSessionSnapshot> {
    this.cleanupClosedSessions();

    const sessionId = randomUUID();
    const profileDir = join(this.sessionRoot, sessionId);

    // 确保目录干净（上次可能的残留）
    try {
      mkdirSync(profileDir, { recursive: true });
    } catch (err: unknown) {
      // 目录已存在且被锁住（Windows EPERM），先删除再创建
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        try {
          rmSync(profileDir, { recursive: true, force: true });
        } catch { /* ignore cleanup failure */ }
        mkdirSync(profileDir, { recursive: true });
      } else {
        throw err;
      }
    }

    const session: WeiboLoginSessionInternal = {
      sessionId,
      state: 'launching',
      message: 'Launching dedicated Weibo login window...',
      startedAt: nowIso(),
      updatedAt: nowIso(),
      targetUrl: normalizeWeiboUrl(targetUrl),
      profileDir,
      browser: null,
      page: null,
      cookieConfigured: false,
    };

    this.sessions.set(sessionId, session);

    try {
      const browser = await puppeteer.launch({
        headless: false,
        executablePath: resolveChromeExecutablePath(),
        userDataDir: profileDir,
        defaultViewport: null,
        args: [
          '--disable-gpu',
          '--no-sandbox',
        ],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1440, height: 960 });
      await page.goto(session.targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      session.browser = browser;
      session.page = page;
      session.state = 'awaiting_login';
      session.message = 'Weibo login window opened. Scan the QR code or finish phone login in that window.';
      session.updatedAt = nowIso();
      session.currentUrl = page.url();

      // 监听 URL 变化，检测登录成功（URL 不再是 login 页面）
      page.on('framenavigated', async (frame) => {
        const current = this.sessions.get(sessionId);
        if (!current || current.state !== 'awaiting_login') return;

        // 只处理主框架
        if (frame !== page.mainFrame()) return;

        const newUrl = frame.url();
        current.currentUrl = newUrl;

        // URL 变成非登录页，表示登录成功
        if (!newUrl.includes('login') && !newUrl.includes('signin')) {
          current.state = 'login_detected';
          current.message = 'Login detected. Waiting for cookies to stabilize...';
          current.updatedAt = nowIso();
          current.loginConfirmedAt = Date.now();

          // 等待 2 秒让 cookie 稳定后再提取
          setTimeout(async () => {
            const s = this.sessions.get(sessionId);
            if (!s || s.state !== 'login_detected') return;
            await this.extractAndSaveCookies(s);
          }, 2000);
        }
      });

      // 页面关闭时：如果还没检测到登录成功，取消会话
      page.on('close', () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;

        if (current.state === 'awaiting_login') {
          current.browser = null;
          current.page = null;
          current.state = 'cancelled';
          current.message = 'Weibo login window was closed before login completed.';
          current.updatedAt = nowIso();
        }
        // 如果 state 是 login_detected 或 cookie_saved，已经在处理中，不做额外操作
      });

      browser.on('disconnected', () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;

        // 如果浏览器断开但还没保存 cookie，尝试最后一次提取
        if (current.state === 'login_detected' && !current.cookieConfigured && !current.extractedCookie) {
          this.extractAndSaveCookies(current);
        } else if (current.state === 'awaiting_login') {
          current.browser = null;
          current.page = null;
          current.state = 'cancelled';
          current.message = 'Browser disconnected before login completed.';
          current.updatedAt = nowIso();
        }
      });

      return this.snapshot(session);
    } catch (error) {
      session.state = 'failed';
      session.error = error instanceof Error ? error.message : 'Failed to start Weibo login session';
      session.message = session.error;
      session.updatedAt = nowIso();
      await this.disposeSession(sessionId, false);
      return this.snapshot(session);
    }
  }

  async getSession(sessionId: string): Promise<WeiboLoginSessionSnapshot> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Weibo login session not found');
    }

    await this.refreshSession(session);
    return this.snapshot(session);
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.state = 'cancelled';
    session.message = 'Weibo login session cancelled.';
    session.updatedAt = nowIso();
    await this.disposeSession(sessionId, true);
  }

  private async extractAndSaveCookies(session: WeiboLoginSessionInternal): Promise<void> {
    if (!session.page || !session.browser) {
      // 页面已关闭，尝试从 browser 断开前的 cookie 提取
      session.state = 'failed';
      session.error = 'Page closed before cookies could be extracted';
      session.updatedAt = nowIso();
      return;
    }

    try {
      let lastError = 'Weibo login cookies were not ready yet';

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const cookies = [
          ...(await session.page.cookies(
            'https://weibo.com/',
            'https://www.weibo.com/',
            'https://passport.weibo.com/'
          )),
        ];
        const domainCookies = Array.from(
          new Map(
            cookies
              .filter((cookie) => cookie.domain.includes('weibo.com') && cookie.name && cookie.value)
              .map((cookie) => [`${cookie.domain}:${cookie.path}:${cookie.name}`, { name: cookie.name, value: cookie.value }])
          ).values()
        );

        const sub = domainCookies.find((cookie) => cookie.name === 'SUB');
        const subp = domainCookies.find((cookie) => cookie.name === 'SUBP');

        if (!sub || !subp) {
          lastError = 'Required Weibo cookies SUB/SUBP were not captured after login';
          continue;
        }

        const cookieString = buildCookieString(domainCookies);
        const verification = await verifyWeiboCookie(cookieString);

        if (!verification.valid) {
          lastError = verification.message || 'Weibo did not accept the captured login cookie';
          session.message = `Login detected, but PC 端登录态校验仍未通过（第 ${attempt}/5 次重试）...`;
          session.updatedAt = nowIso();
          continue;
        }

        session.cookiePreview = summarizeCookie(cookieString);
        session.extractedCookie = cookieString;
        await session.browser.close().catch(() => undefined);
        session.browser = null;
        session.page = null;
        weiboProfileStore.activateProfile(session.profileDir, {
          targetUrl: session.targetUrl,
          cookiePreview: session.cookiePreview,
        });

        if (!session.cookieConfigured) {
          try {
            await localIntegrationsService.saveRsshubSettings({
              WEIBO_COOKIES: cookieString,
            });
          } catch (err) {
            console.warn('[WeiboLogin] saveRsshubSettings failed (non-fatal):', err instanceof Error ? err.message : err);
          }
          await credentialStore.save('weibo', 'cookie', cookieString);
          session.cookieConfigured = true;
        }

        session.state = 'cookie_saved';
        session.message = '微博登录态已保存，并已切换到内置浏览器采集链路。';
        session.updatedAt = nowIso();
        await this.disposeSession(session.sessionId, false);
        return;
      }

      session.state = 'failed';
      session.error = lastError;
      session.message = lastError;
      session.updatedAt = nowIso();
      await this.disposeSession(session.sessionId, false);
    } catch (error) {
      session.state = 'failed';
      session.error = error instanceof Error ? error.message : 'Failed to extract cookies';
      session.message = session.error;
      session.updatedAt = nowIso();
      await this.disposeSession(session.sessionId, false);
    }
  }

  private async refreshSession(session: WeiboLoginSessionInternal): Promise<void> {
    if (!session.page || !session.browser) {
      return;
    }

    if (session.state === 'cookie_saved' || session.state === 'failed' || session.state === 'cancelled') {
      return;
    }

    try {
      session.currentUrl = session.page.url();
      session.updatedAt = nowIso();
    } catch (error) {
      session.state = 'failed';
      session.error = error instanceof Error ? error.message : 'Failed while checking Weibo login status';
      session.message = session.error;
      session.updatedAt = nowIso();
      await this.disposeSession(session.sessionId, false);
    }
  }

  private snapshot(session: WeiboLoginSessionInternal): WeiboLoginSessionSnapshot {
    return {
      sessionId: session.sessionId,
      state: session.state,
      message: session.message,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      targetUrl: session.targetUrl,
      currentUrl: session.currentUrl,
      cookieConfigured: session.cookieConfigured,
      cookiePreview: session.cookiePreview,
      error: session.error,
    };
  }

  private async disposeSession(sessionId: string, removeFromMap: boolean): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.browser = null;
    session.page = null;

    if (removeFromMap) {
      this.sessions.delete(sessionId);
      setTimeout(() => {
        try {
          rmSync(session.profileDir, { recursive: true, force: true });
        } catch { /* ignore */ }
      }, 2000);
    }
  }

  private cleanupClosedSessions(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.updatedAt).getTime() < cutoff) {
        this.sessions.delete(sessionId);
        rmSync(session.profileDir, { recursive: true, force: true });
      }
    }
  }
}

export const weiboLoginService = new WeiboLoginService();
