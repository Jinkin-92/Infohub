import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveToSettings: vi.fn(),
  storeSave: vi.fn(),
  storeDelete: vi.fn(),
  storeUpdateStatus: vi.fn(),
  getQrCode: vi.fn(),
  checkLoginStatus: vi.fn(),
  handleLoginSuccess: vi.fn(),
}));

vi.mock('../src/services/wechat/auth.js', () => ({
  WeChatAuth: class {
    saveToSettings = mocks.saveToSettings;
    verifyCredentials = vi.fn(async () => true);
    getStatus = vi.fn(async () => ({ configured: true, cookieValid: true, tokenValid: true }));
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

describe('wechat auth reconnect flow', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mockFn) => mockFn.mockReset());
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
    expect(mocks.storeSave).toHaveBeenCalledWith(
      'wechat',
      'cookie',
      'cookie=foo=bar;token=123456'
    );
    expect(updated?.state).toBe('confirmed');
    expect(updated?.cookieConfigured).toBe(true);
  });
});
