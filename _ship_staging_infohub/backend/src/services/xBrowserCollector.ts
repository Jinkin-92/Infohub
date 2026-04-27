import puppeteer, { type Browser, type CookieParam, type Page } from 'puppeteer-core';
import type { RSSItem, Source } from '../types/index.js';
import { credentialStore } from './auth/credentialStore.js';
import { resolveChromeExecutablePath } from './weiboLogin.js';
import { sourcesQueries } from '../db/queries.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type XTimelineCard = {
  displayName: string | null;
  handle: string | null;
  statusUrl: string | null;
  publishedAt: string | null;
  textParts: string[];
  mediaUrls: string[];
  socialContext: string | null;
  rawText: string;
};

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

function parseCookieString(cookieString: string): CookieParam[] {
  const pairs = cookieString
    .split(/;\s*/)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return null;
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!name || !value) {
        return null;
      }

      return { name, value };
    })
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie));

  return pairs.flatMap((cookie) => ([
    {
      ...cookie,
      domain: 'x.com',
      path: '/',
      secure: true,
      sameSite: 'None' as const,
    },
    {
      ...cookie,
      domain: '.x.com',
      path: '/',
      secure: true,
      sameSite: 'None' as const,
    },
  ]));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isMetricLine(value: string): boolean {
  return /^\d+(?:\.\d+)?[KMB]?$/.test(value.trim());
}

function extractFallbackText(rawText: string, handle: string | null): string {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== 'Pinned')
    .filter((line) => line !== 'Article')
    .filter((line) => line !== 'Quote')
    .filter((line) => line !== 'Show more')
    .filter((line) => line !== 'Show this thread')
    .filter((line) => !isMetricLine(line))
    .filter((line) => line !== '·')
    .filter((line) => !/^@/.test(line))
    .filter((line) => !/^[0-9]+[smhdwy]$/i.test(line))
    .filter((line) => !/^\d{1,2}:\d{2}\s*[AP]M$/i.test(line));

  const cleaned = lines.filter((line) => !handle || !line.includes(`@${handle}`));
  return normalizeWhitespace(cleaned.slice(1).join('\n'));
}

function toAbsoluteStatusUrl(statusUrl: string | null): string | null {
  if (!statusUrl) {
    return null;
  }

  if (statusUrl.startsWith('http')) {
    return statusUrl;
  }

  const match = statusUrl.match(/(\/[^/]+\/status\/\d+)/);
  if (!match?.[1]) {
    return null;
  }

  return `https://x.com${match[1]}`;
}

function extractPrimaryText(card: XTimelineCard): string {
  if (card.textParts.length >= 2) {
    return `${card.textParts[0]}\n\nQuote: ${card.textParts.slice(1).join('\n\n')}`;
  }

  if (card.textParts[0]) {
    return card.textParts[0];
  }

  return extractFallbackText(card.rawText, card.handle);
}

function cardToItem(card: XTimelineCard, sourceName: string): RSSItem | null {
  const link = toAbsoluteStatusUrl(card.statusUrl);
  const text = extractPrimaryText(card);
  const publishedAt = card.publishedAt || undefined;
  if (!link || !text || !publishedAt) {
    return null;
  }

  return {
    guid: link,
    title: `${sourceName}: ${text.slice(0, 80)}`,
    link,
    author: card.displayName || sourceName,
    description: text,
    content: text,
    contentSnippet: text,
    pubDate: publishedAt,
    isoDate: publishedAt,
    enclosure: card.mediaUrls[0]
      ? {
          url: card.mediaUrls[0],
          type: 'image/jpeg',
          length: '0',
        }
      : undefined,
  };
}

