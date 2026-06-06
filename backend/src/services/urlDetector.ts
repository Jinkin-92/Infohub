import { RSSHubAdapter } from './rsshubAdapter.js';
import type { DetectionResult } from '../types/index.js';
import { BadRequestError } from '../middleware/error.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wechatAuth } from './wechat/index.js';

const execFileAsync = promisify(execFile);

export class URLDetector {
  private rsshubAdapter: RSSHubAdapter;

  constructor(rsshubAdapter?: RSSHubAdapter) {
    this.rsshubAdapter = rsshubAdapter || new RSSHubAdapter();
  }

  async detect(inputUrl: string): Promise<DetectionResult> {
    this.validateUrl(inputUrl);

    if (/\/feed\/MP_WXS_/.test(inputUrl)) {
      const feedMatch = inputUrl.match(/\/feed\/([^\/\?]+)/);
      const feedId = feedMatch?.[1] ?? '';
      const fakeId = this.normalizeWeChatFakeId(feedId);
      if (!fakeId) {
        throw new BadRequestError('Could not extract WeChat fakeid from feed URL');
      }

      return {
        platform: 'wechat',
        platformId: fakeId,
        rssUrl: this.buildLocalWechatMarker(fakeId),
        displayName: '微信公众号',
      };
    }

    let url: URL;
    try {
      url = new URL(inputUrl);
    } catch {
      throw new BadRequestError('Invalid URL format');
    }

    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname;

    if (host === 'zhihu.com' && path.startsWith('/people/')) {
      const id = this.extractPathSegment(path, '/people/');
      if (!id) {
        throw new BadRequestError('Could not extract Zhihu user id');
      }

      return {
        platform: 'zhihu',
        platformId: id,
        rssUrl: this.rsshubAdapter.buildZhihuUrl(id),
        displayName: `Zhihu · ${id}`,
      };
    }

    if (host === 'x.com' || host === 'twitter.com') {
      const id = path.split('/').filter(Boolean)[0] ?? '';
      if (!id) {
        throw new BadRequestError('Could not extract X username');
      }

      return {
        platform: 'x',
        platformId: id,
        rssUrl: this.rsshubAdapter.buildTwitterUrl(id),
        displayName: `X · @${id}`,
      };
    }

    if (host === 'space.bilibili.com') {
      const uid = path.split('/').filter(Boolean)[0] ?? '';
      if (!uid || !/^\d+$/.test(uid)) {
        throw new BadRequestError('Could not extract Bilibili uid');
      }

      return {
        platform: 'bilibili',
        platformId: uid,
        rssUrl: this.rsshubAdapter.buildBilibiliUrl(uid),
        displayName: `Bilibili · UID ${uid}`,
      };
    }

    // 微信公众号文章或主页
    if (host === 'mp.weixin.qq.com') {
      return await this.detectWechat(url);
    }

    // 微博用户页面
    if (host === 'weibo.com' || host === 'weibo.cn') {
      return await this.detectWeibo(url);
    }

    if (host === 'youtube.com' || host === 'youtu.be') {
      return await this.detectYouTube(url);
    }

    // 小红书用户页面
    if (host === 'xiaohongshu.com') {
      return this.detectXiaohongshu(url);
    }

    if (path.endsWith('.xml') || path.includes('feed') || path.includes('rss')) {
      return {
        platform: 'custom',
        platformId: '',
        rssUrl: inputUrl,
        displayName: url.hostname,
      };
    }

    return {
      platform: 'custom',
      platformId: '',
      rssUrl: inputUrl,
      displayName: url.hostname,
    };
  }

