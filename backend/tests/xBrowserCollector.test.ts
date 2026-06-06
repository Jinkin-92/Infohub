import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    update: vi.fn(),
  },
}));

vi.mock('../src/services/auth/credentialStore.js', () => ({
  credentialStore: {
    get: vi.fn(),
  },
}));

vi.mock('../src/services/weiboLogin.js', () => ({
  resolveChromeExecutablePath: vi.fn(),
}));

vi.mock('puppeteer-core', () => ({
  default: {
    launch: vi.fn(),
  },
}));

const { xBrowserCollectorInternals } = await import('../src/services/xBrowserCollector.js');

describe('x browser collector filtering', () => {
  it('filters out liked posts and cards from other accounts', () => {
    const cards = [
      {
        displayName: 'Sawyer Merritt',
        handle: 'SawyerMerritt',
        statusUrl: '/SawyerMerritt/status/1',
        publishedAt: new Date().toISOString(),
        textParts: ['liked post'],
        mediaUrls: [],
        socialContext: 'Elon Musk liked',
        rawText: 'liked post',
      },
      {
        displayName: 'Elon Musk',
        handle: 'elonmusk',
        statusUrl: '/elonmusk/status/2',
        publishedAt: new Date().toISOString(),
        textParts: ['own post'],
        mediaUrls: [],
        socialContext: null,
        rawText: 'own post',
      },
    ];

    const filtered = xBrowserCollectorInternals.filterCardsForProfileTimeline(cards, 'elonmusk');

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.handle).toBe('elonmusk');
    expect(filtered[0]?.displayName).toBe('Elon Musk');
  });
});
