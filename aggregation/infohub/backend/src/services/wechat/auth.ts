/**
 * 微信认证管理模块
 * 对应 WeRss core/wx/wx.py 和 driver/token.py
 *
 * 功能:
 * - 管理微信 cookie 和 token
 * - 验证认证有效性
 * - 提供公众号搜索功能
 */

import { sql } from '../../db/client.js';

interface WeChatCredentials {
  cookie: string;
  token: string;
  userAgent: string;
}

interface WeChatAccount {
  fakeid: string;
  nickname: string;
  alias: string;
  round_head_img: string;
  service_type: number;
}

interface SearchResult {
  total: number;
  accounts: WeChatAccount[];
}

/**
 * 默认 User-Agent 列表
 */
const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
];

export class WeChatAuth {
  private cookie: string = '';
  private token: string = '';
  private userAgent: string = DEFAULT_USER_AGENTS[0];

  constructor() {
    this.loadFromSettings();
  }

  /**
   * 从数据库加载认证信息
   */
  private async loadFromSettings(): Promise<void> {
    try {
      const settings = await sql.get<{
        cookie: string | null;
        token: string | null;
        user_agent: string | null;
      }>('SELECT cookie, token, user_agent FROM wechat_settings WHERE id = 1');

      if (settings) {
        this.cookie = settings.cookie || '';
        this.token = settings.token || '';
        this.userAgent = settings.user_agent || DEFAULT_USER_AGENTS[0];
      }
    } catch (error) {
      console.error('[WeChatAuth] Failed to load settings:', error);
    }
  }

  /**
   * 保存认证信息到数据库
   */
  async saveToSettings(credentials: Partial<WeChatCredentials>): Promise<void> {
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (credentials.cookie !== undefined) {
      updates.push('cookie = ?');
      values.push(credentials.cookie);
    }
    if (credentials.token !== undefined) {
      updates.push('token = ?');
      values.push(credentials.token);
    }
    if (credentials.userAgent !== undefined) {
      updates.push('user_agent = ?');
      values.push(credentials.userAgent);
    }

    if (updates.length === 0) {
      return;
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(1); // WHERE id = 1

    await sql.execute(
      `UPDATE wechat_settings SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 更新内存中的值
    if (credentials.cookie !== undefined) this.cookie = credentials.cookie;
    if (credentials.token !== undefined) this.token = credentials.token;
    if (credentials.userAgent !== undefined) this.userAgent = credentials.userAgent;
  }

  /**
   * 检查认证是否已配置
   */
  isConfigured(): boolean {
    return Boolean(this.cookie && this.token);
  }

  /**
   * 获取认证状态
   */
  async getStatus(): Promise<{
    configured: boolean;
    cookieValid: boolean;
    tokenValid: boolean;
  }> {
    const configured = this.isConfigured();

    // 简单的有效性检查
    const cookieValid = configured && this.cookie.length > 20;
    const tokenValid = configured && /^\d+$/.test(this.token);

    return { configured, cookieValid, tokenValid };
  }

  /**
   * 验证 cookie 和 token 是否有效
   * 通过调用微信用户管理接口检查
   */
  async verifyCredentials(): Promise<boolean> {
    if (!this.cookie || !this.token) {
      return false;
    }

    try {
      const url = `https://mp.weixin.qq.com/cgi-bin/user_manager?type=4&token=${this.token}`;
      const response = await fetch(url, {
        headers: {
          Cookie: this.cookie,
          'User-Agent': this.userAgent,
        },
      });

      // 如果返回 HTML 而不是 JSON，说明可能失效
      const text = await response.text();
      return !text.includes('<!DOCTYPE html>') && !text.includes('登录');
    } catch (error) {
      console.error('[WeChatAuth] Verify failed:', error);
      return false;
    }
  }

  /**
   * 搜索公众号
   * 对应 WeRss search_Biz()
   */
  async searchBiz(query: string, limit: number = 5): Promise<SearchResult> {
    if (!this.cookie || !this.token) {
      throw new Error('WeChat credentials not configured');
    }

    const url = new URL('https://mp.weixin.qq.com/cgi-bin/searchbiz');
    url.searchParams.set('action', 'search_biz');
    url.searchParams.set('begin', '0');
    url.searchParams.set('count', String(limit));
    url.searchParams.set('query', query);
    url.searchParams.set('token', this.token);
    url.searchParams.set('lang', 'zh_CN');
    url.searchParams.set('f', 'json');
    url.searchParams.set('ajax', '1');

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Cookie: this.cookie,
          'User-Agent': this.userAgent,
        },
      });

      const data = await response.json() as {
        base_resp?: { ret: number };
        list?: Array<{
          fakeid: string;
          nickname: string;
          alias: string;
          round_head_img: string;
          service_type: number;
        }>;
      };

      if (data.base_resp?.ret !== 0) {
        throw new Error(`Search failed: ret=${data.base_resp?.ret}`);
      }

      return {
        total: data.list?.length || 0,
        accounts: (data.list || []).map((item) => ({
          fakeid: item.fakeid,
          nickname: item.nickname,
          alias: item.alias,
          round_head_img: item.round_head_img,
          service_type: item.service_type,
        })),
      };
    } catch (error) {
      console.error('[WeChatAuth] searchBiz failed:', error);
      throw error;
    }
  }

  /**
   * 获取 Token
   */
  getToken(): string {
    return this.token;
  }

  /**
   * 获取请求头
   */
  getHeaders(): Record<string, string> {
    return {
      Cookie: this.cookie,
      'User-Agent': this.userAgent,
    };
  }

  /**
   * 获取当前 User-Agent
   */
  getUserAgent(): string {
    return this.userAgent;
  }
}

// 单例导出
export const wechatAuth = new WeChatAuth();
