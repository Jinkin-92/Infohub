import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  updateFetchedAt: vi.fn(),
  updateSuccess: vi.fn(),
  updateError: vi.fn(),
  updateSource: vi.fn(),
  itemUpsert: vi.fn(),
  sqlGet: vi.fn(),
  sqlExecute: vi.fn(),
  weiboCollect: vi.fn(),
  xCollect: vi.fn(),
}));

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    getById: mocks.getById,
    updateFetchedAt: mocks.updateFetchedAt,
    updateSuccess: mocks.updateSuccess,
    updateError: mocks.updateError,
    update: mocks.updateSource,
  },
  itemsQueries: {
    upsert: mocks.itemUpsert,
  },
}));

vi.mock('../src/db/client.js', () => ({
  sql: {
    get: mocks.sqlGet,
    execute: mocks.sqlExecute,
  },
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    RSSHUB_URL: 'http://localhost:1200',
    PORT: 3002,
  },
}));

vi.mock('../src/services/weiboBrowserCollector.js', () => ({
  weiboBrowserCollector: {
    collectItems: mocks.weiboCollect,
  },
}));

vi.mock('../src/services/xBrowserCollector.js', () => ({
  xBrowserCollector: {
    collectItems: mocks.xCollect,
  },
}));

vi.mock('../src/services/bilibiliPublicCollector.js', () => ({
  bilibiliPublicCollector: {
    collectItems: vi.fn(),
  },
}));

vi.mock('../src/services/wechat/index.js', () => ({
  weChatArticleCollector: {
    collectAndStore: vi.fn(),
  },
}));

vi.mock('../src/services/urlDetector.js', () => ({
  urlDetector: {
    detect: vi.fn(),
  },
}));

vi.mock('../src/services/youtubePublicCollector.js', () => ({
  youtubePublicCollector: {
    collectItems: vi.fn(),
  },
}));

vi.mock('../src/services/zhihuSourceName.js', () => ({
  resolveZhihuSourceName: vi.fn(),
}));

describe('collector platform routing', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
    mocks.updateFetchedAt.mockResolvedValue(undefined);
    mocks.updateSuccess.mockResolvedValue(undefined);
    mocks.updateError.mockResolvedValue(undefined);
    mocks.itemUpsert.mockResolvedValue(undefined);
    mocks.sqlGet.mockResolvedValue(null);
    mocks.sqlExecute.mockResolvedValue(undefined);
  });

  it('uses the weibo browser collector for weibo sources', async () => {
    mocks.getById.mockResolvedValue({
      id: 35,
      name: '谷大白话',
      platform: 'weibo',
      input_url: 'https://weibo.com/1788911247?refer_flag=1001030103_',
      rss_url: 'http://localhost:1200/weibo/user/1788911247',
      platform_id: '1788911247',
      fetch_interval_min: 360,
      enabled: true,
      status: 'active',
      error_count: 0,
      last_error: null,
      last_error_at: null,
      last_fetched_at: null,
      last_success_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_public: false,
      public_source_id: null,
    });
    mocks.weiboCollect.mockResolvedValue([
      {
        guid: 'weibo:1',
        title: 'Test post',
        link: 'https://m.weibo.cn/status/1',
        author: '谷大白话',
        description: 'desc',
        contentSnippet: 'desc',
        pubDate: new Date().toISOString(),
        isoDate: new Date().toISOString(),
      },
    ]);

    const { collector } = await import('../src/services/collector.js');
    const result = await collector.collectSource(35, { force: true });

    expect(mocks.weiboCollect).toHaveBeenCalledTimes(1);
    expect(mocks.xCollect).not.toHaveBeenCalled();
    expect(mocks.itemUpsert).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(1);
  });
});
