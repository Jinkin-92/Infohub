/**
 * 平台采集接口抽象
 * Phase 5: 将 if/else 分发改造为注册表模式
 *
 * 使用方式:
 *   1. 为新平台实现 ContentSource 接口
 *   2. 在平台注册表中注册
 *   3. Collector 自动通过注册表分发
 */

export interface ContentItem {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  author?: string;
  content?: string;
  thumbnail?: string;
  platform: string;
}

export interface CollectionResult {
  sourceId: number;
  success: boolean;
  itemCount: number;
  skipped?: boolean;
  error?: string;
  items?: import('../types/index.js').RSSItem[];
}

export interface ContentSourceOptions {
  force?: boolean;
  limit?: number;
  since?: Date;
}

/**
 * 平台采集源接口
 * 所有平台采集器都应实现此接口
 */
export interface ContentSource {
  /** 平台标识，如 'bilibili' | 'weibo' | 'zhihu' */
  readonly platform: string;

  /**
   * 执行采集
   * @param source 数据库中的订阅源记录
   * @param options 采集选项
   */
  collect(source: {
    id: number;
    name: string;
    input_url: string;
    rss_url: string;
    platform_id: string | null;
  }, options?: ContentSourceOptions): Promise<CollectionResult>;

  /**
   * 可选：平台健康检查（验证凭证/连接是否有效）
   */
  healthCheck?(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * 可选：验证给定凭证是否可用于此平台
   */
  validateCredential?(credential: string): Promise<boolean>;
}
