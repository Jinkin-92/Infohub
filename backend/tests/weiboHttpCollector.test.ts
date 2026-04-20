import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  credentialGet: vi.fn(),
  updateSource: vi.fn(),
  markHealthyUse: vi.fn(),
  markChecked: vi.fn(),
  hasActiveProfile: vi.fn(),
  browserVerifyConnection: vi.fn(),
}));

vi.mock('../src/services/auth/credentialStore.js', () => ({
  credentialStore: {
    get: mocks.credentialGet,
  },
}));

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    update: mocks.updateSource,
  },
}));

vi.mock('../src/services/weiboProfileStore.js', () => ({
  weiboProfileStore: {
    markHealthyUse: mocks.markHealthyUse,
    markChecked: mocks.markChecked,
    hasActiveProfile: mocks.hasActiveProfile,
  },
}));

vi.mock('../src/services/weiboBrowserCollector.js', async () => {
  const actual = await vi.importActual('../src/services/weiboBrowserCollector.js');
  return {
    ...actual,
    weiboBrowserCollector: {
      collectItems: vi.fn(),
      verifyConnection: mocks.browserVerifyConnection,
    },
  };
});

describe('weibo http collector', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.credentialGet.mockResolvedValue({
      platform: 'weibo',
      credentialType: 'cookie',
      value: 'SUB=abc; SUBP=def',
      status: 'active',
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.updateSource.mockResolvedValue(undefined);
    mocks.hasActiveProfile.mockReturnValue(false);
    mocks.browserVerifyConnection.mockResolvedValue({
      success: false,
      message: 'Weibo mobile api returned no post cards',
      resolvedUid: '1788911247',
    });
    global.fetch = vi.fn();
  });

  it('collects items through the http collector and updates the source name', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            data: { user: { screen_name: '谷大白话' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            data: {
              cards: [
                {
                  card_type: 9,
                  scheme: 'https://m.weibo.cn/status/1',
                  mblog: {
                    created_at: '2026-04-14 10:00',
                    text: '测试内容',
                    id: '1',
                    bid: '1',
                    reposts_count: 1,
                    comments_count: 2,
                    attitudes_count: 3,
                    user: {
                      screen_name: '谷大白话',
                    },
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const { weiboHttpCollector } = await import('../src/services/weiboHttpCollector.js');
    const items = await weiboHttpCollector.collectItems({
      id: 35,
      name: '微博源',
      platform: 'weibo',
      input_url: 'https://weibo.com/1788911247',
      rss_url: '',
      platform_id: '1788911247',
    } as never);

    expect(items).toHaveLength(1);
    expect(items[0]?.author).toBe('谷大白话');
    expect(items[0]?.title).toContain('谷大白话');
    expect(mocks.updateSource).toHaveBeenCalledWith(35, { name: '谷大白话' });
    expect(mocks.markHealthyUse).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when cookie is missing', async () => {
    mocks.credentialGet.mockResolvedValue(null);
    const { weiboHttpCollector } = await import('../src/services/weiboHttpCollector.js');

    await expect(
      weiboHttpCollector.collectItems({
        id: 35,
        name: '微博源',
        platform: 'weibo',
        input_url: 'https://weibo.com/1788911247',
        rss_url: '',
        platform_id: '1788911247',
      } as never)
    ).rejects.toThrow(/cookie is missing/i);
  });

  it('reports verify failure when timeline api returns no cards', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            data: { user: { screen_name: '谷大白话' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            data: { cards: [] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const { weiboHttpCollector } = await import('../src/services/weiboHttpCollector.js');
    const result = await weiboHttpCollector.verifyConnection('https://weibo.com/1788911247');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no post cards/i);
    expect(mocks.browserVerifyConnection).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when timeline api returns non-200', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            data: { user: { screen_name: '谷大白话' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(new Response('blocked', { status: 503 }));

    const { weiboHttpCollector } = await import('../src/services/weiboHttpCollector.js');
    await expect(
      weiboHttpCollector.collectItems({
        id: 35,
        name: '微博源',
        platform: 'weibo',
        input_url: 'https://weibo.com/1788911247',
        rss_url: '',
        platform_id: '1788911247',
      } as never)
    ).rejects.toThrow(/returned 503/i);
  });
});
