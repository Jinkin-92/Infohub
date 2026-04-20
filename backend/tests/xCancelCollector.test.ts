import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/queries.js', () => ({
  sourcesQueries: {
    update: vi.fn(),
  },
}));

const { xCancelCollectorInternals } = await import('../src/services/xCancelCollector.js');

describe('xcancel collector parsing', () => {
  it('filters retweets and cards from other accounts while keeping own posts', () => {
    const cards = [
      {
        displayName: 'Silicon Carne',
        handle: 'siliconcarnesf',
        statusUrl: '/siliconcarnesf/status/1#m',
        publishedAt: new Date().toISOString(),
        text: 'other account post',
        quoteText: null,
        mediaUrls: [],
        socialContext: 'Elon Musk retweeted',
        isReply: false,
      },
      {
        displayName: 'Elon Musk',
        handle: 'elonmusk',
        statusUrl: '/elonmusk/status/2#m',
        publishedAt: new Date().toISOString(),
        text: 'own post',
        quoteText: null,
        mediaUrls: [],
        socialContext: null,
        isReply: false,
      },
    ];

    const filtered = xCancelCollectorInternals.filterCardsForProfileTimeline(cards, 'elonmusk');

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.handle).toBe('elonmusk');
    expect(filtered[0]?.displayName).toBe('Elon Musk');
  });

  it('parses a profile timeline block into an own post with quote and media', () => {
    const block = `
      <div class="timeline-item " data-username="elonmusk">
        <a class="tweet-link" href="/elonmusk/status/2046018465916740047#m"></a>
        <div class="tweet-body">
          <div><div class="tweet-header">
            <div class="tweet-name-row">
              <div class="fullname-and-username">
                <a class="fullname" href="/elonmusk" title="Elon Musk">Elon Musk</a>
                <a class="username" href="/elonmusk" title="@elonmusk">@elonmusk</a>
              </div>
              <span class="tweet-date"><a href="/elonmusk/status/2046018465916740047#m" title="Apr 20, 2026 · 12:09 AM UTC">2h</a></span>
            </div>
          </div></div>
          <div class="tweet-content media-body" dir="auto">True</div>
          <div class="quote quote-big">
            <div class="quote-text" dir="auto">Quoted post text</div>
            <div class="quote-media-container"><div class="attachments"><div class="gallery-row"><div class="attachment"><a class="still-image" href="https://pbs.twimg.com/media/test.jpg?name=orig" target="_blank"><img src="https://pbs.twimg.com/media/test.jpg?name=small&amp;format=webp" alt="" /></a></div></div></div></div>
          </div>
        </div>
      </div>
    `;

    const card = xCancelCollectorInternals.parseTimelineCard(block);
    expect(card).not.toBeNull();
    expect(card?.handle).toBe('elonmusk');
    expect(card?.displayName).toBe('Elon Musk');
    expect(card?.text).toBe('True');
    expect(card?.quoteText).toBe('Quoted post text');
    expect(card?.mediaUrls[0]).toBe('https://pbs.twimg.com/media/test.jpg?name=orig');

    const item = xCancelCollectorInternals.cardToItem(card!, 'Elon Musk');
    expect(item?.guid).toBe('https://x.com/elonmusk/status/2046018465916740047');
    expect(item?.description).toContain('Quote: Quoted post text');
    expect(item?.enclosure?.url).toBe('https://pbs.twimg.com/media/test.jpg?name=orig');
  });
});
