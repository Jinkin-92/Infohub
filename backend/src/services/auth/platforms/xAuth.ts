/**
 * X/Twitter 认证 Provider
 * X.com 不支持扫码登录，仅支持手动填凭证
 */

import { credentialStore } from '../credentialStore.js';

function credentialToStatus(cred: { hasValue: boolean; verifiedAt: string | null } | null | undefined): 'connected' | 'disconnected' | 'expired' | 'invalid' {
  if (!cred?.hasValue) return 'disconnected';
  if (!cred.verifiedAt) return 'invalid';
  const ageDays = (Date.now() - new Date(cred.verifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= 7) return 'expired';
  if (ageDays >= 3) return 'connected'; // stale but not yet expired
  return 'connected';
}

export async function getXStatus() {
  const cred = (await credentialStore.getAllStatus()).find((c) => c.platform === 'x');
  return {
    platform: 'x',
    displayName: 'X/Twitter',
    icon: '🐦',
    color: '#000000',
    // X 不支持扫码登录，仅手动凭证
    capability: { qrLogin: false, manualCredential: true, needsVerification: true },
    status: credentialToStatus(cred),
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
