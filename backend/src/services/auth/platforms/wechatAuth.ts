/**
 * 微信认证 Provider
 * 封装现有 WeChatAuth + WeChatQrLogin
 */

import { WeChatAuth } from '../../wechat/auth.js';
import { weChatQrLogin } from '../../wechat/qrLogin.js';
import { credentialStore } from '../credentialStore.js';

const weChatAuth = new WeChatAuth();

export interface LoginSession {
  sessionId: string;
  state: 'launching' | 'awaiting_user_action' | 'confirmed' | 'expired' | 'failed' | 'cancelled';
  message: string;
  startedAt: string;
  updatedAt: string;
  qrcodeUrl?: string;
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
  tokenPreview?: string;
  verifiedAt?: string;
  error?: string;
  dependentSources: number;
}

type QrLoginState = 'launching' | 'awaiting_user_action' | 'confirmed' | 'expired' | 'failed' | 'cancelled';

interface QrLoginSession {
  uuid: string;
  state: QrLoginState;
  message: string;
  startedAt: string;
  updatedAt: string;
  qrcodeUrl: string;
  cookieConfigured: boolean;
  cookiePreview?: string;
  error?: string;
}

const activeSessions = new Map<string, QrLoginSession>();

function nowIso(): string {
  return new Date().toISOString();
}

export async function getWechatStatus(): Promise<PlatformStatus> {
  const cred = await credentialStore.get('wechat');
  const authStatus = await weChatAuth.getStatus();
  const sourcesCount = 0;

  let cookiePreview: string | undefined;
  let tokenPreview: string | undefined;

  if (cred && cred.value) {
    const parts = cred.value.split(';');
    for (const part of parts) {
      if (part.startsWith('cookie=')) cookiePreview = '●●●●●●';
      if (part.startsWith('token=')) tokenPreview = part.split('=')[1]?.slice(0, 6) + '…';
    }
  }

  return {
    platform: 'wechat',
    displayName: '微信公众号',
    icon: '💬',
    color: '#07C160',
    capability: {
      qrLogin: true,
      manualCredential: true,
      needsVerification: true,
    },
    status: !authStatus.configured
      ? 'disconnected'
      : authStatus.cookieValid && authStatus.tokenValid
        ? 'connected'
        : 'invalid',
    cookiePreview,
    tokenPreview,
    verifiedAt: cred?.verifiedAt || undefined,
    dependentSources: sourcesCount,
  };
}

/**
 * 启动微信二维码登录会话
 */
export async function startWechatSession(): Promise<LoginSession> {
  const result = await weChatQrLogin.getQrCode();
  const sessionId = result.uuid;

  const session: QrLoginSession = {
    uuid: sessionId,
    state: 'launching',
    message: '正在获取登录二维码…',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    qrcodeUrl: result.qrCodePath,
    cookieConfigured: false,
  };

  session.state = 'awaiting_user_action';
  session.message = '请打开微信扫描二维码';
  session.updatedAt = nowIso();

  activeSessions.set(sessionId, session);

  return {
    sessionId,
    state: session.state,
    message: session.message,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    qrcodeUrl: session.qrcodeUrl,
    cookieConfigured: session.cookieConfigured,
    cookiePreview: session.cookiePreview,
    error: session.error,
  };
}

/**
 * 获取微信登录会话状态
 */
export async function getWechatSession(sessionId: string): Promise<LoginSession | null> {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  if (['confirmed', 'expired', 'failed', 'cancelled'].includes(session.state)) {
    return {
      sessionId,
      state: session.state,
      message: session.message,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      qrcodeUrl: session.qrcodeUrl,
      cookieConfigured: session.cookieConfigured,
      cookiePreview: session.cookiePreview,
      error: session.error,
    };
  }

  try {
    const status = await weChatQrLogin.checkLoginStatus(sessionId);

    if (status.status === 'waiting') {
      session.state = 'awaiting_user_action';
      session.message = '等待扫码…';
      session.updatedAt = nowIso();
    } else if (status.status === 'scanned') {
      session.state = 'awaiting_user_action';
      session.message = '已扫码，请在手机上确认登录';
      session.updatedAt = nowIso();
    } else if (status.status === 'confirmed') {
      session.message = '登录成功，正在获取凭证…';
      session.updatedAt = nowIso();

      const credentials = await weChatQrLogin.handleLoginSuccess();
      if (credentials) {
        await saveWechatCredential(credentials.cookie, credentials.token);

        session.cookieConfigured = true;
        session.cookiePreview = '●●●●●●';
        session.state = 'confirmed';
        session.message = '登录成功';
        session.updatedAt = nowIso();
      } else {
        session.state = 'failed';
        session.error = '获取凭证失败';
        session.updatedAt = nowIso();
      }
    } else if (status.status === 'expired') {
      session.state = 'expired';
      session.message = '二维码已过期，请重新获取';
      session.updatedAt = nowIso();
    } else if (status.status === 'error') {
      session.state = 'failed';
      session.error = status.message || '未知错误';
      session.updatedAt = nowIso();
    }
  } catch (err) {
    session.state = 'failed';
    session.error = err instanceof Error ? err.message : '检查状态失败';
    session.updatedAt = nowIso();
  }

  return {
    sessionId,
    state: session.state,
    message: session.message,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    qrcodeUrl: session.qrcodeUrl,
    cookieConfigured: session.cookieConfigured,
    cookiePreview: session.cookiePreview,
    error: session.error,
  };
}

/**
 * 取消微信登录会话
 */
export async function cancelWechatSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.state = 'cancelled';
    session.message = '已取消登录';
    session.updatedAt = nowIso();
    activeSessions.delete(sessionId);
  }
}

export async function saveWechatCredential(cookie: string, token: string): Promise<void> {
  const value = `cookie=${cookie};token=${token}`;
  await weChatAuth.saveToSettings({ cookie, token });
  await credentialStore.save('wechat', 'cookie', value);
}

export async function deleteWechatCredential(): Promise<void> {
  await weChatAuth.saveToSettings({ cookie: '', token: '' });
  await credentialStore.delete('wechat');
}

export async function verifyWechatCredential(): Promise<{ valid: boolean; message?: string }> {
  try {
    const valid = await weChatAuth.verifyCredentials();
    if (valid) {
      await credentialStore.updateStatus('wechat', 'active');
      return { valid: true };
    }
    await credentialStore.updateStatus('wechat', 'invalid');
    return { valid: false, message: '凭证无效或已过期' };
  } catch (err) {
    await credentialStore.updateStatus('wechat', 'invalid');
    return { valid: false, message: err instanceof Error ? err.message : '验证失败' };
  }
}
