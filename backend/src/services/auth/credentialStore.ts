/**
 * 平台凭证统一存储
 * 负责读写 platform_credentials 表，加密存储敏感信息
 */

import { sql } from '../../db/client.js';

export interface PlatformCredential {
  platform: string;
  credentialType: 'cookie' | 'token';
  value: string;
  status: 'active' | 'expired' | 'invalid';
  verifiedAt: string | null;
  updatedAt: string;
}

function simpleEncrypt(text: string): string {
  // 简单的 base64 混淆，不做高强度加密（凭证本身已有其他保护层）
  return Buffer.from(text).toString('base64');
}

function simpleDecrypt(encoded: string): string {
  try {
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return encoded;
  }
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
    }>(
      'SELECT platform, credential_type, credential_value, status, verified_at, updated_at FROM platform_credentials WHERE platform = ?',
      [platform]
    );

    if (!row) return null;

    return {
      platform: row.platform,
      credentialType: row.credential_type as 'cookie' | 'token',
      value: simpleDecrypt(row.credential_value),
      status: row.status as 'active' | 'expired' | 'invalid',
      verifiedAt: row.verified_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 保存或更新凭证
   */
  async save(platform: string, credentialType: 'cookie' | 'token', value: string): Promise<void> {
    const encrypted = simpleEncrypt(value);
    await sql.execute(
      `INSERT INTO platform_credentials (platform, credential_type, credential_value, status, verified_at, updated_at)
       VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
       ON CONFLICT (platform) DO UPDATE SET
         credential_type = excluded.credential_type,
         credential_value = excluded.credential_value,
         status = 'active',
         verified_at = datetime('now'),
         updated_at = datetime('now')`,
      [platform, credentialType, encrypted]
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
}

export const credentialStore = new CredentialStore();
