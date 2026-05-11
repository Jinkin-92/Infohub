/**
 * 平台凭证统一存储
 * 负责读写 platform_credentials 表，加密存储敏感信息
 */

import { sql } from '../../db/client.js';
import { encrypt, decrypt } from '../../lib/crypto.js';

export interface PlatformCredential {
  platform: string;
  credentialType: 'cookie' | 'token';
  value: string;
  status: 'active' | 'expired' | 'invalid';
  verifiedAt: string | null;
  updatedAt: string;
}

/**
 * 加密凭证值（AES-256-GCM）
 * 如果 ENCRYPTION_KEY 未设置，回退到 base64（开发环境兼容）
 */
function credentialEncrypt(text: string): string {
  try {
    return encrypt(text);
  } catch {
    // ENCRYPTION_KEY 未设置时的降级处理
    return Buffer.from(text).toString('base64');
  }
}

/**
 * 解密凭证值
 * 自动兼容旧版 base64 格式（自动迁移）
 */
function credentialDecrypt(encoded: string): string {
  try {
    return decrypt(encoded);
  } catch {
    // 解密失败时尝试旧版 base64
    try {
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return encoded;
    }
  }
}

export interface CredentialHealth {
  valid: boolean;
  message?: string;
  expiresAt?: string | null;
}

export class CredentialStore {
  /**
   * 获取某平台的凭证
   */
  async get(platform: string): Promise<PlatformCredential | null> {
    const row = await sql.get<{
      platform: string;
      credential_type: string;
      credential_value: string;
      status: string;
      verified_at: string | null;
      updated_at: string;
      expires_at: string | null;
    }>(
      'SELECT platform, credential_type, credential_value, status, verified_at, updated_at, expires_at FROM platform_credentials WHERE platform = ?',
      [platform]
    );

    if (!row) return null;

    return {
      platform: row.platform,
      credentialType: row.credential_type as 'cookie' | 'token',
      value: credentialDecrypt(row.credential_value),
      status: row.status as 'active' | 'expired' | 'invalid',
      verifiedAt: row.verified_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 保存或更新凭证
   */
  async save(platform: string, credentialType: 'cookie' | 'token', value: string, options?: { expiresAt?: string; refreshToken?: string }): Promise<void> {
    const encrypted = credentialEncrypt(value);
    const encryptedRefresh = options?.refreshToken ? credentialEncrypt(options.refreshToken) : null;
    await sql.execute(
      `INSERT INTO platform_credentials (platform, credential_type, credential_value, status, verified_at, updated_at, expires_at, refresh_token)
       VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'), ?, ?)
       ON CONFLICT (platform) DO UPDATE SET
         credential_type = excluded.credential_type,
         credential_value = excluded.credential_value,
         status = 'active',
         verified_at = datetime('now'),
         updated_at = datetime('now'),
         expires_at = COALESCE(excluded.expires_at, expires_at),
         refresh_token = COALESCE(excluded.refresh_token, refresh_token)`,
      [platform, credentialType, encrypted, options?.expiresAt ?? null, encryptedRefresh]
    );
  }

  /**
   * 更新凭证状态
   */
  async updateStatus(platform: string, status: 'active' | 'expired' | 'invalid'): Promise<void> {
    await sql.execute(
      "UPDATE platform_credentials SET status = ?, verified_at = datetime('now'), updated_at = datetime('now') WHERE platform = ?",
      [status, platform]
    );
  }

  /**
   * 删除凭证
   */
  async delete(platform: string): Promise<void> {
    await sql.execute('DELETE FROM platform_credentials WHERE platform = ?', [platform]);
  }

  /**
   * 获取所有平台的凭证状态摘要（不返回具体值）
   */
  async getAllStatus(): Promise<Array<{
    platform: string;
    credentialType: string;
    status: string;
    hasValue: boolean;
    verifiedAt: string | null;
  }>> {
    const rows = await sql.query<{
      platform: string;
      credential_type: string;
      status: string;
      credential_value: string;
      verified_at: string | null;
    }>(
      'SELECT platform, credential_type, status, credential_value, verified_at FROM platform_credentials'
    );

    return rows.map((r) => ({
      platform: r.platform,
      credentialType: r.credential_type,
      status: r.status,
      hasValue: r.credential_value.length > 0,
      verifiedAt: r.verified_at,
    }));
  }

  /**
   * 检测凭证是否即将过期
   */
  async isExpired(platform: string, thresholdMs = 300000): Promise<boolean> {
    const row = await sql.get<{ expires_at: string | null; status: string }>(
      'SELECT expires_at, status FROM platform_credentials WHERE platform = ?',
      [platform]
    );

    if (!row) return true; // 无凭证视为过期
    if (row.status === 'expired' || row.status === 'invalid') return true;
    if (!row.expires_at) return false; // 无过期时间视为有效

    const expiresAt = new Date(row.expires_at).getTime();
    if (Number.isNaN(expiresAt)) return false;

    return Date.now() + thresholdMs >= expiresAt;
  }

  /**
   * 凭证健康检查
   */
  async healthCheck(platform: string): Promise<CredentialHealth> {
    const row = await sql.get<{
      status: string;
      expires_at: string | null;
      verified_at: string | null;
    }>(
      'SELECT status, expires_at, verified_at FROM platform_credentials WHERE platform = ?',
      [platform]
    );

    if (!row) {
      return { valid: false, message: 'No credential found for platform' };
    }

    if (row.status === 'expired') {
      return { valid: false, message: 'Credential has expired', expiresAt: row.expires_at };
    }

    if (row.status === 'invalid') {
      return { valid: false, message: 'Credential is invalid' };
    }

    if (row.expires_at) {
      const expiresAt = new Date(row.expires_at).getTime();
      if (!Number.isNaN(expiresAt) && Date.now() >= expiresAt) {
        return { valid: false, message: 'Credential expired', expiresAt: row.expires_at };
      }
    }

    return { valid: true, expiresAt: row.expires_at };
  }
}

export const credentialStore = new CredentialStore();
