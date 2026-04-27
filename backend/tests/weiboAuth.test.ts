import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllStatus: vi.fn(),
  hasActiveProfile: vi.fn(),
  getMeta: vi.fn(),
}));

vi.mock('../src/services/auth/credentialStore.js', () => ({
  credentialStore: {
    getAllStatus: mocks.getAllStatus,
  },
}));

vi.mock('../src/services/weiboProfileStore.js', () => ({
  weiboProfileStore: {
    hasActiveProfile: mocks.hasActiveProfile,
    getMeta: mocks.getMeta,
  },
}));

describe('weibo auth status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getAllStatus.mockResolvedValue([
      {
        platform: 'weibo',
        hasValue: true,
        verifiedAt: new Date().toISOString(),
      },
    ]);
    mocks.hasActiveProfile.mockReturnValue(false);
    mocks.getMeta.mockReturnValue(null);
  });

  it('marks weibo invalid when cookie exists but no reusable profile is available', async () => {
    const { getWeiboStatus } = await import('../src/services/auth/platforms/weiboAuth.js');
    const status = await getWeiboStatus();

    expect(status.status).toBe('invalid');
    expect(status.reconnectRecommended).toBe(true);
    expect(status.warningMessage).toMatch(/没有可复用的浏览器登录态/);
  });
});
