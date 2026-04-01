/**
 * CookieExtractorService - 通过 Chrome DevTools Protocol 获取 Cookie
 *
 * 利用 Chrome 远程调试接口，自动从用户已登录的浏览器中提取 Cookie
 * 并配置到 rsshub-local/.env
 */

import { WebSocket } from 'ws';
import { setTimeout as delay } from 'timers/promises';
import { localIntegrationsService } from './localIntegrations.js';

export interface PlatformConfig {
  key: string;
  name: string;
  url: string;
  cookieKeys: string[];
}

export interface CookieResult {
  platform: string;
  success: boolean;
  cookies: Record<string, string>;
  error?: string;
}

export interface ExtractResult {
  total: number;
  success: number;
  failed: number;
  results: CookieResult[];
}

// 平台配置
const PLATFORMS: PlatformConfig[] = [
  {
    key: 'ZHIHU_COOKIES',
    name: '知乎',
    url: 'https://www.zhihu.com/',
    cookieKeys: ['z_c0', 'd_c0', 'q_c1'],
  },
  {
    key: 'WEIBO_COOKIES',
    name: '微博',
    url: 'https://weibo.com/',
    cookieKeys: ['SUB', 'SUBP'],
  },
  {
    key: 'XIAOHONGSHU_COOKIE',
    name: '小红书',
    url: 'https://www.xiaohongshu.com/',
    cookieKeys: ['a1', 'webId'],
  },
  {
    key: 'DOUBAN_COOKIE',
    name: '豆瓣',
    url: 'https://www.douban.com/',
    cookieKeys: ['dbcl2', 'ck'],
  },
  {
    key: 'TWITTER_AUTH_TOKEN',
    name: 'X/Twitter',
    url: 'https://x.com/',
    cookieKeys: ['auth_token'],
  },
];

interface CDPCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite: string;
}

interface CDPResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export class CookieExtractorService {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private chromePort: number;
  private chromeHost: string;

  constructor(chromePort?: number, chromeHost = 'localhost') {
    // 默认端口，可通过构造函数或环境变量覆盖
    this.chromePort = chromePort || Number(process.env.CHROME_DEBUG_PORT) || 18792;
    this.chromeHost = chromeHost;
  }

