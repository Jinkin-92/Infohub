/**
 * 小红书认证 Provider
 * 复用微博扫码登录逻辑，改 URL 为小红书
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { credentialStore } from '../credentialStore.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { localIntegrationsService } from '../../localIntegrations.js';

const DEFAULT_XHS_URL = 'https://www.xiaohongshu.com/login';
const PREFERRED_COOKIE_NAMES = ['a1', 'webId', 'galaxy_creator_session_info', 'web_session'];

type SessionState = 'launching' | 'awaiting_login' | 'login_detected' | 'cookie_saved' | 'failed' | 'cancelled';

export interface LoginSession {
  sessionId: string;
  state: SessionState;
  message: string;
  startedAt: string;
  updatedAt: string;
  targetUrl: string;
  cookieConfigured: boolean;
  cookiePreview?: string;
  error?: string;
}

interface SessionInternal {
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

const activeSessions = new Map<string, SessionInternal>();

function getChromePath(): string {
  const explicit = process.env.CHROME_PATH;
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

  const cacheRoot = join(homedir(), '.cache', 'ms-playwright');
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

  return '';
}

export async function startXiaohongshuSession(targetUrl?: string): Promise<LoginSession> {
  const sessionId = randomUUID();
  const profileDir = join(homedir(), '.config', 'infohub-xhs-login', sessionId);

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

  const session: SessionInternal = {
    sessionId,
    state: 'launching',
    message: '正在启动浏览器…',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    targetUrl: targetUrl || DEFAULT_XHS_URL,
    profileDir,
    browser: null,
    page: null,
    cookieConfigured: false,
  };

  activeSessions.set(sessionId, session);

  launchBrowser(session).catch((err) => {
    session.state = 'failed';
    session.error = err.message;
    session.updatedAt = nowIso();
  });

  return toSnapshot(session);
}

async function launchBrowser(session: SessionInternal): Promise<void> {
  const chromePath = getChromePath();
  if (!chromePath) {
    session.state = 'failed';
    session.error = '未找到 Chrome 浏览器';
    session.updatedAt = nowIso();
    return;
  }

  session.message = '正在打开小红书登录页…';
  session.state = 'awaiting_login';
  session.updatedAt = nowIso();

  try {
    session.browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath,
      userDataDir: session.profileDir,
      defaultViewport: null,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-popup-blocking',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-gpu-rasterization',
      ],
    });

    const page = await session.browser.newPage();
    session.page = page;
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1440, height: 960 });

    await page.goto(session.targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    session.currentUrl = session.targetUrl;
    session.updatedAt = nowIso();

    pollLoginStatus(session);
  } catch (err) {
    session.state = 'failed';
    session.error = err instanceof Error ? err.message : '启动失败';
    session.updatedAt = nowIso();
  }
}

async function pollLoginStatus(session: SessionInternal): Promise<void> {
  while (session.state === 'awaiting_login' || session.state === 'launching') {
    await new Promise((r) => setTimeout(r, 2000));
    if (!session.page || !session.browser) break;

    try {
      const url = session.page.url();
      session.currentUrl = url;

      // 小红书登录成功后 URL 会变化（通常是个人页）
      if (url.includes('xiaohongshu.com/user/profile') || url.includes('xiaohongshu.com/')) {
        if (!url.includes('login')) {
          session.state = 'login_detected';
          session.message = '检测到登录成功，正在提取 Cookie…';
          session.updatedAt = nowIso();
          await extractAndSaveCookies(session);
          return;
        }
      }
    } catch { /* ignore */ }
  }
}

async function extractAndSaveCookies(session: SessionInternal): Promise<void> {
  if (!session.page) {
    session.state = 'failed';
    session.error = '页面已关闭';
    session.updatedAt = nowIso();
    return;
  }

  try {
    const cookies = await session.page.cookies();
    const needed = cookies.filter((c) => PREFERRED_COOKIE_NAMES.includes(c.name));
    const cookieString = needed.map((c) => `${c.name}=${c.value}`).join('; ');

    if (!cookieString.includes('a1')) {
      session.state = 'failed';
      session.error = '未找到 a1 Cookie，登录可能未完成';
      session.updatedAt = nowIso();
      return;
    }

    session.extractedCookie = cookieString;
    session.cookiePreview = cookieString.slice(0, 12) + '…';

    // 写入 credentialStore（统一认证状态）
    await credentialStore.save('xiaohongshu', 'cookie', cookieString);
    // 写入 RSSHub 配置（非阻塞，失败不影响登录状态）
    try {
      await localIntegrationsService.saveRsshubSettings({ XIAOHONGSHU_COOKIE: cookieString });
    } catch (err) {
      console.error('[XiaohongshuAuth] saveRsshubSettings failed (non-fatal):', err instanceof Error ? err.message : err);
    }
    session.cookieConfigured = true;
    session.state = 'cookie_saved';
    session.message = '小红书 Cookie 已保存';
    session.updatedAt = nowIso();

    await cleanupSession(session);
  } catch (err) {
    session.state = 'failed';
    session.error = err instanceof Error ? err.message : '保存失败';
    session.updatedAt = nowIso();
  }
}

async function cleanupSession(session: SessionInternal): Promise<void> {
  if (session.browser) {
    try {
      await session.browser.close();
    } catch { /* ignore */ }
    session.browser = null;
    session.page = null;
  }
}

export async function getXiaohongshuSession(sessionId: string): Promise<LoginSession | null> {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  if (session.page && session.state === 'awaiting_login') {
    try {
      const url = session.page.url();
      session.currentUrl = url;
      if (url.includes('xiaohongshu.com/user/profile') && !url.includes('login')) {
        await extractAndSaveCookies(session);
      }
    } catch { /* ignore */ }
  }

  return toSnapshot(session);
}

export async function cancelXiaohongshuSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  session.state = 'cancelled';
  session.updatedAt = nowIso();
  await cleanupSession(session);
}

function toSnapshot(s: SessionInternal): LoginSession {
  return {
    sessionId: s.sessionId,
    state: s.state,
    message: s.message,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    targetUrl: s.targetUrl,
    cookieConfigured: s.cookieConfigured,
    cookiePreview: s.cookiePreview,
    error: s.error,
  };
}

export async function getXiaohongshuStatus() {
  const { credentialStore } = await import('../credentialStore.js');
  const cred = (await credentialStore.getAllStatus()).find((c) => c.platform === 'xiaohongshu');
  return {
    platform: 'xiaohongshu',
    displayName: '小红书',
    icon: '📕',
    color: '#FF2442',
    capability: { qrLogin: true, manualCredential: true, needsVerification: true },
    status: cred?.hasValue ? 'connected' : 'disconnected',
    cookiePreview: cred?.hasValue ? '●●●●●●' : undefined,
    verifiedAt: cred?.verifiedAt || undefined,
    dependentSources: 0,
  };
}

export async function saveXiaohongshuCredential(cookie: string): Promise<void> {
  const { credentialStore } = await import('../credentialStore.js');
  await credentialStore.save('xiaohongshu', 'cookie', cookie);
}

export async function deleteXiaohongshuCredential(): Promise<void> {
  const { credentialStore } = await import('../credentialStore.js');
  await credentialStore.delete('xiaohongshu');
}
