import type { RSSItem, Source } from '../types/index.js';
import { credentialStore } from './auth/credentialStore.js';
import { sourcesQueries } from '../db/queries.js';
import { weiboProfileStore } from './weiboProfileStore.js';
import { cardToItem, resolveWeiboUid, toMobileCard } from './weiboBrowserCollector.js';
import { weiboBrowserCollector } from './weiboBrowserCollector.js';

type WeiboTimelineApiResponse = {
  ok?: number;
  msg?: string;
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

type WeiboHttpResult = {
  uid: string;
  cards: RSSItem[];
  screenName: string | null;
  rawCount: number;
};

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

async function getWeiboCookie(): Promise<string> {
  const credential = await credentialStore.get('weibo');
  const cookie = credential?.value?.trim();
  if (!cookie) {
    throw new Error('Weibo cookie is missing. Please reconnect Weibo in platform settings.');
  }
  return cookie;
}

async function verifyWeiboCookie(cookie: string): Promise<{ valid: boolean; message?: string }> {
  const response = await fetch('https://weibo.com/ajax/profile/info?custom=1788911247', {
    headers: {
      cookie,
      'user-agent': DESKTOP_USER_AGENT,
      accept: 'application/json, text/plain, */*',
      referer: 'https://weibo.com/',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return {
      valid: false,
      message: `Weibo verification returned HTTP ${response.status}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: number; msg?: string; data?: { user?: { screen_name?: string } } }
    | null;

  if (!payload) {
    return {
      valid: false,
      message: 'Weibo verification returned an unreadable response',
    };
  }

  if (payload.data?.user?.screen_name || payload.ok === 1) {
    return { valid: true };
  }

  return {
    valid: false,
    message: payload.msg || 'Weibo login could not be verified',
  };
}

async function fetchWeiboTimeline(uid: string, cookie: string): Promise<WeiboHttpResult> {
  const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}`;
  const response = await fetch(url, {
    headers: {
      cookie,
      'user-agent': MOBILE_USER_AGENT,
      accept: 'application/json, text/plain, */*',
      referer: `https://m.weibo.cn/u/${uid}`,
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`Weibo mobile api returned ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as WeiboTimelineApiResponse | null;
  if (!payload) {
    throw new Error('Weibo mobile api returned an unreadable response');
  }

  if (payload.ok !== 1) {
    throw new Error(payload.msg || 'Weibo mobile api rejected the request');
  }

  const mobileCards = (payload.data?.cards ?? [])
    .map((card) => toMobileCard(uid, card))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));

  if (!mobileCards.length) {
    throw new Error('Weibo mobile api returned no post cards');
  }

  const screenName = mobileCards.find((card) => card.screenName)?.screenName || null;
  const sourceName = screenName || uid;
  const items = mobileCards
    .map((card) => cardToItem(uid, sourceName, card))
    .filter((item): item is RSSItem => Boolean(item));

  if (!items.length) {
    throw new Error('Weibo mobile api returned cards but no usable items');
  }

  return {
    uid,
    cards: items,
    screenName,
    rawCount: mobileCards.length,
  };
}

function shouldFallbackToBrowser(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /unreadable response|rejected the request|returned no post cards|returned cards but no usable items/i.test(message);
}

export async function collectWeiboHttpItems(source: Source): Promise<RSSItem[]> {
  const uid = resolveWeiboUid(source);
  const cookie = await getWeiboCookie();
  const verify = await verifyWeiboCookie(cookie);
  if (!verify.valid) {
    throw new Error(verify.message || 'Weibo cookie is invalid. Please reconnect Weibo.');
  }

  try {
    const result = await fetchWeiboTimeline(uid, cookie);

    if (result.screenName && source.name !== result.screenName) {
      await sourcesQueries.update(source.id, { name: result.screenName });
    }

    weiboProfileStore.markHealthyUse();
    return result.cards;
  } catch (error) {
    if (shouldFallbackToBrowser(error) && weiboProfileStore.hasActiveProfile()) {
      return weiboBrowserCollector.collectItems(source);
    }
    throw error;
  }
}

export async function verifyWeiboHttpConnection(testUrl: string): Promise<{
  success: boolean;
  message: string;
  resolvedUid?: string;
}> {
  let uid: string;
  try {
    uid = resolveWeiboUid(testUrl);
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Could not resolve Weibo uid',
    };
  }

  let cookie: string;
  try {
    cookie = await getWeiboCookie();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Weibo cookie is missing',
      resolvedUid: uid,
    };
  }

  const verify = await verifyWeiboCookie(cookie);
  if (!verify.valid) {
    return {
      success: false,
      message: verify.message || 'Weibo cookie is invalid',
      resolvedUid: uid,
    };
  }

  try {
    const result = await fetchWeiboTimeline(uid, cookie);
    weiboProfileStore.markHealthyUse();
    return {
      success: true,
      message: `Weibo connected. ${result.screenName || `UID ${uid}`} rendered ${result.rawCount} posts via HTTP collector.`,
      resolvedUid: uid,
    };
  } catch (error) {
    if (shouldFallbackToBrowser(error) && weiboProfileStore.hasActiveProfile()) {
      const browserResult = await weiboBrowserCollector.verifyConnection(testUrl);
      return {
        success: browserResult.success,
        message: browserResult.success
          ? `${browserResult.message} (HTTP collector was blocked, browser fallback used.)`
          : browserResult.message,
        resolvedUid: browserResult.resolvedUid || uid,
      };
    }

    weiboProfileStore.markChecked();
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Weibo timeline check failed',
      resolvedUid: uid,
    };
  }
}

export const weiboHttpCollector = {
  collectItems: collectWeiboHttpItems,
  verifyConnection: verifyWeiboHttpConnection,
};
