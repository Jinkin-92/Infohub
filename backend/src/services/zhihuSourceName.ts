function extractZhihuNameFromFeedTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  const patterns = [
    /^(.+?)的知乎动态$/,
    /^(.+?)\s*的知乎动态$/,
    /^(.+?)\s*-\s*知乎$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

export async function resolveZhihuSourceName(
  feedUrl: string,
  fallbackPlatformId?: string | null
): Promise<string | null> {
  try {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'user-agent': 'InfoHub/1.0 (+zhihu source name resolver)',
      },
    });

    if (!response.ok) {
      return fallbackPlatformId?.trim() || null;
    }

    const text = await response.text();
    const body = text.trim();
    if (!body) {
      return fallbackPlatformId?.trim() || null;
    }

    let feedTitle = '';

    if (body.startsWith('{')) {
      try {
        const json = JSON.parse(body) as { title?: string };
        feedTitle = json.title?.trim() || '';
      } catch {
        // Ignore invalid JSON and fall through to XML parsing.
      }
    }

    if (!feedTitle) {
      const titleMatch = body.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/i);
      feedTitle = titleMatch?.[1]?.trim() || '';
    }

    return extractZhihuNameFromFeedTitle(feedTitle) || fallbackPlatformId?.trim() || null;
  } catch {
    return fallbackPlatformId?.trim() || null;
  }
}
