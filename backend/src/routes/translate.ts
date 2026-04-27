import { Hono } from 'hono';

const translateRouter = new Hono();

translateRouter.post('/', async (c) => {
  const { text, from = 'zh-CN', to = 'en' } = await c.req.json<{
    text: string;
    from?: string;
    to?: string;
  }>();

  if (!text || typeof text !== 'string') {
    return c.json({ ok: false, error: 'text is required' }, 400);
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

    return c.json({
      ok: true,
      translatedText: data.responseData.translatedText,
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
