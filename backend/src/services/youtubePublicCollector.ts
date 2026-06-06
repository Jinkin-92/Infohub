import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { RSSItem, Source } from '../types/index.js';

type YouTubeCard = {
  title: string;
  link: string;
  thumbnail: string | null;
  views: string | null;
  publishedLabel: string | null;
  duration: string | null;
  author: string | null;
};

function resolveChromeExecutablePath(): string {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const cacheRoot = join(homedir(), '.cache', 'puppeteer', 'chrome');
  const versions = existsSync(cacheRoot)
    ? readdirSync(cacheRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('win64-'))
        .map((entry) => ({
          name: entry.name,
          path: join(cacheRoot, entry.name, 'chrome-win64', 'chrome.exe'),
        }))
        .filter((entry) => existsSync(entry.path))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
    : [];

  if (versions[0]?.path) {
    return versions[0].path;
  }

  return 'C:/Program Files/Google/Chrome/Application/chrome.exe';
}

function buildVideosUrl(source: Source): string {
  if (source.input_url.includes('/videos')) {
    return source.input_url;
  }

  return `${source.input_url.replace(/\/+$/, '')}/videos`;
}

function parseCompactNumber(value: string): number {
  const text = value.trim();
  const match = text.match(/^([\d.]+)\s*([万亿kKmM])?/);
  if (!match) {
    return 0;
  }

  const base = Number.parseFloat(match[1]);
  if (Number.isNaN(base)) {
    return 0;
  }

  switch (match[2]) {
    case '万':
      return Math.round(base * 10_000);
    case '亿':
      return Math.round(base * 100_000_000);
    case 'k':
    case 'K':
      return Math.round(base * 1_000);
    case 'm':
    case 'M':
      return Math.round(base * 1_000_000);
    default:
      return Math.round(base);
  }
}

function parseRelativePublishedAt(label: string | null, now = new Date()): string {
  if (!label) {
    return now.toISOString();
  }

  const text = label.trim();
  const patterns: Array<[RegExp, (value: number) => number]> = [
    [/^(\d+)\s*分钟前$/, (value) => value * 60 * 1000],
    [/^(\d+)\s*hours?\s*ago$/i, (value) => value * 60 * 60 * 1000],
    [/^(\d+)\s*小时前$/, (value) => value * 60 * 60 * 1000],
    [/^(\d+)\s*days?\s*ago$/i, (value) => value * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*天前$/, (value) => value * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*weeks?\s*ago$/i, (value) => value * 7 * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*周前$/, (value) => value * 7 * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*months?\s*ago$/i, (value) => value * 30 * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*个月前$/, (value) => value * 30 * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*years?\s*ago$/i, (value) => value * 365 * 24 * 60 * 60 * 1000],
    [/^(\d+)\s*年前$/, (value) => value * 365 * 24 * 60 * 60 * 1000],
  ];

  for (const [pattern, toMs] of patterns) {
    const match = text.match(pattern);
    if (match) {
      return new Date(now.getTime() - toMs(Number.parseInt(match[1], 10))).toISOString();
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
}

function normalizeYouTubeUrl(link: string): string {
  if (link.startsWith('http://') || link.startsWith('https://')) {
    return link;
  }

  return `https://www.youtube.com${link.startsWith('/') ? '' : '/'}${link}`;
}

function buildSummary(card: YouTubeCard): string {
  const parts = ['YouTube 视频'];
  if (card.views) {
    parts.push(card.views);
  }
  if (card.publishedLabel) {
    parts.push(card.publishedLabel);
  }
  if (card.duration) {
    parts.push(`时长 ${card.duration}`);
  }
  return parts.join(' · ');
}

export async function collectYouTubePublicItems(source: Source): Promise<RSSItem[]> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveChromeExecutablePath(),
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    await page.goto(buildVideosUrl(source), {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });

    const foundCards = await page
      .waitForSelector('ytd-rich-item-renderer a[href*="/watch?v="]', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (!foundCards) {
      throw new Error('YouTube public video list was not rendered.');
    }

    const cards = await page.evaluate(() => {
      const doc = (globalThis as any).document as any;
      const author =
        doc.querySelector('#channel-name')?.textContent?.trim() ||
        doc.querySelector('ytd-channel-name')?.textContent?.trim() ||
        doc.title.replace(/\s*-\s*YouTube\s*$/i, '').trim() ||
        null;

      return Array.from(doc.querySelectorAll('ytd-rich-item-renderer'))
        .slice(0, 30)
        .map((node: any) => {
          const element = node;
          const titleLink = element.querySelector('a#video-title-link, a#video-title');
          const thumbnail = element.querySelector('ytd-thumbnail img, img');
          const metadata = Array.from(element.querySelectorAll('#metadata-line span'))
            .map((entry: any) => (entry.textContent?.trim() || ''))
            .filter(Boolean);
          const durationText =
            element.querySelector('#thumbnail #text')?.textContent?.trim() ||
            element.querySelector('badge-shape span')?.textContent?.trim() ||
            null;

          return {
            title: titleLink?.textContent?.trim() || '',
            link: titleLink?.getAttribute('href') || '',
            thumbnail: thumbnail?.getAttribute('src') || thumbnail?.getAttribute('data-thumb') || null,
            views: metadata[0] || null,
            publishedLabel: metadata[1] || null,
            duration: durationText,
            author,
          };
        })
        .filter((card) => card.title && card.link);
    });

    return cards.map((card) => {
      const link = normalizeYouTubeUrl(card.link);
      const videoId = link.match(/[?&]v=([^&]+)/)?.[1] || link;
      const publishedAt = parseRelativePublishedAt(card.publishedLabel);
      const summary = buildSummary(card);

      return {
        title: card.title,
        link,
        guid: videoId,
        author: card.author ?? source.name,
        isoDate: publishedAt,
        description: summary,
        contentSnippet: summary,
        enclosure: card.thumbnail
          ? {
              url: card.thumbnail,
              type: 'image/jpeg',
              length: '0',
            }
          : undefined,
      };
    });
  } finally {
    await browser.close();
  }
}

export const youtubePublicCollector = {
  collectItems: collectYouTubePublicItems,
  parseRelativePublishedAt,
  parseCompactNumber,
};