  /**
   * 连接到 Chrome 远程调试
   */
  private async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `ws://${this.chromeHost}:${this.chromePort}`;
        console.log(`[CookieExtractor] Connecting to Chrome at ${wsUrl}`);

        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('[CookieExtractor] WebSocket connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as CDPResponse;
            this.handleMessage(message);
          } catch {
            // Ignore non-JSON messages
          }
        });

        this.ws.on('error', (error) => {
          console.error('[CookieExtractor] WebSocket error:', error.message);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[CookieExtractor] WebSocket closed');
          this.ws = null;
        });

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理 CDP 响应消息
   */
  private handleMessage(message: CDPResponse): void {
    // 忽略事件消息（没有 id）
    if (!message.id) {
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`CDP Error ${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  /**
   * 发送 CDP 命令并等待响应
   */
  private async sendCommand(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.connect();

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify({ id, method, params });
      this.ws.send(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`CDP command timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * 启用页面调试
   */
  private async enablePage(targetId: string): Promise<void> {
    await this.sendCommand('Target.activateTarget', { targetId });
    await this.sendCommand('Page.enable', {});
  }

  /**
   * 导航到指定 URL
   */
  private async navigateTo(url: string, targetId: string): Promise<void> {
    await this.sendCommand('Page.navigate', { url, targetId });
    // Wait for page to load
    await delay(2000);
  }

  /**
   * 获取当前页面的所有 Cookie
   */
  private async getCookies(): Promise<CDPCookie[]> {
    const result = (await this.sendCommand('Network.getCookies', {})) as { cookies: CDPCookie[] };
    return result.cookies || [];
  }

  /**
   * 提取指定平台的 Cookie
   */
  private async extractPlatformCookies(platform: PlatformConfig): Promise<CookieResult> {
    console.log(`[CookieExtractor] Extracting cookies for ${platform.name}...`);

    try {
      // 通过 JSON API 获取 target
      const targetsResponse = await fetch(`http://${this.chromeHost}:${this.chromePort}/json`);
      if (!targetsResponse.ok) {
        throw new Error(`Failed to get Chrome targets: ${targetsResponse.status}`);
      }

      const targets = (await targetsResponse.json()) as Array<{
        id: string;
        url: string;
        type: string;
      }>;

      // 查找已打开的目标页面或创建新页面
      let target = targets.find((t) => t.url.startsWith(platform.url) && t.type === 'page');

      if (!target) {
        // 创建新页面
        const newTargetResponse = await fetch(`http://${this.chromeHost}:${this.chromePort}/json/new`, {
          method: 'POST',
        });
        if (!newTargetResponse.ok) {
          throw new Error(`Failed to create new tab: ${newTargetResponse.status}`);
        }
        const newTarget = (await newTargetResponse.json()) as { id: string; url: string; type: string };
        target = newTarget;
        console.log(`[CookieExtractor] Created new tab for ${platform.name}`);
      }

      // 激活并导航
      await this.enablePage(target.id);

      // 如果当前 URL 不匹配，需要导航
      const currentTargetsResponse = await fetch(`http://${this.chromeHost}:${this.chromePort}/json`);
      const currentTargets = (await currentTargetsResponse.json()) as Array<{ id: string; url: string }>;
      const currentTarget = currentTargets.find((t) => t.id === target?.id);

      if (currentTarget && !currentTarget.url.startsWith(platform.url)) {
        await this.navigateTo(platform.url, target.id);
      }

      // 等待 Cookie 设置
      await delay(1000);

      // 获取 Cookie
      const cookies = await this.getCookies();
      console.log(`[CookieExtractor] Found ${cookies.length} cookies for ${platform.name}`);

      // 提取需要的 Cookie
      const neededCookies = cookies.filter((c) =>
        platform.cookieKeys.some((key) => c.name === key || c.domain.includes(key.toLowerCase()))
      );

      // 格式化为字符串
      const cookieString = neededCookies.map((c) => `${c.name}=${c.value}`).join('; ');

      if (!cookieString) {
        console.warn(`[CookieExtractor] No matching cookies found for ${platform.name}`);
        return {
          platform: platform.name,
          success: false,
          cookies: {},
          error: `未找到 ${platform.name} 的登录 Cookie，请确保已登录 ${platform.url}`,
        };
      }

      console.log(`[CookieExtractor] Successfully extracted cookies for ${platform.name}`);
      return {
        platform: platform.name,
        success: true,
        cookies: { [platform.key]: cookieString },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CookieExtractor] Failed to extract ${platform.name}:`, errorMessage);
      return {
        platform: platform.name,
        success: false,
        cookies: {},
        error: errorMessage,
      };
    }
  }

  /**
   * 提取所有平台 Cookie
   */
  async extractAll(): Promise<ExtractResult> {
    const results: CookieResult[] = [];

    for (const platform of PLATFORMS) {
      const result = await this.extractPlatformCookies(platform);
      results.push(result);
      // 每个平台之间稍作延迟，避免请求过快
      await delay(500);
    }

    // 保存成功的 Cookie 到 rsshub
    const successfulResults = results.filter((r) => r.success);
    if (successfulResults.length > 0) {
      const cookieMap: Record<string, string> = {};
      for (const result of successfulResults) {
        Object.assign(cookieMap, result.cookies);
      }

      try {
        await localIntegrationsService.saveRsshubSettings(cookieMap);
        console.log('[CookieExtractor] Cookies saved to rsshub-local/.env');
      } catch (error) {
        console.error('[CookieExtractor] Failed to save cookies:', error);
      }
    }

    return {
      total: PLATFORMS.length,
      success: successfulResults.length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * 获取当前 Chrome 连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; port: number; error?: string }> {
    try {
      const response = await fetch(`http://${this.chromeHost}:${this.chromePort}/json`);
      if (response.ok) {
        return { connected: true, port: this.chromePort };
      }
      return { connected: false, port: this.chromePort, error: `HTTP ${response.status}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      return { connected: false, port: this.chromePort, error: errorMessage };
    }
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const cookieExtractor = new CookieExtractorService();
