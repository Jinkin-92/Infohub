/**
 * 知乎认证 Provider
 * 支持 Chrome 窗口扫码 + 短信登录 + 手动凭证
 */

import { credentialStore } from '../credentialStore.js';
import { zhihuLoginService } from '../../zhihuLogin.js';

export interface LoginSession {
  sessionId: string;
  state: 'launching' | 'awaiting_login' | 'login_detected' | 'cookie_saved' | 'failed' | 'cancelled';
  message: string;
  startedAt: string;
  updatedAt: string;
  targetUrl?: string;
  currentUrl?: string;
  cookieConfigured: boolean;
  cookiePreview?: string;
  error?: string;
}

export interface PlatformStatus {
  platform: string;
  displayName: string;
  icon: string;
  color: string;
  capability: {
    qrLogin: boolean;
    manualCredential: boolean;
    needsVerification: boolean;
  };
  status: 'connected' | 'disconnected' | 'expired' | 'invalid';
  cookiePreview?: string;
  verifiedAt?: string;
  error?: string;
  dependentSources: number;
}

export async function getZhihuStatus(): Promise<PlatformStatus> {
  const cred = (await credentialStore.getAllStatus()).find((c) => c.platform === 'zhihu');
  return {
    platform: 'zhihu',
    displayName: '知乎',
    icon: '💬',
    color: '#0066DD',
    capability: {
      qrLogin: true,
      manualCredential: true,
      needsVerification: true,
    },
    status: cred?.hasValue ? 'connected' : 'disconnected',
    cookiePreview: cred?.hasValue ? '●●●●●●' : undefined,
    verifiedAt: cred?.verifiedAt || undefined,
    dependentSources: 0,
  };
}

export async function startZhihuSession(targetUrl?: string): Promise<LoginSession> {
  const session = await zhihuLoginService.startSession(targetUrl);
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

export async function getZhihuSession(sessionId: string): Promise<LoginSession | null> {
  try {
    const session = await zhihuLoginService.getSession(sessionId);
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
  } catch {
    return null;
  }
}

export async function cancelZhihuSession(sessionId: string): Promise<void> {
  await zhihuLoginService.cancelSession(sessionId);
}

export async function saveZhihuCredential(cookie: string): Promise<void> {
  await credentialStore.save('zhihu', 'cookie', cookie);
}

export async function deleteZhihuCredential(): Promise<void> {
  await credentialStore.delete('zhihu');
}
