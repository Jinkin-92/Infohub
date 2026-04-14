/**
 * 知乎登录服务
 * 复用微博 Chrome 窗口扫码模式
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { credentialStore } from './auth/credentialStore.js';

const DEFAULT_ZHIHU_URL = 'https://www.zhihu.com/signin';
const PREFERRED_COOKIE_NAMES = ['z_c0', 'd_c0', 'q_c1', 'tshl'];

type SessionState = 'launching' | 'awaiting_login' | 'login_detected' | 'cookie_saved' | 'failed' | 'cancelled';

export interface ZhihuLoginSessionSnapshot {
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

interface ZhihuLoginSessionInternal {
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
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveChromeExecutablePath(): string {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const commonWindowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
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
    'Chrome executable not found. Set backend/.env CHROME_EXECUTABLE_PATH or install Chrome.'
  );
}

export class ZhihuLoginService {
  private readonly sessions = new Map<string, ZhihuLoginSessionInternal>();
  private readonly sessionRoot = join(process.cwd(), '.tmp', 'zhihu-login');

  async startSession(targetUrl?: string): Promise<ZhihuLoginSessionSnapshot> {
    this.cleanupClosedSessions();

    const sessionId = randomUUID();
    const profileDir = join(this.sessionRoot, sessionId);

    try {
      mkdirSync(profileDir, { recursive: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        try {
          rmSync(profileDir, { recursive: true, force: true });
        } catch { /* ignore cleanup failure */ }
        mkdirSync(profileDir, { recursive: true });
      } else {
        throw err;
      }
    }

    const session: ZhihuLoginSessionInternal = {
      sessionId,
      state: 'launching',
      message: '正在启动知乎登录窗口…',
      startedAt: nowIso(),
      updatedAt: nowIso(),
      targetUrl: targetUrl || DEFAULT_ZHIHU_URL,
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
      session.message = '知乎登录窗口已打开，请用知乎App扫码或短信登录';
      session.updatedAt = nowIso();
      session.currentUrl = page.url();

      // 页面关闭时触发（比 disconnected 更早，page 仍可访问）
      page.on('close', async () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        if (current.state === 'cookie_saved' || current.state === 'failed') return;

        // 页面关闭前最后一次尝试提取 cookie
        try {
          const cookies = await page.cookies('https://www.zhihu.com/');
          const domainCookies = cookies.filter(c => c.domain.includes('zhihu.com'));
          const z_c0 = domainCookies.find(c => c.name === 'z_c0');
          if (z_c0) {
            const cookieString = domainCookies
              .filter(c => ['z_c0', 'd_c0', 'q_c1'].includes(c.name))
              .map(c => `${c.name}=${c.value}`)
              .join('; ');
            try {
              await credentialStore.save('zhihu', 'cookie', cookieString);
            } catch { /* ignore */ }
            current.cookieConfigured = true;
            current.state = 'cookie_saved';
            current.message = '知乎 Cookie 已保存';
            current.updatedAt = nowIso();
            current.browser = null;
            current.page = null;
            return;
          }
        } catch { /* ignore */ }

        current.browser = null;
        current.page = null;
        current.state = 'cancelled';
        current.message = '登录窗口已关闭';
        current.updatedAt = nowIso();
      });

      browser.on('disconnected', async () => {
        const current = this.sessions.get(sessionId);
        if (!current) return;
        if (current.state === 'cookie_saved') return;

        // 窗口关闭时，先尝试提取 cookie 再清理
        if (current.page && current.state !== 'failed') {
          try {
            const cookies = await current.page.cookies('https://www.zhihu.com/');
            const domainCookies = cookies.filter(c => c.domain.includes('zhihu.com'));
            const z_c0 = domainCookies.find(c => c.name === 'z_c0');
            if (z_c0) {
              const cookieString = domainCookies
                .filter(c => ['z_c0', 'd_c0', 'q_c1'].includes(c.name))
                .map(c => `${c.name}=${c.value}`)
                .join('; ');
              try {
                await credentialStore.save('zhihu', 'cookie', cookieString);
              } catch { /* ignore */ }
              current.cookieConfigured = true;
              current.state = 'cookie_saved';
              current.message = '知乎 Cookie 已保存';
              current.updatedAt = nowIso();
              current.browser = null;
              current.page = null;
              return;
            }
          } catch { /* ignore - proceed to cancel */ }
        }

        current.browser = null;
        current.page = null;
        current.state = 'cancelled';
        current.message = '登录窗口已关闭';
        current.updatedAt = nowIso();
      });

      return this.snapshot(session);
    } catch (error) {
      session.state = 'failed';
      session.error = error instanceof Error ? error.message : 'Failed to start';
      session.message = session.error;
      session.updatedAt = nowIso();
      await this.disposeSession(sessionId, false);
      return this.snapshot(session);
    }
  }

  async getSession(sessionId: string): Promise<ZhihuLoginSessionSnapshot> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('知乎登录会话不存在');
    }

    await this.refreshSession(session);
    return this.snapshot(session);
  }

  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'cancelled';
    session.message = '已取消';
    session.updatedAt = nowIso();
    await this.disposeSession(sessionId, true);
  }

  private async refreshSession(session: ZhihuLoginSessionInternal): Promise<void> {
    if (!session.page || !session.browser) return;

    if (session.state === 'cookie_saved' || session.state === 'failed' || session.state === 'cancelled') {
      return;
    }

    try {
      session.currentUrl = session.page.url();
      const cookies = await session.page.cookies('https://www.zhihu.com/');
      const domainCookies = cookies.filter((cookie) => cookie.domain.includes('zhihu.com'));
      const required = domainCookies.filter((cookie) => PREFERRED_COOKIE_NAMES.includes(cookie.name));

      // 知乎登录成功标志：z_c0 cookie 存在
      if (required.some(c => c.name === 'z_c0')) {
        const cookieString = domainCookies
          .filter(c => PREFERRED_COOKIE_NAMES.includes(c.name))
          .map(c => `${c.name}=${c.value}`)
          .join('; ');

        session.cookiePreview = cookieString.slice(0, 20) + '…';
        session.extractedCookie = cookieString;

        if (!session.cookieConfigured) {
          try {
            await credentialStore.save('zhihu', 'cookie', cookieString);
          } catch (err) {
            console.error('[ZhihuLogin] credentialStore.save failed:', err instanceof Error ? err.message : err);
          }
          session.cookieConfigured = true;
        }

        session.state = 'cookie_saved';
        session.message = '知乎 Cookie 已保存';
        session.updatedAt = nowIso();
        await this.disposeSession(session.sessionId, false);
        return;
      }

      session.state = 'awaiting_login';
      session.message = session.currentUrl.includes('signin')
        ? '请用知乎App扫码或短信登录'
        : '等待登录完成…';
      session.updatedAt = nowIso();
    } catch (error) {
      session.state = 'failed';
      session.error = error instanceof Error ? error.message : '检查登录状态失败';
      session.message = session.error;
      session.updatedAt = nowIso();
      await this.disposeSession(session.sessionId, false);
    }
  }

  private snapshot(session: ZhihuLoginSessionInternal): ZhihuLoginSessionSnapshot {
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
    if (!session) return;

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
        try {
          rmSync(session.profileDir, { recursive: true, force: true });
        } catch { /* ignore */ }
      }
    }
  }
}

export const zhihuLoginService = new ZhihuLoginService();
