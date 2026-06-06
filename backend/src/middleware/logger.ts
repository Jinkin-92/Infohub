import type { Context, Next } from 'hono';

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  console.log(`[${requestId}] -> ${c.req.method} ${c.req.url}`);

  try {
    await next();
    console.log(`[${requestId}] <- ${c.res.status} (${Date.now() - start}ms)`);
  } catch (error) {
    console.error(`[${requestId}] !! ERROR (${Date.now() - start}ms)`, error);
    throw error;
  }
}

export function getRequestId(c: Context): string {
  return c.get('requestId') as string;
}
