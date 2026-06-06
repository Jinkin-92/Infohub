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
   * 构建微信公众账号 RSS URL（通过传送门）
   * @param account 公众号名称（去掉 weixin 后的部分）
   */
  buildWechatUrl(account: string): string {
    return `${this.baseUrl}/wechat/csm/${account}`;
  }

  /**
   * 构建微博用户 RSS URL
   * @param uid 微博用户 UID
   */
  buildWeiboUrl(uid: string): string {
    return `${this.baseUrl}/weibo/user/${uid}`;
  }

  /**
   * 构建小红书用户 RSS URL
   * @param userId 小红书用户 ID
   */
  buildXiaohongshuUrl(userId: string): string {
    return `${this.baseUrl}/xiaohongshu/user/profile/${userId}`;
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
