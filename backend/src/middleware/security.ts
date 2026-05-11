/**
 * SSRF 防护与 URL 安全校验
 * 用于校验用户输入的 URL，防止内网攻击和 DNS 重绑定
 */

import { resolve4 } from 'node:dns/promises';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * 检查 IP 是否为私有/保留地址
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 私有地址段
  const ipv4Private = [
    /^127\./, // 环回
    /^10\./, // A类私有
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // B类私有
    /^192\.168\./, // C类私有
    /^169\.254\./, // 链路本地
    /^0\./, // 当前网络
    /^224\./, // 多播
    /^240\./, // 保留
  ];

  for (const pattern of ipv4Private) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  // IPv6 环回和链路本地
  if (
    ip === '::1' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  ) {
    return true;
  }

  return false;
}

/**
 * 校验 URL 是否安全（防止 SSRF）
 *
 * 规则:
 * 1. 必须是有效的 URL 格式
 * 2. 协议必须是 http: 或 https:
 * 3. 禁止私有 IP 和 localhost
 * 4. 可选: DNS 重绑定检查（异步解析后验证）
 *
 * @param urlStr 要校验的 URL 字符串
 * @param options.strict 是否启用严格模式（仅允许 https）
 * @param options.checkDns 是否进行 DNS 重绑定检查（会增加延迟）
 * @returns 校验通过的 URL 字符串
 * @throws SecurityError 校验失败时抛出
 */
export async function validateUrl(
  urlStr: string,
  options: { strict?: boolean; checkDns?: boolean } = {}
): Promise<string> {
  const { strict = false, checkDns = false } = options;

  if (!urlStr || typeof urlStr !== 'string') {
    throw new SecurityError('URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SecurityError('Invalid URL format');
  }

  // 协议检查
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityError(`Unsupported protocol: ${parsed.protocol}`);
  }

  if (strict && parsed.protocol !== 'https:') {
    throw new SecurityError('Only HTTPS URLs are allowed in strict mode');
  }

  // 主机名检查
  const hostname = parsed.hostname.toLowerCase();

  // 禁止 localhost 和纯 IP（除非明确允许）
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  ) {
    throw new SecurityError('Localhost/loopback addresses are not allowed');
  }

  // 空主机名检查
  if (!hostname || hostname.length === 0) {
    throw new SecurityError('URL must have a valid hostname');
  }

  // 如果是纯 IP 地址，检查是否为私有地址
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SecurityError(`Private IP address not allowed: ${hostname}`);
    }
  }

  // DNS 重绑定检查（可选，有性能开销）
  if (checkDns) {
    try {
      const addresses = await resolve4(hostname);
      for (const ip of addresses) {
        if (isPrivateIp(ip)) {
          throw new SecurityError(
            `DNS resolution returned private IP (${ip}), possible DNS rebinding attack`
          );
        }
      }
    } catch (error) {
      // DNS 解析失败但不是因为我们的检查
      if (error instanceof SecurityError) {
        throw error;
      }
      // 其他 DNS 错误（如域名不存在）根据需求决定是否放行
      // 这里选择放行，因为外部域名可能确实无法解析（如内网环境）
    }
  }

  return urlStr;
}

/**
 * 同步版本的 URL 基础校验（不执行 DNS 查询）
 * 适用于快速检查场景
 */
export function validateUrlSync(
  urlStr: string,
  options: { strict?: boolean } = {}
): string {
  const { strict = false } = options;

  if (!urlStr || typeof urlStr !== 'string') {
    throw new SecurityError('URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SecurityError('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SecurityError(`Unsupported protocol: ${parsed.protocol}`);
  }

  if (strict && parsed.protocol !== 'https:') {
    throw new SecurityError('Only HTTPS URLs are allowed in strict mode');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0'
  ) {
    throw new SecurityError('Localhost/loopback addresses are not allowed');
  }

  if (!hostname || hostname.length === 0) {
    throw new SecurityError('URL must have a valid hostname');
  }

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SecurityError(`Private IP address not allowed: ${hostname}`);
    }
  }

  return urlStr;
}