  /**
   * 检测微信公众号
   * 支持文章链接和主页链接，自动获取公众号名称
   */
  private async detectWechat(url: URL): Promise<DetectionResult> {
    const path = url.pathname;

    // 文章链接格式：/s/xxxxxxxx
    if (path.startsWith('/s/')) {
      const bizFromUrl = url.searchParams.get('__biz') || '';

      // 尝试从页面获取公众号名称和 biz
      let displayName = '微信文章';
      let biz = bizFromUrl;
      let resolvedBiz = false;

      try {
        const pageInfo = await this.fetchWechatPageInfo(url.toString());

        // 如果 URL 没有 biz，尝试从页面提取
        if (!biz && pageInfo.biz) {
          biz = pageInfo.biz;
          resolvedBiz = true;
        }

        // 通过 WeChat API 搜索验证公众号名称
        if (pageInfo.nickname) {
          try {
            const searchResult = await wechatAuth.searchBiz(pageInfo.nickname, 5);
            if (searchResult.total > 0) {
              // 优先精确匹配账号名或别名
              const matchedAccount = searchResult.accounts.find(
                (acc) => acc.nickname === pageInfo.nickname || acc.alias === pageInfo.nickname
              ) || searchResult.accounts[0];

              // 页面未解析出 biz 时，才回退到搜索结果
              if (!biz) {
                biz = matchedAccount.fakeid;
                resolvedBiz = true;
              }

              // 使用搜索结果的账号名（这是公众号真实名称）
              displayName = matchedAccount.nickname;
            } else {
              // 搜索无结果，使用页面昵称
              displayName = pageInfo.nickname;
            }
          } catch {
            // 搜索失败，使用页面昵称
            displayName = pageInfo.nickname;
          }
        }
      } catch {
        // 忽略获取名称失败
      }

      if (resolvedBiz && biz) {
        const fakeId = this.normalizeWeChatFakeId(biz);
        if (!fakeId) {
          throw new BadRequestError('无法解析微信公众号 fakeid，请手动添加 feed URL');
        }
        return {
          platform: 'wechat',
          platformId: fakeId,
          rssUrl: this.buildLocalWechatMarker(fakeId),
          displayName,
        };
      }

      // resolvedBiz=false 时不要静默创建 /wechat/csm/ 坏源
      if (!biz || biz.length === 0) {
        throw new BadRequestError('无法解析微信公众号，请检查 URL 是否为有效微信文章链接');
      }
      // biz 存在但未经 searchBiz 验证，只允许用户粘贴现成 RSS URL
      throw new BadRequestError('无法自动解析微信公众号，请手动添加 feed URL');
    }

    // 公众号主页格式：/profile/xxxx
    if (path.startsWith('/profile/')) {
      const biz = path.split('/profile/')[1]?.split('/')[0] || '';
      const fakeId = this.normalizeWeChatFakeId(biz);
      if (!fakeId) {
        throw new BadRequestError('Could not extract WeChat fakeid');
      }
      return {
        platform: 'wechat',
        platformId: fakeId,
        rssUrl: this.buildLocalWechatMarker(fakeId),
        displayName: `微信公众号 ${fakeId.slice(0, 8)}...`,
      };
    }

    // 通用微信链接，使用完整 URL 作为 RSS
    return {
      platform: 'wechat',
      platformId: '',
      rssUrl: url.toString(),
      displayName: 'WeChat',
    };
  }

