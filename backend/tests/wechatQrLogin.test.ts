import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({
  sql: {
    execute: vi.fn(),
  },
}));

const { weChatQrLoginInternals } = await import('../src/services/wechat/qrLogin.js');

describe('wechat qr login cookie parsing', () => {
  it('treats EXPIRED cleanup cookies as expired', () => {
    const parsed = weChatQrLoginInternals.parseCookieLine(
      'master_sid=EXPIRED; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );

    expect(parsed).toEqual({
      name: 'master_sid',
      value: 'EXPIRED',
      expired: true,
    });
  });

  it('keeps valid session cookies', () => {
    const parsed = weChatQrLoginInternals.parseCookieLine(
      'pass_ticket=abc123; Path=/; Secure; HttpOnly'
    );

    expect(parsed).toEqual({
      name: 'pass_ticket',
      value: 'abc123',
      expired: false,
    });
  });
});
