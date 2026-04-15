import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import type { RSSItem, Source } from '../types/index.js';
import { weiboProfileStore } from './weiboProfileStore.js';
import { resolveChromeExecutablePath } from './weiboLogin.js';
import { sourcesQueries } from '../db/queries.js';

export type WeiboMobileCard = {
  time: string;
  main: string;
  repost: string;
  detail: string | null;
  imgs: string[];
  stats: string[];
  screenName: string;
};

export function resolveWeiboUid(source: Source | string): string {
  if (typeof source === 'string') {
    const match = source.match(/weibo\.com\/(?:u\/)?(\d{6,})/i) || source.match(/m\.weibo\.cn\/u\/(\d{6,})/i);
    if (match?.[1]) {
      return match[1];
    }
    throw new Error('Weibo url is missing a numeric uid');
  }

  const directId = source.platform_id?.trim();
  if (directId && /^\d+$/.test(directId)) {
    return directId;
  }

  const url = source.input_url || source.rss_url || '';
  return resolveWeiboUid(url);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<img[^>]*alt=['"]([^'"]+)['"][^>]*>/gi, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return normalizeText(decodeHtml(value).replace(/<[^>]+>/g, ' '));
}

export function normalizeMobileTime(raw: string): string {
  const text = raw.trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return text;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    return text;
  }

  const year = new Date().getFullYear();
  if (/^\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(text)) {
    return `${year}-${text}`;
  }

  return text;
}

export function timeToIso(raw: string): string {
  const normalized = normalizeMobileTime(raw);
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const now = new Date();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00+08:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(normalized)) {
    const isoLike = normalized.replace(' ', 'T') + ':00+08:00';
    const date = new Date(isoLike);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return now.toISOString();
}

