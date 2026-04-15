import { Hono } from 'hono';
import { z } from 'zod';
import {
  getWechatStatus,
  startWechatSession,
  getWechatSession,
  cancelWechatSession,
  saveWechatCredential,
  deleteWechatCredential,
  verifyWechatCredential,
} from '../services/auth/platforms/wechatAuth.js';
import {
  getWeiboStatus,
  startWeiboSession,
  getWeiboSession,
  cancelWeiboSession,
  saveWeiboCredential,
  deleteWeiboCredential,
} from '../services/auth/platforms/weiboAuth.js';
import {
  getXStatus,
  saveXCredential,
  deleteXCredential,
} from '../services/auth/platforms/xAuth.js';
import {
  getXiaohongshuStatus,
  startXiaohongshuSession,
  getXiaohongshuSession,
  cancelXiaohongshuSession,
  saveXiaohongshuCredential,
  deleteXiaohongshuCredential,
} from '../services/auth/platforms/xiaohongshuAuth.js';
import {
  getZhihuStatus,
  startZhihuSession,
  getZhihuSession,
  cancelZhihuSession,
  saveZhihuCredential,
  deleteZhihuCredential,
} from '../services/auth/platforms/zhihuAuth.js';
import { URLDetector } from '../services/urlDetector.js';
import { env } from '../config/env.js';
import { BadRequestError, NotFoundError } from '../middleware/error.js';
import { weiboHttpCollector } from '../services/weiboHttpCollector.js';
import { xBrowserCollector } from '../services/xBrowserCollector.js';

const authRouter = new Hono();
const urlDetector = new URLDetector();

const PLATFORMS = ['wechat', 'weibo', 'x', 'xiaohongshu', 'zhihu'] as const;
type Platform = (typeof PLATFORMS)[number];

type PlatformTestResult = {
  platform: Platform;
  testUrl: string;
  resolvedRssUrl?: string;
  resolvedPlatformId?: string;
  success: boolean;
  statusCode?: number;
  message: string;
};

const DEFAULT_TEST_URLS: Record<Platform, string> = {
  wechat: 'https://mp.weixin.qq.com/s/r6rCmay_PJxc9I-huNmjcA',
  zhihu: 'https://www.zhihu.com/people/fu-lan-ke-yang',
  xiaohongshu: 'https://www.xiaohongshu.com/user/profile/669f985a000000000d027d9f?xsec_token=ABcbHMoapyi56-qoJsruhheNUeFUVCBOlGY_Wdi72z4tU=&xsec_source=pc_search',
  weibo: 'https://weibo.com/1788911247?refer_flag=1001030103_',
  x: 'https://x.com/oooodjdjd',
};

const credentialSchema = z.object({
  value: z.string().min(1),
});

const platformTestSchema = z.object({
  url: z.string().url().optional(),
});

function isValidPlatform(platform: string): platform is Platform {
  return PLATFORMS.includes(platform as Platform);
}

function parseXiaohongshuProfileId(url: URL): string | null {
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const profileIndex = pathSegments.indexOf('profile');
  if (profileIndex === -1 || profileIndex + 1 >= pathSegments.length) {
    return null;
  }
  return pathSegments[profileIndex + 1] || null;
}

function resolveXiaohongshuRss(testUrl: string): { rssUrl: string; platformId: string } {
  const parsed = new URL(testUrl);
  if (!/(\.|^)xiaohongshu\.com$/.test(parsed.hostname)) {
    throw new BadRequestError('Xiaohongshu test requires a xiaohongshu.com profile URL');
  }

  const platformId = parseXiaohongshuProfileId(parsed);
  if (!platformId) {
    throw new BadRequestError('Could not resolve Xiaohongshu profile id from URL');
  }

  return {
    platformId,
    rssUrl: `${env.RSSHUB_URL.replace(/\/$/, '')}/xiaohongshu/user/${platformId}/notes`,
  };
}