  /**
   * 从微信文章页面提取公众号信息
   */
  private async fetchWechatPageInfo(articleUrl: string): Promise<{ biz: string; nickname: string }> {
    const response = await fetch(articleUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch WeChat page: ${response.status}`);
    }

    const html = await response.text();

    // 提取 biz - 多种模式
    let biz = '';
    const bizPatterns = [
      /var biz\s*=\s*["']([^"']+)["']/,
      /"biz"\s*:\s*["']([^"']+)["']/,
      /biz\s*:\s*["']([^"']+)["']/,
    ];
    for (const pattern of bizPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        biz = match[1];
        break;
      }
    }

    // 提取公众号名称 - 多种来源
    let nickname = '';
    const nicknamePatterns = [
      // og:article:author meta tag
      /<meta[^>]+property=["']og:article:author["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:article:author["']/i,
      // profileBt span
      /<span[^>]+id=["']profileBt["'][^>]*>([^<]+)<\/span>/i,
      // account_name in script
      /account_name\s*[:=]\s*["']([^"']+)["']/i,
      // biz_nickname
      /biz_nickname\s*=\s*["']([^"']+)["']/,
    ];
    for (const pattern of nicknamePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        nickname = match[1].trim();
        break;
      }
    }

    return { biz, nickname };
  }

  /**
   * 检测微博用户
   * 支持 UID 和账户名称
   */
  private async detectWeibo(url: URL): Promise<DetectionResult> {
    const path = url.pathname;

    // 微博个人主页格式：/u/1234567890 或 /1234567890
    const uMatch = path.match(/^\/u\/(\d+)/);
    if (uMatch) {
      return {
        platform: 'weibo',
        platformId: uMatch[1],
        rssUrl: this.rsshubAdapter.buildWeiboUrl(uMatch[1]),
        displayName: `微博 · UID ${uMatch[1]}`,
      };
    }

    // 纯数字 ID：/1234567890
    const idMatch = path.match(/^\/(\d{8,})/);
    if (idMatch) {
      return {
        platform: 'weibo',
        platformId: idMatch[1],
        rssUrl: this.rsshubAdapter.buildWeiboUrl(idMatch[1]),
        displayName: `微博 · UID ${idMatch[1]}`,
      };
    }

    // 短用户名格式：/username - 尝试解析为 UID
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      const username = segments[0];

      // 尝试获取用户信息来显示名称
      let displayName = `微博 · @${username}`;
      try {
        const userInfo = await this.resolveWeiboUsername(username);
        if (userInfo.uid) {
          displayName = `微博 · ${userInfo.name || username}`;
          return {
            platform: 'weibo',
            platformId: userInfo.uid,
            rssUrl: this.rsshubAdapter.buildWeiboUrl(userInfo.uid),
            displayName,
          };
        }
      } catch {
        // 忽略解析失败
      }

      return {
        platform: 'weibo',
        platformId: username,
        rssUrl: this.rsshubAdapter.buildWeiboUrl(username),
        displayName,
      };
    }

    throw new BadRequestError('Could not extract Weibo user id');
  }

  /**
   * 解析微博用户名获取 UID
   */
  private async resolveWeiboUsername(username: string): Promise<{ uid: string; name: string }> {
    // 通过微博搜索页面解析 UID
    const searchUrl = `https://weibo.com/u/${username}/profile?is_all=1`;

    const response = await fetch(searchUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Weibo fetch failed: ${response.status}`);
    }

    const html = await response.text();

    // 尝试从页面提取 UID
    // 微博页面通常有 $render_data 配置
    const uidMatch = html.match(/"id"\s*:\s*"(\d+)"/) ||
                     html.match(/\$\.data\s*=\s*\{[^}]*"id"\s*:\s*(\d+)/);
    const uid = uidMatch?.[1] || '';

    // 提取用户名
    const nameMatch = html.match(/"screen_name"\s*:\s*"([^"]+)"/) ||
                      html.match(/nick\s*=\s*["']([^"']+)["']/);
    const name = nameMatch?.[1] || username;

    return { uid, name };
  }

  private async detectYouTube(url: URL): Promise<DetectionResult> {
    const path = url.pathname;

    if (path.startsWith('/@')) {
      const handle = path.split('/').filter(Boolean)[0] ?? '';
      if (!handle) {
        throw new BadRequestError('Could not extract YouTube handle');
      }

      const channelId = await this.resolveYouTubeChannelId(handle);
      return {
        platform: 'youtube',
        platformId: channelId,
        rssUrl: this.rsshubAdapter.buildYouTubeUrl(channelId),
        displayName: `YouTube · ${handle}`,
      };
    }

    if (path.startsWith('/channel/')) {
      const channelId = this.extractPathSegment(path, '/channel/');
      if (!channelId) {
        throw new BadRequestError('Could not extract YouTube channel id');
      }

      return {
        platform: 'youtube',
        platformId: channelId,
        rssUrl: this.rsshubAdapter.buildYouTubeUrl(channelId),
        displayName: `YouTube · ${channelId.slice(0, 10)}...`,
      };
    }

    throw new BadRequestError('Unsupported YouTube URL. Use /@handle or /channel/<id>.');
  }

  /**
   * 检测小红书用户
   * 支持用户主页 URL，如 https://www.xiaohongshu.com/user/profile/xxx
   */
  private detectXiaohongshu(url: URL): DetectionResult {
    const path = url.pathname;

    // 用户主页格式：/user/profile/xxxx
    // 例如：https://www.xiaohongshu.com/user/profile/63b622ab00000000260066bd
    if (path.startsWith('/user/profile/')) {
      const userId = path.split('/user/profile/')[1]?.split('/')[0] || '';
      if (!userId) {
        throw new BadRequestError('Could not extract Xiaohongshu user id');
      }

      return {
        platform: 'xiaohongshu',
        platformId: userId,
        rssUrl: this.rsshubAdapter.buildXiaohongshuUrl(userId),
        displayName: `小红书 · ${userId.slice(0, 8)}...`,
      };
    }

    // 其他小红书链接作为 custom 处理
    return {
      platform: 'custom',
      platformId: '',
      rssUrl: url.toString(),
      displayName: 'Xiaohongshu',
    };
  }

  private async resolveYouTubeChannelId(handle: string): Promise<string> {
    const html = await this.fetchYouTubePageHtml(handle);
    const channelId =
      this.extractYouTubeChannelId(html, /feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/i) ??
      this.extractYouTubeChannelId(html, /youtube\.com\/channel\/(UC[\w-]{22})/i) ??
      this.extractYouTubeChannelId(html, /"channelId":"(UC[\w-]{22})"/i);

    if (!channelId) {
      throw new BadRequestError('Could not resolve YouTube channel id from handle');
    }

    return channelId;
  }

  private async fetchYouTubePageHtml(handle: string): Promise<string> {
    const url = `https://www.youtube.com/${handle}`;

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new BadRequestError(`Could not open YouTube channel page (${response.status})`);
      }

      return await response.text();
    } catch (error) {
      if (!(error instanceof Error) || !/timed out|fetch failed|UND_ERR/i.test(error.message)) {
        throw error;
      }
    }

    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-L', '--max-time', '20', '-A', 'Mozilla/5.0', url],
        { maxBuffer: 8 * 1024 * 1024 }
      );

      if (!stdout.trim()) {
        throw new BadRequestError('YouTube channel page returned empty content');
      }

      return stdout;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestError(`Could not open YouTube channel page (${message})`);
    }
  }

  private extractYouTubeChannelId(html: string, pattern: RegExp): string | null {
    const match = html.match(pattern);
    return match?.[1] ?? null;
  }

  private validateUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new BadRequestError('URL cannot be empty');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new BadRequestError('URL must start with http:// or https://');
    }
  }

  private extractPathSegment(path: string, prefix: string): string {
    const parts = path.split(prefix);
    if (parts.length < 2) {
      return '';
    }

    return parts[1].split('/')[0];
  }

  private buildLocalWechatMarker(fakeId: string): string {
    return `local://wechat/${fakeId}`;
  }

  private normalizeWeChatFakeId(value: string): string | null {
    const trimmed = value.trim();
    const prefixedMatch = trimmed.match(/^MP_WXS_(\d+)(?:\.rss)?$/i);
    if (prefixedMatch) {
      return prefixedMatch[1];
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      if (/^\d+$/.test(decoded)) {
        return decoded;
      }
    } catch {
      return null;
    }

    return null;
  }
}

export const urlDetector = new URLDetector();
