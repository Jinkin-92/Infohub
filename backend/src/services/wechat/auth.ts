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

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
];

export class WeChatAuth {
  private cookie = '';
  private token = '';
  private userAgent = DEFAULT_USER_AGENTS[0];
  private loaded = false;
  private loading: Promise<void> | null = null;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.loadFromSettings();
    await this.loading;
    this.loaded = true;
  }

  private async loadFromSettings(): Promise<void> {
    try {
      const settings = await sql.get<{
        cookie: string | null;
        token: string | null;
        user_agent: string | null;
      }>('SELECT cookie, token, user_agent FROM wechat_settings WHERE id = 1');

      if (!settings) {
        return;
      }

      this.cookie = settings.cookie || '';
      this.token = settings.token || '';
      this.userAgent = settings.user_agent || DEFAULT_USER_AGENTS[0];
    } catch (error) {
      console.error('[WeChatAuth] Failed to load settings:', error);
    }
  }

  async saveToSettings(credentials: Partial<WeChatCredentials>): Promise<void> {
    await this.ensureLoaded();

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

    updates.push("updated_at = datetime('now')");
    values.push(1);

    await sql.execute(
      `UPDATE wechat_settings SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (credentials.cookie !== undefined) {
      this.cookie = credentials.cookie;
    }

    if (credentials.token !== undefined) {
      this.token = credentials.token;
    }

    if (credentials.userAgent !== undefined) {
      this.userAgent = credentials.userAgent;
    }
  }

  async isConfigured(): Promise<boolean> {
    await this.ensureLoaded();
    return Boolean(this.cookie && this.token);
  }

  async getStatus(): Promise<{
    configured: boolean;
    cookieValid: boolean;
    tokenValid: boolean;
  }> {
    await this.ensureLoaded();
    const configured = await this.isConfigured();
    const verified = configured ? await this.verifyCredentials() : false;

    return {
      configured,
      cookieValid: verified,
      tokenValid: verified,
    };
  }

  async verifyCredentials(): Promise<boolean> {
    await this.ensureLoaded();
    if (!this.cookie || !this.token) {
      return false;
    }

    try {
      const url = new URL('https://mp.weixin.qq.com/cgi-bin/searchbiz');
      url.searchParams.set('action', 'search_biz');
      url.searchParams.set('begin', '0');
      url.searchParams.set('count', '1');
      url.searchParams.set('query', '腾讯');
      url.searchParams.set('token', this.token);
      url.searchParams.set('lang', 'zh_CN');
      url.searchParams.set('f', 'json');
      url.searchParams.set('ajax', '1');

      const response = await fetch(url, {
        headers: {
          Cookie: this.cookie,
          'User-Agent': this.userAgent,
        },
      });

      const text = await response.text();
      if (!text || text.includes('<!DOCTYPE html>')) {
        return false;
      }

      const payload = JSON.parse(text) as {
        base_resp?: {
          ret?: number;
        };
      };

      return payload.base_resp?.ret === 0;
    } catch (error) {
      console.error('[WeChatAuth] Verify failed:', error);
      return false;
    }
  }

  async searchBiz(query: string, limit = 5): Promise<SearchResult> {
    await this.ensureLoaded();
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

  async getToken(): Promise<string> {
    await this.ensureLoaded();
    return this.token;
  }

  async getHeaders(): Promise<Record<string, string>> {
    await this.ensureLoaded();
    return {
      Cookie: this.cookie,
      'User-Agent': this.userAgent,
    };
  }

  getUserAgent(): string {
    return this.userAgent;
  }
}

export const wechatAuth = new WeChatAuth();
