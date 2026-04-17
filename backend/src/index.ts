import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { env } from './config/env.js';
import { checkConnection, closeConnection } from './db/client.js';
import { formatError, getStatusCode } from './middleware/error.js';
import { requestLogger } from './middleware/logger.js';
import { cronManager } from './services/cron.js';
import feedRouter from './routes/feed.js';
import sourcesRouter from './routes/sources.js';
import settingsRouter from './routes/settings.js';
import tagsRouter from './routes/tags.js';
import cookieRouter from './routes/cookie.js';
import wechatRouter from './routes/wechat.js';
import authRouter from './routes/auth.js';
import publicSourcesRouter from './routes/publicSources.js';
import favoritesRouter from './routes/favorites.js';
import { localIntegrationsService } from './services/localIntegrations.js';

function createApp(): Hono {
  const app = new Hono();

  app.use('*', requestLogger);
  app.use(
    '*',
    cors({
      origin:
        env.NODE_ENV === 'development'
          ? '*'
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    })
  );
  app.use('*', prettyJSON());

  // 静态文件服务 - 二维码图片
  app.use('/static/*', async (c) => {
    const filePath = join('static', c.req.path.replace('/static/', ''));
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
      };
      c.header('Content-Type', contentTypes[ext || ''] || 'application/octet-stream');
      return c.body(buffer);
    }
    return c.text('Not Found', 404);
  });

  app.get('/health', async (c) => {
    const dbHealthy = await checkConnection();
    return c.json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
    });
  });

  app.route('/api/feed', feedRouter);
  app.route('/api/sources', sourcesRouter);
  app.route('/api/settings', settingsRouter);
  app.route('/api/tags', tagsRouter);
  app.route('/api/cookie', cookieRouter);
  app.route('/api/wechat', wechatRouter);
  app.route('/api/auth', authRouter);
  app.route('/api/public-sources', publicSourcesRouter);
  app.route('/api/favorites', favoritesRouter);

  app.notFound(() => {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Route not found',
        code: 'NOT_FOUND',
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });

  app.onError((err) => {
    console.error('[Error]', err);
    return new Response(JSON.stringify(formatError(err)), {
      status: getStatusCode(err),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  return app;
}

async function startServer() {
  console.log('='.repeat(50));
  console.log('InfoHub backend');
  console.log('='.repeat(50));

  const dbHealthy = await checkConnection();
  if (!dbHealthy) {
    console.error('[Startup] Database connection failed');
    process.exit(1);
  }

  try {
    await localIntegrationsService.ensureRsshubRunning();
  } catch (error) {
    console.error('[Startup] Failed to ensure local RSSHub is running:', error);
  }
  localIntegrationsService.startWatchdog();

  const app = createApp();

  if (env.NODE_ENV !== 'test') {
    cronManager.start();
  }

  const port = Number(env.PORT);
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`[Server] Running at http://localhost:${info.port}`);
      console.log(`[Server] Health check http://localhost:${info.port}/health`);
      console.log('='.repeat(50));
    }
  );

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}, shutting down...`);
    cronManager.stop();
    localIntegrationsService.stopWatchdog();
    await closeConnection();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

startServer().catch((error) => {
  console.error('[Fatal]', error);
  process.exit(1);
});
