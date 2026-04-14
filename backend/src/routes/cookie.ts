import { Hono } from 'hono';
import { cookieExtractor, type ExtractResult } from '../services/cookieExtractor.js';
import { localIntegrationsService } from '../services/localIntegrations.js';
import { weiboLoginService } from '../services/weiboLogin.js';

const cookieRouter = new Hono();

interface PlatformStatus {
  platform: string;
  key: string;
  url: string;
  configured: boolean;
  loggedIn: boolean;
}

cookieRouter.get('/status', async (c) => {
  try {
    const rsshubSettings = await localIntegrationsService.getRsshubSettings();
    const diagnosis = await cookieExtractor.diagnose();

    const platforms: PlatformStatus[] = [
      { platform: '知乎', key: 'ZHIHU_COOKIES', url: 'https://www.zhihu.com/', configured: false, loggedIn: false },
      { platform: '微博', key: 'WEIBO_COOKIES', url: 'https://weibo.com/', configured: false, loggedIn: false },
      { platform: '小红书', key: 'XIAOHONGSHU_COOKIE', url: 'https://www.xiaohongshu.com/', configured: false, loggedIn: false },
      { platform: 'X/Twitter', key: 'TWITTER_AUTH_TOKEN', url: 'https://x.com/', configured: false, loggedIn: false },
    ];

    for (const setting of rsshubSettings.settings) {
      const platform = platforms.find((item) => item.key === setting.key);
      if (platform) {
        platform.configured = setting.configured;
      }
    }

    return c.json({
      ok: true,
      data: {
        chromeConnected: diagnosis.available,
        chromeVersion: diagnosis.chromeVersion,
        chromeError: diagnosis.error,
        chromeHint: diagnosis.hint,
        platforms,
      },
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to get cookie status',
      },
      500
    );
  }
});

cookieRouter.post('/extract', async (c) => {
  try {
    const diagnosis = await cookieExtractor.diagnose();
    if (!diagnosis.available) {
      const errorMsg = diagnosis.hint ? `${diagnosis.error}\n\n提示: ${diagnosis.hint}` : diagnosis.error;
      return c.json(
        {
          ok: false,
          error: errorMsg,
          code: 'CHROME_NOT_CONNECTED',
        },
        400
      );
    }

    const result: ExtractResult = await cookieExtractor.extractAll();
    const rsshubSettings = await localIntegrationsService.getRsshubSettings();
    return c.json({
      ok: true,
      data: {
        total: result.total,
        success: result.success,
        failed: result.failed,
        results: result.results,
        settings: rsshubSettings.settings,
      },
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to extract cookies',
      },
      500
    );
  }
});

cookieRouter.get('/chrome', async (c) => {
  try {
    const diagnosis = await cookieExtractor.diagnose();
    return c.json({
      ok: true,
      data: diagnosis,
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to check Chrome connection',
      },
      500
    );
  }
});

cookieRouter.post('/weibo/start', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl : undefined;
    const session = await weiboLoginService.startSession(targetUrl);

    return c.json({
      ok: session.state !== 'failed',
      data: session,
      error: session.state === 'failed' ? session.error || session.message : undefined,
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to start Weibo login',
      },
      500
    );
  }
});

cookieRouter.get('/weibo/:sessionId/status', async (c) => {
  try {
    const session = await weiboLoginService.getSession(c.req.param('sessionId'));
    return c.json({
      ok: true,
      data: session,
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to read Weibo login status',
      },
      404
    );
  }
});

cookieRouter.post('/weibo/:sessionId/cancel', async (c) => {
  try {
    await weiboLoginService.cancelSession(c.req.param('sessionId'));
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to cancel Weibo login',
      },
      500
    );
  }
});

export default cookieRouter;
