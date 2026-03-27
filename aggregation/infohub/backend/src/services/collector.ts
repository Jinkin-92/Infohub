import Parser from 'rss-parser';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { itemsQueries, sourcesQueries } from '../db/queries.js';
import type { RSSItem, CollectionResult, Source } from '../types/index.js';
import { ServiceUnavailableError } from '../middleware/error.js';
import { env } from '../config/env.js';
import { bilibiliPublicCollector } from './bilibiliPublicCollector.js';

const execFileAsync = promisify(execFile);

export class Collector {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ['description', 'content:encoded', 'media:thumbnail', 'contentSnippet'],
      },
      timeout: 30000,
    });
  }

  async collectSource(sourceId: number): Promise<CollectionResult> {
    const startTime = Date.now();
    let sourceUrl = '';
    let source: Source | null = null;

    try {
      source = await sourcesQueries.getById(sourceId);
      if (!source) {
        throw new ServiceUnavailableError(`Source not found: ${sourceId}`);
      }
      sourceUrl = this.resolveSourceUrl(source);

      if (!source.enabled) {
        return { sourceId, success: true, itemCount: 0 };
      }

      if (this.isRecentlyFetched(source.last_fetched_at)) {
        console.log(`[Collector] Source ${sourceId} was fetched recently, skipping`);
        return { sourceId, success: true, itemCount: 0 };
      }

      await sourcesQueries.updateFetchedAt(sourceId);

      const items = await this.collectItems(source, sourceUrl);

      let successCount = 0;
      const batchSize = 100;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const processed = await this.processBatch(batch, sourceId, source.platform);
        successCount += processed;
      }

      await sourcesQueries.updateSuccess(sourceId);

      const duration = Date.now() - startTime;
      console.log(`[Collector] Source ${sourceId} collected ${successCount} items in ${duration}ms`);

      return {
        sourceId,
        success: true,
        itemCount: successCount,
      };
    } catch (error) {
      const errorMessage = this.toUserFacingError(source, sourceUrl, error);

      await sourcesQueries.updateError(sourceId, errorMessage);
      console.error(`[Collector] Source ${sourceId} collection failed:`, errorMessage);

      return {
        sourceId,
        success: false,
        itemCount: 0,
        error: errorMessage,
      };
    }
  }

  private toUserFacingError(source: Source | null, sourceUrl: string, error: unknown): string {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';

    if (source?.platform === 'bilibili') {
      if (/Chrome executable not found/i.test(rawMessage)) {
        return 'Bilibili public collection needs a local Chrome runtime. Install Chrome for Puppeteer or set backend/.env CHROME_EXECUTABLE_PATH.';
      }

      if (/public video list was not rendered/i.test(rawMessage)) {
        return 'Bilibili public video list could not be rendered. The space page may be rate-limited or the page structure changed.';
      }
    }

    if (source?.platform === 'x') {
      if (/cookie .* is not valid|auth_token/i.test(rawMessage)) {
        return 'X collection needs a valid auth_token in local RSSHub settings. Update the X / Twitter token and restart RSSHub.';
      }

      if (/Connect Timeout Error|fetch failed|ETIMEDOUT/i.test(rawMessage)) {
        return 'X collection could not reach x.com from the current network. Verify local connectivity to x.com:443 before retrying.';
      }
    }

    if (!sourceUrl) {
      return rawMessage;
    }

    let host = '';
    try {
      host = new URL(sourceUrl).hostname;
    } catch {
      return rawMessage;
    }

    if (/\/zhihu\//i.test(sourceUrl) && /(403 Forbidden|Status code 503)/i.test(rawMessage)) {
      return 'Zhihu public activity collection is currently blocked upstream. The MVP path stays cookie-free, so Zhihu is treated as an experimental source until a stable public collection method is verified.';
    }

    if (!host.includes('rsshub')) {
      return rawMessage;
    }

    if (
      /ETIMEDOUT|fetch failed|Request timed out|getaddrinfo|ENOTFOUND|ECONNRESET|ECONNREFUSED/i.test(rawMessage)
    ) {
      return `RSSHub instance unavailable: ${host}. Configure backend/.env RSSHUB_URL to a reachable self-hosted instance or mirror.`;
    }

    if (/Status code 403/i.test(rawMessage)) {
      return `RSSHub instance rejected this request: ${host}. Public instances may restrict access; use a self-hosted RSSHub instance.`;
    }

    if (/Status code 429/i.test(rawMessage)) {
      return `RSSHub instance rate-limited this request: ${host}. Please retry later or switch to a self-hosted instance.`;
    }

    if (/Status code 5\d{2}/i.test(rawMessage)) {
      return `RSSHub instance is temporarily unavailable: ${host} (${rawMessage}). Try again later or switch instances.`;
    }

    return rawMessage;
  }

  private resolveSourceUrl(source: Source): string {
    const sourceUrl = source.rss_url;
    if (!sourceUrl) {
      return sourceUrl;
    }

    if (source.platform === 'bilibili') {
      return source.input_url;
    }

    try {
      const current = new URL(sourceUrl);
      if (
        !current.pathname.startsWith('/zhihu/') &&
        !current.pathname.startsWith('/twitter/') &&
        !current.hostname.includes('rsshub')
      ) {
        return sourceUrl;
      }

      const preferred = new URL(env.RSSHUB_URL);
      if (!preferred.hostname) {
        return sourceUrl;
      }

      current.protocol = preferred.protocol;
      current.host = preferred.host;
      return current.toString();
    } catch {
      return sourceUrl;
    }
  }

  private async collectItems(source: Source, sourceUrl: string): Promise<RSSItem[]> {
    if (source.platform === 'bilibili') {
      return bilibiliPublicCollector.collectItems(source);
    }

    if (source.platform === 'youtube') {
      return this.collectYouTubeItems(sourceUrl);
    }

    if (this.isRsshubUrl(sourceUrl)) {
      return this.collectRsshubItems(sourceUrl);
    }

    const feed = await this.parser.parseURL(sourceUrl);
    return feed.items as RSSItem[];
  }

  private async collectYouTubeItems(sourceUrl: string): Promise<RSSItem[]> {
    try {
      const feed = await this.parser.parseURL(sourceUrl);
      return feed.items as RSSItem[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!/timed out|ETIMEDOUT|fetch failed|ECONNRESET/i.test(message)) {
        throw error;
      }
    }

    const { stdout } = await execFileAsync(
      'curl',
      ['-L', '--max-time', '30', '-A', 'Mozilla/5.0', sourceUrl],
      { maxBuffer: 8 * 1024 * 1024 }
    );

    if (!stdout.trim()) {
      return [];
    }

    const feed = await this.parser.parseString(stdout);
    return feed.items as RSSItem[];
  }

  private isRsshubUrl(sourceUrl: string): boolean {
    try {
      return new URL(sourceUrl).hostname.includes('rsshub') || new URL(sourceUrl).port === '1200';
    } catch {
      return false;
    }
  }

  private async collectRsshubItems(sourceUrl: string): Promise<RSSItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': 'InfoHub/1.0 (+local collector)',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9',
        },
      });

      if (!response.ok) {
        throw new Error(`Status code ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();
      if (!body.trim()) {
        return [];
      }

      if (contentType.includes('application/json') || body.trim().startsWith('{')) {
        return this.parseRsshubJson(body);
      }

      const feed = await this.parser.parseString(body);
      return feed.items as RSSItem[];
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseRsshubJson(body: string): RSSItem[] {
    const payload = JSON.parse(body) as {
      item?: Array<{
        title?: string;
        description?: string;
        link?: string;
        author?: string;
        pubDate?: string;
        date?: string;
        guid?: string;
      }>;
    };

    return (payload.item ?? []).map((item) => ({
      title: item.title,
      description: item.description,
      contentSnippet: item.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      link: item.link,
      guid: item.guid ?? item.link ?? item.title,
      author: item.author,
      pubDate: item.pubDate ?? item.date,
      isoDate: item.date ?? item.pubDate,
      content: item.description,
    }));
  }

  private async processBatch(items: RSSItem[], sourceId: number, platform: string): Promise<number> {
    let successCount = 0;

    for (const item of items) {
      try {
        const processedItem = this.processItem(item, sourceId, platform);
        if (processedItem) {
          await itemsQueries.upsert(processedItem);
          successCount++;
        }
      } catch (error) {
        console.error('[Collector] Failed to process item:', error);
      }
    }

    return successCount;
  }

  private processItem(
    item: RSSItem,
    sourceId: number,
    platform: string
  ): Record<string, unknown> | null {
    if (!item.title && !item.link) {
      return null;
    }

    const guid = item.guid || item.link || item.title || '';
    if (!guid) {
      return null;
    }

    if (platform === 'zhihu' && this.isZhihuVoteActivity(item)) {
      return null;
    }

    const publishedAt = this.parseDate(item.isoDate || item.pubDate).toISOString();
    const summary = this.extractSummary(item);
    const coverUrl = this.extractCover(item);

    return {
      source_id: sourceId,
      guid,
      title: item.title || 'Untitled',
      summary,
      url: item.link || '',
      author: item.creator || item.author || '',
      cover_url: coverUrl,
      platform,
      published_at: publishedAt,
      raw_json: item,
    };
  }

  private extractSummary(item: RSSItem): string {
    const content = item.contentSnippet || item.description || item.content || '';
    return content.replace(/<[^>]+>/g, '').trim().slice(0, 300);
  }

  private isZhihuVoteActivity(item: RSSItem): boolean {
    const text = [item.title, item.description, item.contentSnippet, item.content]
      .filter(Boolean)
      .join(' ');

    return text.includes('赞同了回答');
  }

  private extractCover(item: RSSItem): string | null {
    if (item['media:thumbnail']?.$?.url) {
      return item['media:thumbnail'].$.url;
    }

    if (item.enclosure?.url) {
      return item.enclosure.url;
    }

    return null;
  }

  private parseDate(dateString?: string): Date {
    if (!dateString) {
      return new Date();
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return new Date();
    }

    return date;
  }

  private isRecentlyFetched(lastFetchedAt: string | null): boolean {
    if (!lastFetchedAt) {
      return false;
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return new Date(lastFetchedAt).getTime() > fiveMinutesAgo;
  }
}

export const collector = new Collector();
