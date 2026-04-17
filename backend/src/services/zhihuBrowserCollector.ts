import puppeteer, { type CookieParam } from 'puppeteer-core';
import type { RSSItem, Source } from '../types/index.js';
import { credentialStore } from './auth/credentialStore.js';
import { resolveChromeExecutablePath } from './weiboLogin.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveZhihuHandle(source: Source | string): string {
  if (typeof source === 'string') {
    const match = source.match(/zhihu\.com\/people\/([^/?#]+)/i);
    if (match?.[1]) {
      return match[1];
    }
    throw new Error('Zhihu URL is missing a valid people handle');
  }

  const direct = source.platform_id?.trim();
  if (direct) {
    return direct;
  }

  return resolveZhihuHandle(source.input_url || source.rss_url || '');
}

async function getZhihuCookie(): Promise<string> {
  const credential = await credentialStore.get('zhihu');
  const cookie = credential?.value?.trim();
  if (!cookie) {
    throw new Error('Zhihu cookie is missing. Please reconnect Zhihu in platform settings.');
  }
  return cookie;
}

function parseCookieString(cookieString: string): CookieParam[] {
  const cookies: CookieParam[] = [];

  for (const part of cookieString.split(/;\s*/)) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name || !value) {
      continue;
    }

    cookies.push({
      name,
      value,
      domain: '.zhihu.com',
      path: '/',
      secure: true,
    });
  }

  return cookies;
}

type ZhihuCard = {
  link: string | null;
  title: string;
  summary: string;
  publishedAt: string | null;
  author: string | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function scrapeZhihuCards(handle: string, cookieString: string): Promise<ZhihuCard[]> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveChromeExecutablePath(),
    defaultViewport: { width: 1440, height: 960 },
    args: ['--disable-gpu', '--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setCookie(...parseCookieString(cookieString));
    await page.goto(`https://www.zhihu.com/people/${handle}/activities`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(5000);

    const cards = await page.evaluate(() => {
      function clean(text: string | null | undefined): string {
        return (text || '').replace(/\s+/g, ' ').trim();
      }

      function pickPublishedAt(node: any): string | null {
        const match = clean(node.textContent).match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/);
        return match?.[0] || null;
      }

      const doc = (globalThis as { document?: any }).document;

      return Array.from(doc?.querySelectorAll('.List-item') ?? [])
        .slice(0, 12)
        .map((node: any) => {
          const text = clean(node.textContent);
          const links = Array.from(node.querySelectorAll('a[href]'))
            .map((anchor: any) => ({
              href: anchor.href || '',
              text: clean(anchor.textContent),
            }))
            .filter((entry) => entry.href.startsWith('https://www.zhihu.com/') || entry.href.startsWith('https://zhuanlan.zhihu.com/'));

          const primaryLink =
            links.find((entry) => /\/answer\/|zhuanlan\.zhihu\.com\/p\//.test(entry.href))?.href ||
            links.find((entry) => /\/question\//.test(entry.href))?.href ||
            links[0]?.href ||
            null;

          const title =
            links.find((entry) => /\/answer\/|zhuanlan\.zhihu\.com\/p\//.test(entry.href))?.text ||
            links.find((entry) => /\/question\//.test(entry.href))?.text ||
            text.slice(0, 80);

          const author =
            links.find((entry) => /\/people\//.test(entry.href))?.text ||
            null;

          return {
            link: primaryLink,
            title: clean(title),
            summary: text,
            publishedAt: pickPublishedAt(node),
            author: author ? clean(author) : null,
          };
        })
        .filter((card) => card.link && card.title && card.summary);
    });

    if (!cards.length) {
      const pageText = await page.$eval('body', (body) => body.innerText.slice(0, 200)).catch(() => '');
      throw new Error(`Zhihu activity page rendered no usable cards. Page text: ${pageText}`);
    }

    return cards as ZhihuCard[];
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function toIso(value: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value.replace(' ', 'T') + '+08:00');
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function cardToItem(sourceName: string, card: ZhihuCard): RSSItem | null {
  if (!card.link) {
    return null;
  }

  const summary = normalizeWhitespace(card.summary).slice(0, 1200);
  const title = normalizeWhitespace(card.title) || summary.slice(0, 80) || sourceName;
  const publishedIso = toIso(card.publishedAt);

  return {
    guid: card.link,
    title,
    link: card.link,
    author: card.author || sourceName,
    description: summary,
    content: summary,
    contentSnippet: summary,
    pubDate: card.publishedAt || publishedIso,
    isoDate: publishedIso,
  };
}

export async function collectZhihuBrowserItems(source: Source): Promise<RSSItem[]> {
  const handle = resolveZhihuHandle(source);
  const cookie = await getZhihuCookie();
  const cards = await scrapeZhihuCards(handle, cookie);
  const items = cards
    .map((card) => cardToItem(source.name || handle, card))
    .filter((item): item is RSSItem => Boolean(item));

  if (!items.length) {
    throw new Error('Zhihu activity page returned cards but no usable items');
  }

  return items;
}

export const zhihuBrowserCollector = {
  collectItems: collectZhihuBrowserItems,
};