async function fetchRssHealth(rssUrl: string): Promise<{ ok: boolean; status: number; message: string }> {
  const response = await fetch(rssUrl, {
    signal: AbortSignal.timeout(20000),
    headers: {
      accept: 'application/rss+xml, application/xml, text/xml, */*',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body.slice(0, 300) || `HTTP ${response.status}`,
    };
  }

  if (/"error"\s*:\s*\{/i.test(body)) {
    return {
      ok: false,
      status: response.status,
      message: body.slice(0, 300) || 'Endpoint returned an error payload',
    };
  }

  return {
    ok: true,
    status: response.status,
    message: `Platform test endpoint responded (${contentType || 'unknown content-type'})`,
  };
}

async function runPlatformTest(platform: Platform, urlOverride?: string): Promise<PlatformTestResult> {
  const testUrl = urlOverride || DEFAULT_TEST_URLS[platform];

  try {
    if (platform === 'wechat') {
      const verify = await verifyWechatCredential();
      if (!verify.valid) {
        return {
          platform,
          testUrl,
          success: false,
          message: verify.message || 'WeChat credential is invalid',
        };
      }

      const detected = await urlDetector.detect(testUrl);
      return {
        platform,
        testUrl,
        resolvedRssUrl: detected.rssUrl,
        resolvedPlatformId: detected.platformId,
        success: true,
        message: `WeChat built-in collector is ready for fakeid ${detected.platformId}`,
      };
    }

    if (platform === 'weibo') {
      const result = await weiboHttpCollector.verifyConnection(testUrl);
      return {
        platform,
        testUrl,
        resolvedPlatformId: result.resolvedUid,
        success: result.success,
        message: result.message,
      };
    }

    if (platform === 'x') {
      const result = await xBrowserCollector.verifyConnection(testUrl);
      return {
        platform,
        testUrl,
        resolvedPlatformId: result.resolvedHandle,
        success: result.success,
        message: result.message,
      };
    }

    if (platform === 'xiaohongshu') {
      const resolved = resolveXiaohongshuRss(testUrl);
      const health = await fetchRssHealth(resolved.rssUrl);
      return {
        platform,
        testUrl,
        resolvedRssUrl: resolved.rssUrl,
        resolvedPlatformId: resolved.platformId,
        success: health.ok,
        statusCode: health.status,
        message: health.message,
      };
    }

    const detected = await urlDetector.detect(testUrl);
    const health = await fetchRssHealth(detected.rssUrl);
    return {
      platform,
      testUrl,
      resolvedRssUrl: detected.rssUrl,
      resolvedPlatformId: detected.platformId,
      success: health.ok,
      statusCode: health.status,
      message: health.message,
    };
  } catch (error) {
    return {
      platform,
      testUrl,
      success: false,
      message: error instanceof Error ? error.message : 'Platform test failed',
    };
  }
}

authRouter.get('/platforms', async (c) => {
  const [wechat, weibo, x, xiaohongshu, zhihu] = await Promise.all([
    getWechatStatus(),
    getWeiboStatus(),
    getXStatus(),
    getXiaohongshuStatus(),
    getZhihuStatus(),
  ]);
  return c.json({ ok: true, platforms: [wechat, weibo, x, xiaohongshu, zhihu] });
});

authRouter.get('/:platform/status', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  let status;
  switch (platform) {
    case 'wechat':
      status = await getWechatStatus();
      break;
    case 'weibo':
      status = await getWeiboStatus();
      break;
    case 'x':
      status = await getXStatus();
      break;
    case 'xiaohongshu':
      status = await getXiaohongshuStatus();
      break;
    case 'zhihu':
      status = await getZhihuStatus();
      break;
  }

  return c.json({ ok: true, status });
});

authRouter.post('/:platform/session', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  const body = await c.req.json().catch(() => ({}));
  const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl : undefined;

  let session;
  switch (platform) {
    case 'wechat':
      session = await startWechatSession();
      break;
    case 'weibo':
      session = await startWeiboSession(targetUrl);
      break;
    case 'xiaohongshu':
      session = await startXiaohongshuSession(targetUrl);
      break;
    case 'zhihu':
      session = await startZhihuSession(targetUrl);
      break;
    default:
      throw new BadRequestError(`${platform} does not support QR login`);
  }

  return c.json({ ok: true, session });
});

authRouter.get('/:platform/session/:id', async (c) => {
  const platform = c.req.param('platform');
  const sessionId = c.req.param('id');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  let session = null;
  switch (platform) {
    case 'wechat':
      session = await getWechatSession(sessionId);
      break;
    case 'weibo':
      session = await getWeiboSession(sessionId);
      break;
    case 'xiaohongshu':
      session = await getXiaohongshuSession(sessionId);
      break;
    case 'zhihu':
      session = await getZhihuSession(sessionId);
      break;
  }

  if (!session) {
    throw new NotFoundError('Session not found or expired');
  }
  return c.json({ ok: true, session });
});

authRouter.post('/:platform/session/:id/cancel', async (c) => {
  const platform = c.req.param('platform');
  const sessionId = c.req.param('id');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  switch (platform) {
    case 'wechat':
      await cancelWechatSession(sessionId);
      break;
    case 'weibo':
      await cancelWeiboSession(sessionId);
      break;
    case 'xiaohongshu':
      await cancelXiaohongshuSession(sessionId);
      break;
    case 'zhihu':
      await cancelZhihuSession(sessionId);
      break;
  }

  return c.json({ ok: true });
});

authRouter.post('/:platform/credentials', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  const body = await c.req.json();
  const parsed = credentialSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError('Credential value is required');
  }

  switch (platform) {
    case 'wechat': {
      const lines = parsed.data.value.split('\n');
      const cookie = lines[0]?.trim() || '';
      const token = lines[1]?.trim() || '';
      await saveWechatCredential(cookie, token);
      break;
    }
    case 'weibo':
      await saveWeiboCredential(parsed.data.value);
      break;
    case 'x':
      await saveXCredential(parsed.data.value);
      break;
    case 'xiaohongshu':
      await saveXiaohongshuCredential(parsed.data.value);
      break;
    case 'zhihu':
      await saveZhihuCredential(parsed.data.value);
      break;
  }

  return c.json({ ok: true });
});

authRouter.post('/:platform/verify', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  if (platform !== 'wechat') {
    return c.json({ ok: true, valid: true, message: 'Auto-verify is currently implemented for WeChat only' });
  }

  const result = await verifyWechatCredential();
  return c.json({ ok: true, ...result });
});

authRouter.post('/:platform/test', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = platformTestSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError('Invalid test payload');
  }

  const result = await runPlatformTest(platform, parsed.data.url);
  return c.json({ ok: true, result });
});

authRouter.delete('/:platform/credentials', async (c) => {
  const platform = c.req.param('platform');
  if (!isValidPlatform(platform)) {
    throw new BadRequestError('Invalid platform');
  }

  switch (platform) {
    case 'wechat':
      await deleteWechatCredential();
      break;
    case 'weibo':
      await deleteWeiboCredential();
      break;
    case 'x':
      await deleteXCredential();
      break;
    case 'xiaohongshu':
      await deleteXiaohongshuCredential();
      break;
    case 'zhihu':
      await deleteZhihuCredential();
      break;
  }

  return c.json({ ok: true });
});

export default authRouter;
