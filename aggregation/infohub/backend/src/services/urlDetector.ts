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
}

export const urlDetector = new URLDetector();