async function readTimelineCards(page: Page): Promise<XTimelineCard[]> {
  return page.evaluate(() => {
    const doc = (globalThis as { document?: any }).document;
    const articles = Array.from(doc?.querySelectorAll('article') ?? []) as any[];
    return articles.map((article) => {
      const userComposite = article.querySelector('[data-testid="User-Name"]')?.textContent?.trim() || '';
      const handleMatch = userComposite.match(/@([A-Za-z0-9_]{1,15})/);
      const displayName = handleMatch
        ? userComposite.slice(0, handleMatch.index).trim() || null
        : null;
      const statusHref = Array.from(article.querySelectorAll('a[href*="/status/"]') ?? [])
        .map((anchor: any) => anchor.getAttribute('href') || '')
        .find((href) => /\/status\/\d+/.test(href)) || null;

      return {
        displayName,
        handle: handleMatch?.[1] || null,
        statusUrl: statusHref,
        publishedAt: article.querySelector('time')?.getAttribute('datetime') || null,
        textParts: Array.from(article.querySelectorAll('[data-testid="tweetText"]') ?? [])
          .map((node: any) => node.textContent?.trim() || '')
          .filter(Boolean),
        mediaUrls: Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]') ?? [])
          .map((img: any) => img.getAttribute('src') || '')
          .filter(Boolean),
        socialContext: article.querySelector('[data-testid="socialContext"]')?.textContent?.trim() || null,
        rawText: article.textContent?.trim() || '',
      };
    });
  });
}

async function waitForTimeline(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const doc = (globalThis as { document?: any }).document;
      const bodyText = doc?.body?.innerText || '';
      const articleCount = doc?.querySelectorAll?.('article')?.length || 0;
      return bodyText.length > 100 && (articleCount > 0 || bodyText.includes('Posts'));
    },
    { timeout: 30000 }
  );
}

async function launchBrowserWithCookies(cookieString: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveChromeExecutablePath(),
    args: ['--disable-gpu', '--no-sandbox'],
    defaultViewport: { width: 1440, height: 1600 },
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  await page.setCookie(...parseCookieString(cookieString));

  return { browser, page };
}

async function scrapeXTimeline(handle: string): Promise<{
  cards: XTimelineCard[];
  pageText: string;
  displayName: string | null;
}> {
  const credential = await credentialStore.get('x');
  if (!credential?.value || !/auth_token=/.test(credential.value) || !/ct0=/.test(credential.value)) {
    throw new Error('X credential is missing auth_token or ct0');
  }

  const { browser, page } = await launchBrowserWithCookies(credential.value);

  try {
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await waitForTimeline(page);
    await sleep(8000);

    const collected = new Map<string, XTimelineCard>();

    for (let attempt = 0; attempt < 4; attempt++) {
      const cards = await readTimelineCards(page);
      for (const card of cards) {
        const absolute = toAbsoluteStatusUrl(card.statusUrl);
        if (!absolute) {
          continue;
        }
        collected.set(absolute, card);
      }

      if (collected.size >= 10) {
        break;
      }

      await page.mouse.wheel({ deltaY: 1800 });
      await sleep(1800);
    }

    const pageText = await page.$eval('body', (body) => body.innerText).catch(() => '');
    const cards = Array.from(collected.values())
      .filter((card) => card.publishedAt)
      .filter((card) => card.socialContext !== 'Pinned')
      .sort((a, b) => (new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()));

    const displayName = cards.find((card) => card.displayName)?.displayName
      || pageText.match(/See new posts\s+([^\n]+)\s+@/u)?.[1]
      || null;

    return { cards, pageText, displayName };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function collectXBrowserItems(source: Source): Promise<RSSItem[]> {
  const handle = resolveXHandle(source);
  const { cards, pageText, displayName } = await scrapeXTimeline(handle);
  if (!cards.length) {
    throw new Error(`Saved X session did not render any posts. Page text: ${pageText.slice(0, 160)}`);
  }

  const sourceName = displayName || source.name || `@${handle}`;
  if (displayName && source.name !== displayName) {
    await sourcesQueries.update(source.id, { name: displayName });
  }

  return cards
    .map((card) => cardToItem(card, sourceName))
    .filter((item): item is RSSItem => Boolean(item));
}

export async function verifyXBrowserConnection(testUrl: string): Promise<{
  success: boolean;
  message: string;
  resolvedHandle?: string;
}> {
  const handle = resolveXHandle(testUrl);
  const { cards, pageText, displayName } = await scrapeXTimeline(handle);
  if (!cards.length) {
    return {
      success: false,
      resolvedHandle: handle,
      message: `Saved X login opened the profile but no posts were rendered. Page text: ${pageText.slice(0, 120)}`,
    };
  }

  return {
    success: true,
    resolvedHandle: handle,
    message: `X connected. ${displayName || `@${handle}`} rendered ${cards.length} posts.`,
  };
}

export const xBrowserCollector = {
  collectItems: collectXBrowserItems,
  verifyConnection: verifyXBrowserConnection,
};
