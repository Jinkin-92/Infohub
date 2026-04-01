import { RSSHubAdapter } from './rsshubAdapter.js';
import type { DetectionResult } from '../types/index.js';
import { BadRequestError } from '../middleware/error.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class URLDetector {
  private rsshubAdapter: RSSHubAdapter;

  constructor(rsshubAdapter?: RSSHubAdapter) {
    this.rsshubAdapter = rsshubAdapter || new RSSHubAdapter();
  }

  async detect(inputUrl: string): Promise<DetectionResult> {
    this.validateUrl(inputUrl);

    // 检测 we-mp-rss 微信公众号 RSS 服务
    // 格式: http://localhost:8001/feed/MP_WXS_xxx.rss
    if (/\/feed\/MP_WXS_/.test(inputUrl)) {
      const feedMatch = inputUrl.match(/\/feed\/([^\/\?]+)/);
      const feedId = feedMatch?.[1] ?? '';

      // 尝试获取 RSS 标题作为公众号名称
      try {
        const title = await this.fetchRssTitle(inputUrl);
        if (title) {
          return {
            platform: 'wechat',
            platformId: feedId,
            rssUrl: inputUrl,
            displayName: title,
          };
        }
      } catch {
        // 忽略获取标题失败，使用默认名称
      }

      return {
        platform: 'wechat',
        platformId: feedId,
        rssUrl: inputUrl,
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
      return this.detectWechat(url);
    }

    // 微博用户页面
    if (host === 'weibo.com' || host === 'weibo.cn') {
      return this.detectWeibo(url);
    }

    if (host === 'youtube.com' || host === 'youtu.be') {
      return this.detectYouTube(url);
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

  private detectWechat(url: URL): DetectionResult {
    const path = url.pathname;

    // 文章链接格式：/s/xxxxxxxx
    if (path.startsWith('/s/')) {
      const biz = url.searchParams.get('__biz') || '';
      const mid = url.searchParams.get('mid') || '';

      // 尝试从 meta 标签提取公众号名称（需要在页面中获取）
      // 这里用 biz 作为 platformId
      return {
        platform: 'wechat',
        platformId: biz || mid,
        rssUrl: this.rsshubAdapter.buildWechatUrl(biz || mid),
        displayName: '微信文章',
      };
    }

    // 公众号主页格式：/profile/xxxx
    if (path.startsWith('/profile/')) {
      const biz = path.split('/profile/')[1]?.split('/')[0] || '';
      return {
        platform: 'wechat',
        platformId: biz,
        rssUrl: this.rsshubAdapter.buildWechatUrl(biz),
        displayName: `WeChat · ${biz.slice(0, 8)}...`,
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

  private detectWeibo(url: URL): DetectionResult {
    const path = url.pathname;

    // 微博个人主页格式：/u/1234567890 或 /1234567890
    const uMatch = path.match(/^\/u\/(\d+)/);
    if (uMatch) {
      return {
        platform: 'weibo',
        platformId: uMatch[1],
        rssUrl: this.rsshubAdapter.buildWeiboUrl(uMatch[1]),
        displayName: `Weibo · UID ${uMatch[1]}`,
      };
    }

    // 纯数字 ID：/1234567890
    const idMatch = path.match(/^\/(\d{8,})/);
    if (idMatch) {
      return {
        platform: 'weibo',
        platformId: idMatch[1],
        rssUrl: this.rsshubAdapter.buildWeiboUrl(idMatch[1]),
        displayName: `Weibo · UID ${idMatch[1]}`,
      };
    }

    // 短用户名格式：/username
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      const username = segments[0];
      return {
        platform: 'weibo',
        platformId: username,
        rssUrl: this.rsshubAdapter.buildWeiboUrl(username),
        displayName: `Weibo · @${username}`,
      };
    }

    throw new BadRequestError('Could not extract Weibo user id');
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

  private async fetchRssTitle(rssUrl: string): Promise<string | null> {
    try {
      const response = await fetch(rssUrl, {
        headers: {
          accept: 'application/rss+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return null;
      }

      const xml = await response.text();
      const titleMatch = xml.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/i);
      return titleMatch?.[1] ?? null;
    } catch {
      return null;
    }
  }
}

export const urlDetector = new URLDetector();
