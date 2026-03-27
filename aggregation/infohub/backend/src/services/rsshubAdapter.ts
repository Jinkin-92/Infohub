import { env } from '../config/env.js';

/**
 * RSSHub适配器
 * 封装RSSHub URL格式，隔离直接依赖（工程审查要求）
 */
export class RSSHubAdapter {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || env.RSSHUB_URL;
  }

  /**
   * 构建知乎RSS URL
   */
  buildZhihuUrl(userId: string): string {
    return `${this.baseUrl}/zhihu/people/activities/${userId}`;
  }

  /**
   * 构建X(Twitter) RSS URL
   */
  buildTwitterUrl(username: string): string {
    return `${this.baseUrl}/twitter/user/${username}`;
  }

  /**
   * 构建B站RSS URL
   */
  buildBilibiliUrl(uid: string): string {
    return `${this.baseUrl}/bilibili/user/video/${uid}`;
  }

  /**
   * 构建YouTube RSS URL（原生，不经过RSSHub）
   */
  buildYouTubeUrl(channelId: string): string {
    // YouTube原生RSS，不经过RSSHub
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  }

  /**
   * 构建通用RSS URL（自定义源）
   */
  buildCustomUrl(rssUrl: string): string {
    return rssUrl;
  }

  /**
   * 检查RSSHub健康状态
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return {
        healthy: response.status === 200,
        latency: Date.now() - start
      };
    } catch {
      return {
        healthy: false,
        latency: Date.now() - start
      };
    }
  }
}

// 默认实例
export const rsshubAdapter = new RSSHubAdapter();
