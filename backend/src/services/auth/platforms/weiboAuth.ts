/**
 * 微博认证 Provider
 * 封装现有 WeiboLoginService
 */

import { WeiboLoginService, type WeiboLoginSessionSnapshot } from '../../weiboLogin.js';
import { credentialStore } from '../credentialStore.js';
import { weiboProfileStore } from '../../weiboProfileStore.js';

const weiboLoginService = new WeiboLoginService();

export interface LoginSession {
  sessionId: string;
  state: 'launching' | 'awaiting_login' | 'login_detected' | 'cookie_saved' | 'failed' | 'cancelled';
  message: string;
  startedAt: string;
  updatedAt: string;
  targetUrl?: string;
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
  lastCheckedAt?: string;
  lastSuccessfulUseAt?: string;
  healthState?: 'healthy' | 'warning' | 'expired';
  warningMessage?: string;
  reconnectRecommended?: boolean;
  error?: string;
  dependentSources: number;
}

function getProfileHealth(meta: ReturnType<typeof weiboProfileStore.getMeta>): {
  healthState?: 'healthy' | 'warning' | 'expired';
  warningMessage?: string;
  reconnectRecommended?: boolean;
  lastCheckedAt?: string;
  lastSuccessfulUseAt?: string;
} {
  if (!meta) {
    return {};
  }

  const referenceTime = meta.lastSuccessfulUseAt || meta.verifiedAt;
  const ageDays = (Date.now() - new Date(referenceTime).getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays >= 14) {
    return {
      healthState: 'expired',
      warningMessage: '微博登录态超过 14 天未成功验证，建议重新扫码登录。',
      reconnectRecommended: true,
      lastCheckedAt: meta.lastCheckedAt,
      lastSuccessfulUseAt: meta.lastSuccessfulUseAt,
    };
  }

  if (ageDays >= 7) {
    return {
      healthState: 'warning',
      warningMessage: '微博登录态超过 7 天未成功使用，建议提前重新验证一次。',
      reconnectRecommended: true,
      lastCheckedAt: meta.lastCheckedAt,
      lastSuccessfulUseAt: meta.lastSuccessfulUseAt,
    };
  }

  return {
    healthState: 'healthy',
    reconnectRecommended: false,
    lastCheckedAt: meta.lastCheckedAt,
    lastSuccessfulUseAt: meta.lastSuccessfulUseAt,
  };
}

function sessionToStatus(session: WeiboLoginSessionSnapshot | null, cred: { hasValue: boolean } | null): PlatformStatus['status'] {
  if (!cred?.hasValue) return 'disconnected';
  if (session?.state === 'cookie_saved') return 'connected';
  if (session?.state === 'failed') return 'invalid';
  return 'connected';
}

export async function getWeiboStatus(): Promise<PlatformStatus> {
  const cred = await credentialStore.getAllStatus();
  const weiboCred = cred.find((c) => c.platform === 'weibo');
  const profileMeta = weiboProfileStore.getMeta();
  const health = getProfileHealth(profileMeta);
  const sourcesCount = 0;

  return {
    platform: 'weibo',
    displayName: '微博',
    icon: '📮',
    color: '#E6162D',
    capability: {
      qrLogin: true,
      manualCredential: true,
      needsVerification: true,
    },
    status: sessionToStatus(null, weiboCred ?? null),
    cookiePreview: profileMeta?.cookiePreview || (weiboCred?.hasValue ? '●●●●●●' : undefined),
    verifiedAt: profileMeta?.verifiedAt || weiboCred?.verifiedAt || undefined,
    lastCheckedAt: health.lastCheckedAt,
    lastSuccessfulUseAt: health.lastSuccessfulUseAt,
    healthState: health.healthState,
    warningMessage: health.warningMessage,
    reconnectRecommended: health.reconnectRecommended,
    dependentSources: sourcesCount,
  };
}

export async function startWeiboSession(targetUrl?: string): Promise<LoginSession> {
  const session = await weiboLoginService.startSession(targetUrl);
  return {
    sessionId: session.sessionId,
    state: session.state,
    message: session.message,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    targetUrl: session.targetUrl,
    cookieConfigured: session.cookieConfigured,
    cookiePreview: session.cookiePreview,
    error: session.error,
  };
}

export async function getWeiboSession(sessionId: string): Promise<LoginSession | null> {
  try {
    const session = await weiboLoginService.getSession(sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      state: session.state,
      message: session.message,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      targetUrl: session.targetUrl,
      cookieConfigured: session.cookieConfigured,
      cookiePreview: session.cookiePreview,
      error: session.error,
    };
  } catch {
    return null;
  }
}

export async function cancelWeiboSession(sessionId: string): Promise<void> {
  await weiboLoginService.cancelSession(sessionId);
}

export async function saveWeiboCredential(cookie: string): Promise<void> {
  await credentialStore.save('weibo', 'cookie', cookie);
}

export async function deleteWeiboCredential(): Promise<void> {
  await credentialStore.delete('weibo');
  weiboProfileStore.clear();
}
