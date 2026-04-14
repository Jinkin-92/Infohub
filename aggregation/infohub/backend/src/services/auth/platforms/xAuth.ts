/**
 * X/Twitter 认证 Provider
 * X.com 不支持扫码登录，仅支持手动填凭证
 */

import { credentialStore } from '../credentialStore.js';

export async function getXStatus() {
  const cred = (await credentialStore.getAllStatus()).find((c) => c.platform === 'x');
  return {
    platform: 'x',
    displayName: 'X/Twitter',
    icon: '🐦',
    color: '#000000',
    // X 不支持扫码登录，仅手动凭证
    capability: { qrLogin: false, manualCredential: true, needsVerification: true },
    status: cred?.hasValue ? 'connected' : 'disconnected',
    cookiePreview: cred?.hasValue ? '●●●●●●' : undefined,
    verifiedAt: cred?.verifiedAt || undefined,
    dependentSources: 0,
  };
}

export async function saveXCredential(cookie: string): Promise<void> {
  await credentialStore.save('x', 'cookie', cookie);
}

export async function deleteXCredential(): Promise<void> {
  await credentialStore.delete('x');
}
