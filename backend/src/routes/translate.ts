import { Hono } from 'hono';

const translateRouter = new Hono();

// 简单的内存缓存，避免重复翻译相同文本
const translationCache = new Map<string, { text: string; expiresAt: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1小时
const MAX_CACHE_SIZE = 500;

function getCacheKey(text: string, from: string, to: string): string {
  return `${from}:${to}:${text}`;
}

function getCachedTranslation(text: string, from: string, to: string): string | null {
  const key = getCacheKey(text, from, to);
  const cached = translationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.text;
  }
  return null;
}

function setCachedTranslation(text: string, from: string, to: string, translatedText: string): void {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    // 清理过期项
    for (const [k, v] of translationCache) {
      if (v.expiresAt <= Date.now()) {
        translationCache.delete(k);
      }
    }
    // 仍然满则清理最旧的
    if (translationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
  }
  const key = getCacheKey(text, from, to);
  translationCache.set(key, { text: translatedText, expiresAt: Date.now() + CACHE_TTL });
}

translateRouter.post('/', async (c) => {
  const { text, from = 'zh-CN', to = 'en' } = await c.req.json<{
    text: string;
    from?: string;
    to?: string;
  }>();

  if (!text || typeof text !== 'string') {
    return c.json({ ok: false, error: 'text is required' }, 400);
  }

  // 检查缓存
  const cached = getCachedTranslation(text, from, to);
  if (cached) {
    return c.json({ ok: true, translatedText: cached, cached: true });
  }

  try {
    const langpair = `${from}|${to}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const data = await response.json() as {
      responseStatus: number;
      responseData: {
        translatedText: string;
      };
      responseDetails?: string;
    };

    if (data.responseStatus !== 200) {
      throw new Error(data.responseDetails || 'Translation failed');
    }

    const translatedText = data.responseData.translatedText;
    // 缓存结果
    setCachedTranslation(text, from, to, translatedText);

    return c.json({
      ok: true,
      translatedText,
    });
  } catch (error) {
    console.error('[Translate] Error:', error);
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Translation failed',
    }, 500);
  }
});

export default translateRouter;