function buildGuid(uid: string, card: WeiboMobileCard): string {
  if (card.detail) {
    const id = card.detail.match(/\/status\/([^/?#]+)/)?.[1];
    if (id) {
      return `weibo:${id}`;
    }
  }

  const digest = createHash('sha1')
    .update(`${uid}|${card.time}|${card.main}|${card.repost}`)
    .digest('hex')
    .slice(0, 16);
  return `weibo:${digest}`;
}

function buildLink(uid: string, card: WeiboMobileCard, _guid: string): string {
  if (card.detail) {
    return card.detail.startsWith('http') ? card.detail : `https://m.weibo.cn${card.detail}`;
  }
  return `https://m.weibo.cn/u/${uid}`;
}

function buildSummary(card: WeiboMobileCard): string {
  const text = [card.main, card.repost].filter(Boolean).join(' | ');
  const metrics = card.stats.length >= 3
    ? `reposts ${card.stats[0]} | comments ${card.stats[1]} | likes ${card.stats[2]}`
    : '';
  return [text, metrics].filter(Boolean).join(' | ').slice(0, 500);
}

export function cardToItem(uid: string, sourceName: string, card: WeiboMobileCard): RSSItem | null {
  const mainText = normalizeText(card.main);
  const repostText = normalizeText(card.repost);
  if (!mainText && !repostText) {
    return null;
  }

  const guid = buildGuid(uid, card);
  const primaryText = mainText || repostText || 'Weibo post';
  const summary = buildSummary(card);

  return {
    guid,
    title: `${sourceName}: ${primaryText.slice(0, 80)}`,
    link: buildLink(uid, card, guid),
    author: card.screenName || sourceName,
    description: summary,
    content: summary,
    contentSnippet: summary,
    pubDate: normalizeMobileTime(card.time),
    isoDate: timeToIso(card.time),
    enclosure: card.imgs[0]
      ? {
          url: card.imgs[0],
          type: 'image/jpeg',
          length: '0',
        }
      : undefined,
  };
}

type WeiboApiResponse = {
  ok: number;
  data?: {
    cards?: Array<{
      card_type?: number;
      profile_type_id?: string;
      scheme?: string;
      mblog?: {
        created_at?: string;
        text?: string;
        id?: string;
        bid?: string;
        source?: string;
        reposts_count?: number;
        comments_count?: number;
        attitudes_count?: number;
        pic_ids?: string[];
        thumbnail_pic?: string;
        bmiddle_pic?: string;
        original_pic?: string;
        user?: {
          screen_name?: string;
        };
        retweeted_status?: {
          text?: string;
          original_pic?: string;
          bmiddle_pic?: string;
          thumbnail_pic?: string;
        };
      };
    }>;
  };
};

function normalizeWeiboScheme(scheme: string | undefined, uid: string, bid: string | undefined, id: string | undefined): string | null {
  if (scheme && /\/status\//i.test(scheme)) {
    return scheme;
  }

  if (bid) {
    return `https://m.weibo.cn/status/${bid}`;
  }

  if (id) {
    return `https://m.weibo.cn/detail/${id}`;
  }

  return `https://m.weibo.cn/u/${uid}`;
}

export function toMobileCard(uid: string, card: NonNullable<NonNullable<WeiboApiResponse['data']>['cards']>[number]): WeiboMobileCard | null {
  if (card.card_type !== 9 || !card.mblog) {
    return null;
  }

  if (card.profile_type_id === 'proweibotop_') {
    return null;
  }

  const mblog = card.mblog;
  const detail = normalizeWeiboScheme(card.scheme, uid, mblog.bid, mblog.id);
  const main = stripTags(mblog.text || '');
  const repost = stripTags(mblog.retweeted_status?.text || '');
  const imgs = [
    mblog.original_pic,
    mblog.bmiddle_pic,
    mblog.thumbnail_pic,
    mblog.retweeted_status?.original_pic,
    mblog.retweeted_status?.bmiddle_pic,
    mblog.retweeted_status?.thumbnail_pic,
  ].filter((value): value is string => Boolean(value));

  const stats = [
    String(mblog.reposts_count ?? 0),
    String(mblog.comments_count ?? 0),
    String(mblog.attitudes_count ?? 0),
  ];

  if (!main && !repost) {
    return null;
  }

  return {
    time: mblog.created_at || '',
    main,
    repost,
    detail,
    imgs,
    stats,
    screenName: mblog.user?.screen_name?.trim() || '',
  };
}

async function scrapeMobileCards(uid: string): Promise<{ cards: WeiboMobileCard[]; pageText: string; screenName: string | null }> {
  const runtimeProfileDir = weiboProfileStore.createRuntimeProfile();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: resolveChromeExecutablePath(),
      userDataDir: runtimeProfileDir,
      defaultViewport: { width: 430, height: 900, isMobile: true },
      args: ['--disable-gpu', '--no-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    );

    await page.goto(`https://m.weibo.cn/u/${uid}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const apiPayload = await page.evaluate(async (targetUid) => {
      const response = await fetch(
        `https://m.weibo.cn/api/container/getIndex?type=uid&value=${targetUid}&containerid=107603${targetUid}`,
        { credentials: 'include' }
      );
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
      };
    }, uid);
    const pageText = await page.$eval('body', (body) => body.innerText).catch(() => '');

    if (!apiPayload.ok) {
      throw new Error(`Weibo mobile api returned ${apiPayload.status}. Page text: ${pageText.slice(0, 120)}`);
    }

    const parsed = JSON.parse(apiPayload.text) as WeiboApiResponse;
    const cards = (parsed.data?.cards ?? [])
      .map((card) => toMobileCard(uid, card))
      .filter((card): card is WeiboMobileCard => Boolean(card));

    return {
      cards,
      pageText,
      screenName: cards.find((card) => card.screenName)?.screenName || null,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    weiboProfileStore.cleanupRuntimeProfile(runtimeProfileDir);
  }
}

export async function collectWeiboBrowserItems(source: Source): Promise<RSSItem[]> {
  const uid = resolveWeiboUid(source);
  const { cards, pageText, screenName } = await scrapeMobileCards(uid);

  if (!cards.length) {
    throw new Error(`Weibo mobile page did not render any post cards. Page text: ${pageText.slice(0, 120)}`);
  }

  const sourceName = screenName || source.name || uid;
  if (screenName && source.name !== screenName) {
    await sourcesQueries.update(source.id, { name: screenName });
  }

  const items = cards
    .map((card) => cardToItem(uid, sourceName, card))
    .filter((item): item is RSSItem => Boolean(item));
  weiboProfileStore.markHealthyUse();
  return items;
}

export async function verifyWeiboBrowserConnection(testUrl: string): Promise<{
  success: boolean;
  message: string;
  resolvedUid?: string;
}> {
  if (!weiboProfileStore.hasActiveProfile()) {
    return {
      success: false,
      message: 'Weibo QR login has not produced a reusable browser profile yet.',
    };
  }

  const uid = resolveWeiboUid(testUrl);
  const { cards, pageText, screenName } = await scrapeMobileCards(uid);
  weiboProfileStore.markChecked();

  if (!cards.length) {
    return {
      success: false,
      message: `The saved Weibo mobile page did not render any posts. Page text: ${pageText.slice(0, 80)}`,
      resolvedUid: uid,
    };
  }

  weiboProfileStore.markHealthyUse();
  return {
    success: true,
    message: `Weibo connected. ${screenName || `UID ${uid}`} rendered ${cards.length} posts.`,
    resolvedUid: uid,
  };
}

export const weiboBrowserCollector = {
  collectItems: collectWeiboBrowserItems,
  verifyConnection: verifyWeiboBrowserConnection,
};
