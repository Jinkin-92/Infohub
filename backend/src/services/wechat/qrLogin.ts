import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../../db/client.js';

const QR_CODE_DIR = 'static';
const QR_CODE_PATH = join(QR_CODE_DIR, 'wx_qrcode.png');
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface QrCodeResult {
  uuid: string;
  qrCodePath: string;
  expiresAt: number;
}

interface LoginStatus {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
  message?: string;
}

interface LoginSuccessData {
  token: string;
  cookie: string;
  cookiesDict: Record<string, string>;
}

export class WeChatQrLogin {
  private baseUrl = 'https://mp.weixin.qq.com';
  private sessionCookies: Record<string, string> = {};
  private token = '';
  private uuid = '';
  private qrCodePath = QR_CODE_PATH;

  constructor() {
    if (!existsSync(QR_CODE_DIR)) {
      mkdirSync(QR_CODE_DIR, { recursive: true });
    }
  }

  async getQrCode(): Promise<QrCodeResult> {
    this.sessionCookies = {};
    this.token = '';
    this.uuid = '';

    await fetch(this.baseUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: this.baseUrl,
      },
    });

    const uuidResponse = await fetch(`${this.baseUrl}/cgi-bin/bizlogin?action=startlogin`, {
      method: 'POST',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
        Referer: `${this.baseUrl}/`,
      },
      body: new URLSearchParams({
        fingerprint: randomUUID().replace(/-/g, ''),
        token: '',
        lang: 'zh_CN',
        f: 'json',
        ajax: '1',
        redirect_url: '',
        login_type: '3',
      }),
    });

    const uuidResponseText = await uuidResponse.text();
    console.log('[WeChatQrLogin] startlogin response:', uuidResponseText);

    const startCookies = this.readSetCookies(uuidResponse);
    this.mergeCookies(startCookies);
    const uuidCookie = startCookies.find((line) => line.startsWith('uuid='));
    const uuidMatch = uuidCookie?.match(/uuid=([^;]+)/);

    if (!uuidMatch) {
      throw new Error('Failed to get UUID from startlogin response');
    }

    this.uuid = uuidMatch[1];
    console.log('[WeChatQrLogin] Got UUID:', this.uuid);

    const timestamp = Date.now();
    const qrResponse = await fetch(
      `${this.baseUrl}/cgi-bin/scanloginqrcode?action=getqrcode&uuid=${this.uuid}`,
      {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'image/webp,image/apng,image/svg+xml,image/*;q=0.8',
          Referer: `${this.baseUrl}/`,
          Cookie: this.formatCookies(this.sessionCookies),
        },
      }
    );

    const contentType = qrResponse.headers.get('content-type') || '';
    if (!contentType.includes('image')) {
      throw new Error(`Failed to get QR code image, content-type: ${contentType}`);
    }

    const buffer = await qrResponse.arrayBuffer();
    writeFileSync(this.qrCodePath, Buffer.from(buffer));
    console.log('[WeChatQrLogin] QR code saved to:', this.qrCodePath);

    return {
      uuid: this.uuid,
      qrCodePath: `/static/wx_qrcode.png?t=${timestamp}`,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  async checkLoginStatus(uuid: string): Promise<LoginStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/cgi-bin/scanloginqrcode?action=ask`, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'application/json, text/plain, */*',
          Referer: `${this.baseUrl}/`,
          Cookie: `uuid=${uuid}`,
        },
      });

      const text = await response.text();
      console.log('[WeChatQrLogin] Login status response:', text);

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        if (text.includes('"status":1') || text.includes('"status":3')) {
          return { status: 'confirmed' };
        }
        return { status: 'waiting' };
      }

      const status = data.status as number | undefined;
      switch (status) {
        case 0:
          return { status: 'waiting' };
        case 1:
        case 3:
          return { status: 'confirmed' };
        case 2:
        case 4:
          return { status: 'scanned' };
        default:
          if (text.includes('invalid session')) {
            return { status: 'error', message: 'Session invalid' };
          }
          return { status: 'waiting' };
      }
    } catch (error) {
      return { status: 'error', message: String(error) };
    }
  }

  async handleLoginSuccess(): Promise<LoginSuccessData | null> {
    try {
      const loginResponse = await fetch(`${this.baseUrl}/cgi-bin/bizlogin?action=login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
          Referer: `${this.baseUrl}/`,
          Cookie: this.formatCookies(this.sessionCookies),
        },
        body: new URLSearchParams({
          userlang: 'zh_CN',
          redirect_url: '',
          cookie_forbidden: '0',
          cookie_cleaned: '0',
          plugin_used: '0',
          login_type: '3',
          fingerprint: randomUUID().replace(/-/g, ''),
          token: '',
          lang: 'zh_CN',
          f: 'json',
          ajax: '1',
        }),
      });

      const loginText = await loginResponse.text();
      console.log('[WeChatQrLogin] login response:', loginText);

      this.mergeCookies(this.readSetCookies(loginResponse));

      let redirectUrl: string | undefined;
      try {
        const payload = JSON.parse(loginText) as { redirect_url?: string; redirectUrl?: string };
        redirectUrl = payload.redirect_url || payload.redirectUrl;
      } catch {
        redirectUrl = undefined;
      }

      if (!redirectUrl) {
        redirectUrl = loginResponse.headers.get('location') || undefined;
      }

      if (redirectUrl) {
        await this.followRedirectChain(redirectUrl);
      }

      const tokenMatch = [
        loginText.match(/token=([^&\s"']+)/),
        redirectUrl?.match(/token=([^&\s"']+)/),
      ].find(Boolean);

      if (tokenMatch) {
        this.token = tokenMatch[1];
      }

      if (!this.token || Object.keys(this.sessionCookies).length === 0) {
        console.error('[WeChatQrLogin] Failed to extract a valid token/cookie set');
        return null;
      }

      console.log('[WeChatQrLogin] Login successful, token:', this.token);

      return {
        token: this.token,
        cookie: this.formatCookies(this.sessionCookies),
        cookiesDict: this.sessionCookies,
      };
    } catch (error) {
      console.error('[WeChatQrLogin] handleLoginSuccess error:', error);
      return null;
    }
  }

  async saveCredentials(cookie: string, token: string): Promise<void> {
    await sql.execute(
      `UPDATE wechat_settings
       SET cookie = ?, token = ?, user_agent = ?, updated_at = datetime('now')
       WHERE id = 1`,
      [cookie, token, DEFAULT_USER_AGENT]
    );
    console.log('[WeChatQrLogin] Credentials saved to database');
  }

  private readSetCookies(response: Response): string[] {
    const headersWithSetCookie = response.headers as Headers & {
      getSetCookie?: () => string[];
    };

    if (typeof headersWithSetCookie.getSetCookie === 'function') {
      return headersWithSetCookie.getSetCookie();
    }

    const merged = response.headers.get('set-cookie');
    if (!merged) {
      return [];
    }

    return merged.split(/,(?=[^;,=\s]+=[^;,]+)/g);
  }

  private parseCookies(lines: string[]): Record<string, string> {
    const cookies: Record<string, string> = {};

    for (const line of lines) {
      const [nameValue] = line.split(';');
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex <= 0) {
        continue;
      }

      const name = nameValue.substring(0, eqIndex).trim();
      const value = nameValue.substring(eqIndex + 1).trim();
      cookies[name] = value;
    }

    return cookies;
  }

  private mergeCookies(lines: string[]): void {
    this.sessionCookies = {
      ...this.sessionCookies,
      ...this.parseCookies(lines),
    };
  }

  private formatCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  private async followRedirectChain(initialUrl: string, maxHops = 4): Promise<void> {
    let currentUrl = initialUrl.startsWith('http')
      ? initialUrl
      : new URL(initialUrl, this.baseUrl).toString();

    for (let hop = 0; hop < maxHops; hop += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: `${this.baseUrl}/`,
          Cookie: this.formatCookies(this.sessionCookies),
        },
      });

      this.mergeCookies(this.readSetCookies(response));

      const tokenFromUrl = currentUrl.match(/token=([^&\s"']+)/);
      if (tokenFromUrl) {
        this.token = tokenFromUrl[1];
      }

      const nextLocation = response.headers.get('location');
      if (!nextLocation || response.status < 300 || response.status >= 400) {
        const body = await response.text().catch(() => '');
        const tokenFromBody = body.match(/token=([^&\s"']+)/);
        if (tokenFromBody) {
          this.token = tokenFromBody[1];
        }
        return;
      }

      currentUrl = nextLocation.startsWith('http')
        ? nextLocation
        : new URL(nextLocation, currentUrl).toString();
    }
  }
}

export const weChatQrLogin = new WeChatQrLogin();
