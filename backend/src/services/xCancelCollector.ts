import type { RSSItem, Source } from '../types/index.js';
import { sourcesQueries } from '../db/queries.js';

type XCancelTimelineCard = {
  displayName: string | null;
  handle: string | null;
  statusUrl: string | null;
  publishedAt: string | null;
  text: string;
  quoteText: string | null;
  mediaUrls: string[];
  socialContext: string | null;
  isReply: boolean;
};

const XCANCEL_BASE_URL = 'https://xcancel.com';
const BROWSER_LIKE_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

function normalizeHandle(handle: string | null | undefined): string | null {
  if (!handle) {
    return null;
  }

  return handle.replace(/^@/, '').trim().toLowerCase() || null;
}

function resolveXHandle(source: Source | string): string {
  if (typeof source === 'string') {
    const match = source.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i);
    if (match?.[1]) {
      return match[1];
    }
    throw new Error('X URL is missing a valid username');
  }

  const direct = source.platform_id?.trim();
  if (direct) {
    return direct.replace(/^@/, '');
  }

  return resolveXHandle(source.input_url || source.rss_url || '');
}

function decodeHtml(value: string): string {
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|nbsp|apos);|&#39;/g, (entity) => namedEntities[entity] ?? entity);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+/g, ' ').trim();
}

function stripTags(value: string): string {
  return normalizeWhitespace(
    decodeHtml(
      value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${XCANCEL_BASE_URL}${value}`;
  }

  return null;
}

function toCanonicalStatusUrl(value: string | null): string | null {
  const absolute = toAbsoluteUrl(value);
  if (!absolute) {
    return null;
  }

  const match = absolute.match(/\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
  if (!match) {
    return null;
  }

  return `https://x.com/${match[1]}/status/${match[2]}`;
}

function parsePublishedAt(title: string | null): string | null {
  if (!title) {
    return null;
  }

  const normalized = decodeHtml(title)
    .replace(/\u00b7/g, ' ')
    .replace(/\u2022/g, ' ')
    .replace(/\s+UTC$/i, ' UTC')
    .replace(/\s+/g, ' ')
    .trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function extractFirstMatch(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);
  return match?.[1] ? decodeHtml(match[1]).trim() : null;
}

function splitTimelineBlocks(html: string): string[] {
  const indices = Array.from(html.matchAll(/<div class="timeline-item\b/gi)).map((match) => match.index ?? -1);
  if (!indices.length) {
    return [];
  }

  return indices.map((start, index) => html.slice(start, indices[index + 1] ?? html.length));
}

function parseTimelineCard(block: string): XCancelTimelineCard | null {
  const handle = extractFirstMatch(block, /data-username="([^"]+)"/i);
  const displayName = extractFirstMatch(block, /<a class="fullname"[^>]*title="([^"]+)"[^>]*>/i);
  const statusUrl = extractFirstMatch(block, /<a class="tweet-link" href="([^"]+)"/i);
  const publishedAt = parsePublishedAt(extractFirstMatch(block, /<span class="tweet-date"><a [^>]*title="([^"]+)"/i));
  const text = stripTags(extractFirstMatch(block, /<div class="tweet-content media-body"[^>]*>([\s\S]*?)<\/div>/i) || '');
  const quoteText = stripTags(extractFirstMatch(block, /<div class="quote-text"[^>]*>([\s\S]*?)<\/div>/i) || '');
  const mediaUrls = Array.from(
    block.matchAll(/<(?:a class="still-image" href|source src)="([^"]+)"/gi),
    (match) => decodeHtml(match[1] || '').trim()
  ).filter(Boolean);
  const socialContext = stripTags(extractFirstMatch(block, /<div class="retweet-header">([\s\S]*?)<\/div>/i) || '');
  const isReply = /<div class="replying-to">/i.test(block);

  if (!handle || !statusUrl || !publishedAt || !text) {
    return null;
  }

  return {
    displayName,
    handle,
    statusUrl,
    publishedAt,
    text,
    quoteText: quoteText || null,
    mediaUrls,
    socialContext: socialContext || null,
    isReply,
  };
}

function isRetweetTimelineCard(card: XCancelTimelineCard): boolean {
  return /retweeted/i.test(card.socialContext || '');
}

function matchesTargetHandle(card: XCancelTimelineCard, handle: string): boolean {
  return normalizeHandle(card.handle) === normalizeHandle(handle);
}

function filterCardsForProfileTimeline(cards: XCancelTimelineCard[], handle: string): XCancelTimelineCard[] {
  return cards
    .filter((card) => !isRetweetTimelineCard(card))
    .filter((card) => matchesTargetHandle(card, handle));
}

function cardToItem(card: XCancelTimelineCard, sourceName: string): RSSItem | null {
  const link = toCanonicalStatusUrl(card.statusUrl);
  if (!link || !card.publishedAt || !card.text) {
    return null;
  }

  const description = card.quoteText ? `${card.text}\n\nQuote: ${card.quoteText}` : card.text;

  return {
    guid: link,
    title: `${sourceName}: ${card.text.slice(0, 80)}`,
    link,
    author: card.displayName || sourceName,
    description,
    content: description,
    contentSnippet: description,
    pubDate: card.publishedAt,
    isoDate: card.publishedAt,
    enclosure: card.mediaUrls[0]
      ? {
          url: card.mediaUrls[0],
          type: card.mediaUrls[0].includes('.mp4') ? 'video/mp4' : 'image/jpeg',
          length: '0',
        }
      : undefined,
  };
}

async function fetchProfileHtml(handle: string): Promise<string> {
  const response = await fetch(`${XCANCEL_BASE_URL}/${handle}`, {
    signal: AbortSignal.timeout(20000),
    headers: BROWSER_LIKE_HEADERS,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`XCancel returned HTTP ${response.status}`);
  }

  if (!/<div class="timeline-item\b/i.test(body)) {
    throw new Error('XCancel did not return any timeline items');
  }

  return body;
}

async function scrapeXCancelTimeline(handle: string): Promise<{
  cards: XCancelTimelineCard[];
  displayName: string | null;
}> {
  const html = await fetchProfileHtml(handle);
  const cards = splitTimelineBlocks(html)
    .map((block) => parseTimelineCard(block))
    .filter((card): card is XCancelTimelineCard => Boolean(card))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());

  const ownCards = filterCardsForProfileTimeline(cards, handle);
  const displayName = extractFirstMatch(html, /<a class="profile-card-fullname"[^>]*title="([^"]+)"/i)
    || ownCards.find((card) => card.displayName)?.displayName
    || null;

  return {
    cards: ownCards,
    displayName,
  };
}

export async function collectXCancelItems(source: Source): Promise<RSSItem[]> {
  const handle = resolveXHandle(source);
  const { cards, displayName } = await scrapeXCancelTimeline(handle);

  if (!cards.length) {
    throw new Error(`XCancel returned no own posts for @${handle}`);
  }

  const sourceName = displayName || source.name || `@${handle}`;
  if (displayName && source.name !== displayName) {
    await sourcesQueries.update(source.id, { name: displayName });
  }

  return cards
    .map((card) => cardToItem(card, sourceName))
    .filter((item): item is RSSItem => Boolean(item));
}

export const xCancelCollector = {
  collectItems: collectXCancelItems,
};

export const xCancelCollectorInternals = {
  parseTimelineCard,
  splitTimelineBlocks,
  filterCardsForProfileTimeline,
  isRetweetTimelineCard,
  matchesTargetHandle,
  cardToItem,
};
