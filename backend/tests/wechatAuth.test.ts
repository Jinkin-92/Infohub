import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveToSettings: vi.fn(),
  reloadFromSettings: vi.fn(),
  verifyCredentials: vi.fn(),
  getStatus: vi.fn(),
  storeSave: vi.fn(),
  storeDelete: vi.fn(),
  storeUpdateStatus: vi.fn(),
  getQrCode: vi.fn(),
  checkLoginStatus: vi.fn(),
  handleLoginSuccess: vi.fn(),
  getAllSources: vi.fn(),
  collectSource: vi.fn(),
}));

vi.mock('../src/services/wechat/auth.js', () => ({
  WeChatAuth: class {
    saveToSettings = mocks.saveToSettings;
    reloadFromSettings = mocks.reloadFromSettings;
    verifyCredentials = mocks.verifyCredentials;
    getStatus = mocks.getStatus;
  },
  wechatAuth: {
    saveToSettings: mocks.saveToSettings,
    reloadFromSettings: mocks.reloadFromSettings,
    verifyCredentials: mocks.verifyCredentials,
    getStatus: mocks.getStatus,
  },
}));

vi.mock('../src/services/wechat/qrLogin.js', () => ({
  weChatQrLogin: {
    getQrCode: mocks.getQrCode,
    checkLoginStatus: mocks.checkLoginStatus,
    handleLoginSuccess: mocks.handleLoginSuccess,
  },
}));

vi.mock('../src/services/auth/credentialStore.js', () => ({
  credentialStore: {
    get: vi.fn(),
    save: mocks.storeSave,
    delete: mocks.storeDelete,
    updateStatus: mocks.storeUpdateStatus,
  },
}));

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    getAll: mocks.getAllSources,
  },
}));

vi.mock('../src/services/collector.js', () => ({
  collector: {
    collectSource: mocks.collectSource,
  },
}));

describe('wechat auth reconnect flow', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
    mocks.verifyCredentials.mockResolvedValue(true);
    mocks.getStatus.mockResolvedValue({ configured: true, cookieValid: true, tokenValid: true });
    mocks.getAllSources.mockResolvedValue([]);
    mocks.collectSource.mockResolvedValue({ success: true, itemCount: 0 });
  });

  it('persists credentials through the shared save path when QR login confirms', async () => {
    mocks.getQrCode.mockResolvedValue({
      uuid: 'session-1',
      qrCodePath: '/static/wx_qrcode.png',
      expiresAt: Date.now() + 60_000,
    });
    mocks.checkLoginStatus.mockResolvedValue({ status: 'confirmed' });
    mocks.handleLoginSuccess.mockResolvedValue({
      cookie: 'foo=bar',
      token: '123456',
      cookiesDict: { foo: 'bar' },
    });

    const { startWechatSession, getWechatSession } = await import('../src/services/auth/platforms/wechatAuth.js');

    const session = await startWechatSession();
    const updated = await getWechatSession(session.sessionId);

    expect(mocks.saveToSettings).toHaveBeenCalledWith({
      cookie: 'foo=bar',
      token: '123456',
    });
    expect(mocks.reloadFromSettings).toHaveBeenCalled();
    expect(mocks.storeSave).toHaveBeenCalledWith(
      'wechat',
      'cookie',
      'cookie=foo=bar;token=123456'
    );
    expect(updated?.state).toBe('confirmed');
    expect(updated?.cookieConfigured).toBe(true);
  });

  it('starts a background resync for enabled wechat sources after saving credentials', async () => {
    mocks.getAllSources.mockResolvedValue([
      { id: 16, platform: 'wechat', enabled: true },
      { id: 18, platform: 'wechat', enabled: true },
      { id: 80, platform: 'x', enabled: true },
      { id: 25, platform: 'wechat', enabled: false },
    ]);

    const { saveWechatCredential } = await import('../src/services/auth/platforms/wechatAuth.js');

    await saveWechatCredential('foo=bar', '123456');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.collectSource).toHaveBeenCalledTimes(2);
    expect(mocks.collectSource).toHaveBeenNthCalledWith(1, 16, { force: true });
    expect(mocks.collectSource).toHaveBeenNthCalledWith(2, 18, { force: true });
  });

  it('does not report success when QR login credentials fail verification', async () => {
    mocks.getQrCode.mockResolvedValue({
      uuid: 'session-2',
      qrCodePath: '/static/wx_qrcode.png',
      expiresAt: Date.now() + 60_000,
    });
    mocks.checkLoginStatus.mockResolvedValue({ status: 'confirmed' });
    mocks.handleLoginSuccess.mockResolvedValue({
      cookie: 'foo=bar',
      token: '123456',
      cookiesDict: { foo: 'bar' },
    });
    mocks.verifyCredentials.mockResolvedValue(false);

    const { startWechatSession, getWechatSession } = await import('../src/services/auth/platforms/wechatAuth.js');

    const session = await startWechatSession();
    const updated = await getWechatSession(session.sessionId);

    expect(updated?.state).toBe('failed');
    expect(updated?.cookieConfigured).toBe(false);
    expect(updated?.error).toContain('凭证');
    expect(mocks.storeUpdateStatus).toHaveBeenCalledWith('wechat', 'invalid');
  });
});
