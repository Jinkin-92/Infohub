/**
 * AES-256-GCM 加密工具
 * 替代 credentialStore.ts 中的 base64 简单混淆
 *
 * 环境变量要求:
 *   ENCRYPTION_KEY=64位hex字符串 (32字节 = 256位)
 *   生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyHex = env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes), got ${keyHex.length}`
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * 加密明文，返回 base64 编码的密文
 * 格式: base64(iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 组合: iv (16) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return combined.toString('base64');
}

/**
 * 解密密文
 * 自动检测旧版 base64 格式并返回原文（用于迁移）
 */
export function decrypt(ciphertextBase64: string): string {
  // 尝试检测旧版 base64（无 IV 和 authTag，纯文本长度较短且可解码为可读文本）
  if (isLegacyBase64(ciphertextBase64)) {
    return legacyDecrypt(ciphertextBase64);
  }

  const key = getKey();
  const combined = Buffer.from(ciphertextBase64, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * 判断是否是旧版 base64 加密格式
 * 旧版特征: 能直接 base64 解码为可读文本，长度较短
 */
function isLegacyBase64(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    // 旧版解密后的内容通常是 JSON 或纯文本，长度与 base64 编码前相近
    // 新版密文有 32 字节的 IV+authTag 前缀，解码后会有不可读字符
    // 简单启发式: 如果解码后以 '{' 开头或是纯可打印字符，可能是旧版
    if (/^\{/.test(decoded) || /^[\x20-\x7E\s]+$/.test(decoded)) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function legacyDecrypt(value: string): string {
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return value;
  }
}

/**
 * 生成随机加密密钥（用于初始化项目）
 */
export function generateKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}
