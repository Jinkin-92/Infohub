/**
 * Cookie API 路由
 *
 * 提供 Cookie 提取和状态查询接口
 */

import { Hono } from 'hono';
import { cookieExtractor, type ExtractResult } from '../services/cookieExtractor.js';
import { localIntegrationsService } from '../services/localIntegrations.js';

const cookieRouter = new Hono();

// Cookie 平台状态
interface PlatformStatus {
  platform: string;
  key: string;
  url: string;
  configured: boolean;
  loggedIn: boolean;
}

// GET /api/cookie/status - 获取各平台 Cookie 状态
cookieRouter.get('/status', async (c) => {
  try {
    // 获取当前 rsshub 配置
    const rsshubSettings = await localIntegrationsService.getRsshubSettings();

    // 获取 Chrome 连接状态
    const chromeStatus = await cookieExtractor.checkConnection();

    // 平台列表
    const platforms: PlatformStatus[] = [
      { platform: '知乎', key: 'ZHIHU_COOKIES', url: 'https://www.zhihu.com/', configured: false, loggedIn: false },
      { platform: '微博', key: 'WEIBO_COOKIES', url: 'https://weibo.com/', configured: false, loggedIn: false },
      { platform: '小红书', key: 'XIAOHONGSHU_COOKIE', url: 'https://www.xiaohongshu.com/', configured: false, loggedIn: false },
      { platform: '豆瓣', key: 'DOUBAN_COOKIE', url: 'https://www.douban.com/', configured: false, loggedIn: false },
      { platform: 'X/Twitter', key: 'TWITTER_AUTH_TOKEN', url: 'https://x.com/', configured: false, loggedIn: false },
    ];

    // 检查配置状态
    for (const setting of rsshubSettings.settings) {
      const platform = platforms.find((p) => p.key === setting.key);
      if (platform) {
        platform.configured = setting.configured;
      }
    }

    return c.json({
      ok: true,
      data: {
        chromeConnected: chromeStatus.connected,
        chromePort: chromeStatus.port,
        chromeError: chromeStatus.error,
        platforms,
      },
    });
  } catch (error) {
    console.error('[Cookie API] Status error:', error);
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to get cookie status',
      },
      500
    );
  }
});

// POST /api/cookie/extract - 提取并保存 Cookie
cookieRouter.post('/extract', async (c) => {
  try {
    // 检查 Chrome 连接
    const chromeStatus = await cookieExtractor.checkConnection();
    if (!chromeStatus.connected) {
      return c.json(
        {
          ok: false,
          error: `Chrome remote debugging not connected. Please enable remote debugging at chrome://inspect/#remote-debugging (currently trying port ${chromeStatus.port})`,
          code: 'CHROME_NOT_CONNECTED',
        },
        400
      );
    }

    // 执行提取
    const result: ExtractResult = await cookieExtractor.extractAll();

    // 获取更新后的状态
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
    console.error('[Cookie API] Extract error:', error);
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to extract cookies',
      },
      500
    );
  }
});

// GET /api/cookie/chrome - 检查 Chrome 连接状态
cookieRouter.get('/chrome', async (c) => {
  try {
    const status = await cookieExtractor.checkConnection();
    return c.json({
      ok: true,
      data: status,
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

export default cookieRouter;
