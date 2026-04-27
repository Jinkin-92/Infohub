import Parser from 'rss-parser';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { itemsQueries, sourcesQueries } from '../db/queries.js';
import type { RSSItem, CollectionResult, Source } from '../types/index.js';
import { ServiceUnavailableError } from '../middleware/error.js';
import { env } from '../config/env.js';
import { bilibiliPublicCollector } from './bilibiliPublicCollector.js';
import { weChatArticleCollector } from './wechat/index.js';
import { sql } from '../db/client.js';
import { weiboBrowserCollector } from './weiboBrowserCollector.js';
import { weiboHttpCollector } from './weiboHttpCollector.js';
import { weiboProfileStore } from './weiboProfileStore.js';
import { xBrowserCollector } from './xBrowserCollector.js';
import { xCancelCollector } from './xCancelCollector.js';
import { urlDetector } from './urlDetector.js';
import { youtubePublicCollector } from './youtubePublicCollector.js';
import { resolveZhihuSourceName } from './zhihuSourceName.js';
import { zhihuBrowserCollector } from './zhihuBrowserCollector.js';

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

  async collectSource(sourceId: number, options: { force?: boolean } = {}): Promise<CollectionResult> {
    const startTime = Date.now();
    let sourceUrl = '';
    let source: Source | null = null;
    const force = options.force === true;

    try {
      source = await sourcesQueries.getById(sourceId);
      if (!source) {
        throw new ServiceUnavailableError(`Source not found: ${sourceId}`);
      }
      source = await this.maybeRepairWeChatSource(source);
      source = await this.maybeRepairKnownPublicSource(source);
      sourceUrl = this.resolveSourceUrl(source);
      source = await this.maybeRepairZhihuSource(source, sourceUrl);
      sourceUrl = this.resolveSourceUrl(source);

      if (!source.enabled) {
        return { sourceId, success: true, itemCount: 0 };
      }

      if (!force && this.isRecentlyFetched(source.last_fetched_at)) {
        console.log(`[Collector] Source ${sourceId} was fetched recently, skipping`);
        return { sourceId, success: true, itemCount: 0, skipped: true };
      }

      if (source.platform === 'wechat' && !source.is_public) {
        const fakerId = await this.ensureWeChatSourceConfigured(source);
        await sourcesQueries.updateFetchedAt(sourceId);
        const count = await weChatArticleCollector.collectAndStore(fakerId, source.id);
        await sourcesQueries.updateSuccess(sourceId);

        const duration = Date.now() - startTime;
        console.log(`[Collector] WeChat source ${sourceId} collected ${count} items in ${duration}ms`);

        return {
          sourceId,
          success: true,
          itemCount: count,
        };
      }

      await sourcesQueries.updateFetchedAt(sourceId);

      const items = await this.collectItems(source, sourceUrl);

      // Bilibili: 用抓取到的作者名更新源显示名称
      if (source.platform === 'bilibili' && items.length > 0) {
        const authorName = items[0].author;
        if (authorName && source.name !== authorName) {
          await sourcesQueries.update(sourceId, { name: authorName });
          console.log(`[Collector] Bilibili source ${sourceId} name updated to "${authorName}"`);
        }
      }

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

      if (/public video list was not rendered|风控|request was banned|请求过于频繁|Precondition Failed|-412|-799/i.test(rawMessage)) {
        return 'Bilibili public collection is currently blocked by platform anti-crawler checks on this network. This is not a login/config problem; retry later or switch to a logged-in collector path.';
      }
    }

    if (source?.platform === 'x') {
      if (/auth_token|ct0|credential is missing/i.test(rawMessage)) {
        return 'X collection needs a valid local login token. Reconnect X / Twitter in platform settings and test again.';
      }

      if (/did not render any posts|opened the profile but no posts were rendered/i.test(rawMessage)) {
        return 'X login is saved, but the current session did not render the timeline. Re-test the X connection and re-login if the timeline stays empty.';
      }

      if (/Connect Timeout Error|fetch failed|ETIMEDOUT|Navigation timeout/i.test(rawMessage)) {
        return 'X collection could not load the profile page in time. Check local connectivity to x.com and any required proxy settings.';
      }
    }

    if (source?.platform === 'wechat') {
      if (/stale duplicate of source/i.test(rawMessage)) {
        return 'This WeChat source is an old duplicate of another existing subscription. Remove the stale duplicate and keep the working source.';
      }

      if (/has no faker_id|Could not resolve WeChat fakeid|appmsgpublish failed|invalid session/i.test(rawMessage)) {
        return 'This WeChat source could not be refreshed by the built-in collector. Reconnect the WeChat platform and re-parse the article link to bind a valid公众号.';
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
      const isRsshubLikeUrl = current.hostname.includes('rsshub') || current.port === '1200';
      if (!isRsshubLikeUrl) {
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

  private async maybeRepairWeChatSource(source: Source): Promise<Source> {
    if (source.platform !== 'wechat') {
      return source;
    }

    const normalizedSourceId = this.resolveWeChatFakeIdFromSource(source);
    const localFeedUrl = this.buildLocalWechatFeedUrl(source.id);
    const needsRepair =
      !normalizedSourceId ||
      !source.rss_url ||
      source.rss_url !== localFeedUrl ||
      source.rss_url.includes('/wechat/csm/') ||
      /localhost:8001\/feed\/MP_WXS_/i.test(source.rss_url) ||
      source.platform_id !== normalizedSourceId ||
      source.status === 'error';

    if (!needsRepair) {
      return source;
    }

    try {
      let nextPlatformId = normalizedSourceId;
      let nextName = source.name;

      if (!nextPlatformId && source.input_url.includes('mp.weixin.qq.com')) {
        const detected = await urlDetector.detect(source.input_url);
        if (detected.platform !== 'wechat' || !detected.platformId) {
          return source;
        }
        nextPlatformId = detected.platformId;
        nextName = detected.displayName || source.name;
      }

      if (!nextPlatformId) {
        return source;
      }

      const nextRssUrl = localFeedUrl;

      const changed =
        source.platform_id !== nextPlatformId ||
        source.rss_url !== nextRssUrl ||
        source.name !== nextName;

      if (!changed) {
        return source;
      }

      const duplicate = await sql.get<{ id: number; name: string }>(
        'SELECT id, name FROM sources WHERE platform = ? AND platform_id = ? AND id != ?',
        ['wechat', nextPlatformId, source.id]
      );

      if (duplicate) {
        throw new Error(
          `WeChat source ${source.id} is a stale duplicate of source ${duplicate.id} (${duplicate.name})`
        );
      }

      await sql.execute(
        `UPDATE sources
         SET name = ?, rss_url = ?, platform_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextName, nextRssUrl, nextPlatformId, source.id]
      );

      const existingWechatExt = await sql.get<{ source_id: number }>(
        'SELECT source_id FROM sources_wechat_ext WHERE source_id = ?',
        [source.id]
      );

      if (existingWechatExt) {
        await sql.execute(
          'UPDATE sources_wechat_ext SET faker_id = ? WHERE source_id = ?',
          [nextPlatformId, source.id]
        );
      } else {
        await sql.execute(
          'INSERT INTO sources_wechat_ext (source_id, faker_id) VALUES (?, ?)',
          [source.id, nextPlatformId]
        );
      }

      await this.syncWeChatAccountRecord(source.id, nextPlatformId, nextName);

      const repaired = await sourcesQueries.getById(source.id);
      return repaired ?? source;
    } catch (error) {
      if (error instanceof Error && /stale duplicate of source/i.test(error.message)) {
        throw error;
      }

      console.warn(`[Collector] Failed to repair WeChat source ${source.id}:`, error);
      return source;
    }
  }

  private async maybeRepairZhihuSource(source: Source, sourceUrl: string): Promise<Source> {
    if (source.platform !== 'zhihu' || !source.platform_id) {
      return source;
    }

    const currentName = source.name?.trim() || '';
    const looksLikeFallbackName =
      !currentName ||
      currentName === source.platform_id ||
      currentName === `Zhihu · ${source.platform_id}` ||
      currentName === `知乎 · ${source.platform_id}`;

    if (!looksLikeFallbackName) {
      return source;
    }

    const resolvedName = await resolveZhihuSourceName(sourceUrl, source.platform_id);
    if (!resolvedName || resolvedName === currentName) {
      return source;
    }

    const updated = await sourcesQueries.update(source.id, { name: resolvedName });
    return updated ?? source;
  }

  private async maybeRepairKnownPublicSource(source: Source): Promise<Source> {
    if (!source.is_public) {
      return source;
    }

    if (source.public_source_id) {
      const publicSourceMeta = await sql.get<{ enabled: number }>(
        'SELECT enabled FROM public_sources WHERE id = ?',
        [source.public_source_id]
      );

      if (publicSourceMeta && Number(publicSourceMeta.enabled) === 0 && source.enabled) {
        await sql.execute(
          `UPDATE sources
           SET enabled = 0, status = 'disabled', last_error = NULL, last_error_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [source.id]
        );

        const disabled = await sourcesQueries.getById(source.id);
        return disabled ?? { ...source, enabled: false, status: 'disabled', last_error: null, last_error_at: null };
      }
    }

    let patch: Partial<Source> | null = null;
    let publicPatch: Record<string, string> | null = null;

    if (/^https:\/\/www\.zhihu\.com\/rss\/?$/i.test(source.rss_url) || /^https:\/\/www\.zhihu\.com\/rss\/?$/i.test(source.input_url)) {
      const rsshubDailyUrl = `${env.RSSHUB_URL.replace(/\/$/, '')}/zhihu/daily`;
      patch = {
        input_url: 'https://daily.zhihu.com',
        rss_url: rsshubDailyUrl,
      };
      publicPatch = {
        url: 'https://daily.zhihu.com',
        rss_url: rsshubDailyUrl,
      };
    } else if (/https:\/\/www\.v2ex\.com\/feed\/tab\/hot\.xml/i.test(source.rss_url) || /https:\/\/www\.v2ex\.com\/feed\/tab\/hot\.xml/i.test(source.input_url)) {
      patch = {
        name: 'V2EX 最新',
        platform: 'custom',
        input_url: 'https://www.v2ex.com/index.xml',
        rss_url: 'https://www.v2ex.com/index.xml',
      };
      publicPatch = {
        name: 'V2EX 最新',
        platform: 'custom',
        url: 'https://www.v2ex.com/index.xml',
        rss_url: 'https://www.v2ex.com/index.xml',
      };
    }

    if (!patch) {
      return source;
    }

    const sourceFields = Object.keys(patch);
    const sourceValues = Object.values(patch);
    await sql.execute(
      `UPDATE sources SET ${sourceFields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...sourceValues, source.id]
    );

    if (source.public_source_id && publicPatch) {
      const fields = Object.keys(publicPatch);
      const values = Object.values(publicPatch);
      await sql.execute(
        `UPDATE public_sources SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...values, source.public_source_id]
      );
    }

    const updated = await sourcesQueries.getById(source.id);
    return updated ?? source;
  }

  private async ensureWeChatSourceConfigured(source: Source): Promise<string> {
    const existingWechatExt = await sql.get<{ faker_id: string }>(
      'SELECT faker_id FROM sources_wechat_ext WHERE source_id = ?',
      [source.id]
    );

    const fakerId = this.normalizeWeChatFakeId(existingWechatExt?.faker_id) || this.resolveWeChatFakeIdFromSource(source);
    if (!fakerId) {
      throw new Error(`Could not resolve WeChat fakeid for source ${source.id}`);
    }

    if (existingWechatExt) {
      await sql.execute(
        'UPDATE sources_wechat_ext SET faker_id = ?, updated_at = CURRENT_TIMESTAMP WHERE source_id = ?',
        [fakerId, source.id]
      );
    } else {
      await sql.execute(
        'INSERT INTO sources_wechat_ext (source_id, faker_id) VALUES (?, ?)',
        [source.id, fakerId]
      );
    }

    if (source.platform_id !== fakerId || source.rss_url !== this.buildLocalWechatFeedUrl(source.id)) {
      await sql.execute(
        `UPDATE sources
         SET platform_id = ?, rss_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [fakerId, this.buildLocalWechatFeedUrl(source.id), source.id]
      );
    }

    await this.syncWeChatAccountRecord(source.id, fakerId, source.name);
    return fakerId;
  }

  private async syncWeChatAccountRecord(sourceId: number, fakerId: string, sourceName: string): Promise<void> {
    const accountId = `MP_WXS_${fakerId}`;
    const accountName = sourceName.trim() || `微信公众号 ${fakerId}`;
    const sourceMeta = await sql.get<{ mp_cover: string | null }>(
      'SELECT mp_cover FROM sources_wechat_ext WHERE source_id = ?',
      [sourceId]
    );

    await sql.execute(
      `INSERT OR IGNORE INTO wechat_accounts (id, mp_name, mp_cover, faker_id, status)
       VALUES (?, ?, ?, ?, 1)`,
      [accountId, accountName, sourceMeta?.mp_cover ?? null, fakerId]
    );

    await sql.execute(
      `UPDATE wechat_accounts
       SET mp_name = ?, mp_cover = COALESCE(?, mp_cover), faker_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [accountName, sourceMeta?.mp_cover ?? null, fakerId, accountId]
    );
  }

  private resolveWeChatFakeIdFromSource(source: Source): string | null {
    return (
      this.normalizeWeChatFakeId(source.platform_id) ||
      this.normalizeWeChatFakeId(source.rss_url) ||
      this.normalizeWeChatFakeId(source.input_url)
    );
  }

  private normalizeWeChatFakeId(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    const prefixedMatch = trimmed.match(/MP_WXS_(\d+)/i);
    if (prefixedMatch) {
      return prefixedMatch[1];
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      if (/^\d+$/.test(decoded)) {
        return decoded;
      }
    } catch {
      return null;
    }

    return null;
  }

  private buildLocalWechatFeedUrl(sourceId: number): string {
    return `http://localhost:${env.PORT}/api/feed/wechat/${sourceId}`;
  }

  private async collectItems(source: Source, sourceUrl: string): Promise<RSSItem[]> {
    if (source.is_public) {
      if (this.isRsshubUrl(sourceUrl)) {
        return this.collectRsshubItems(sourceUrl);
      }
      return this.collectStandardFeedItems(sourceUrl);
    }

    if (source.platform === 'bilibili') {
      const { items } = await bilibiliPublicCollector.collectItems(source);
      return items;
    }

    if (source.platform === 'x') {
      try {
        return await xCancelCollector.collectItems(source);
      } catch (error) {
        console.warn(
          `[Collector] XCancel collector failed for source ${source.id}, falling back to browser collector:`,
          error instanceof Error ? error.message : error
        );
        return xBrowserCollector.collectItems(source);
      }
    }

    if (source.platform === 'weibo') {
      if (env.WEIBO_COLLECTOR_MODE === 'browser' || weiboProfileStore.hasActiveProfile()) {
        return weiboBrowserCollector.collectItems(source);
      }
      return weiboHttpCollector.collectItems(source);
    }

    if (source.platform === 'zhihu') {
      return zhihuBrowserCollector.collectItems(source);
    }

    if (source.platform === 'youtube') {
      return this.collectYouTubeItems(source, sourceUrl);
    }

    if (this.isRsshubUrl(sourceUrl)) {
      return this.collectRsshubItems(sourceUrl);
    }

    return this.collectStandardFeedItems(sourceUrl);
  }

  private async collectStandardFeedItems(sourceUrl: string): Promise<RSSItem[]> {
    try {
      const feed = await this.parser.parseURL(sourceUrl);
      return feed.items as RSSItem[];
    } catch (error) {
      // Fall through to raw fetch parsing below. Many public feeds now return
      // empty bodies, malformed XML, or anti-bot HTML that parseURL cannot handle.
    }

    const { stdout } = await execFileAsync(
      'curl',
      ['-L', '--max-time', '30', '-A', 'Mozilla/5.0', sourceUrl],
      { maxBuffer: 8 * 1024 * 1024 }
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }

    if (/\.well-known\/sgcaptcha|SG-Captcha|<meta[^>]+refresh/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
      return [];
    }

    if (trimmed.startsWith('{')) {
      return this.parseRsshubJson(trimmed);
    }

    const feed = await this.parser.parseString(trimmed);
    return feed.items as RSSItem[];
  }

  private async collectYouTubeItems(source: Source, sourceUrl: string): Promise<RSSItem[]> {
    try {
      const feed = await this.parser.parseURL(sourceUrl);
      return feed.items as RSSItem[];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!/timed out|ETIMEDOUT|fetch failed|ECONNRESET|Status code 404|Status code 500/i.test(message)) {
        throw error;
      }
    }

    try {
      const { stdout } = await execFileAsync(
        'curl',
        ['-L', '--max-time', '30', '-A', 'Mozilla/5.0', sourceUrl],
        { maxBuffer: 8 * 1024 * 1024 }
      );

      if (stdout.trim()) {
        const feed = await this.parser.parseString(stdout);
        return feed.items as RSSItem[];
      }
    } catch {
      // Fall through to the public page collector below.
    }

    return youtubePublicCollector.collectItems(source);
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

    const guid = this.normalizeGuid(item, platform);
    if (!guid) {
      return null;
    }

    if (platform === 'zhihu' && this.isZhihuVoteActivity(item)) {
      return null;
    }

    const publishedAt = this.parseDate(item.isoDate || item.pubDate);
    if (!publishedAt) {
      return null;
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (publishedAt < thirtyDaysAgo) {
      return null; // 跳过 30 天前的旧内容
    }

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
      published_at: publishedAt.toISOString(),
      raw_json: item,
    };
  }

  private extractSummary(item: RSSItem): string {
    const content = item.contentSnippet || item.description || item.content || '';
    return content.replace(/<[^>]+>/g, '').trim().slice(0, 300);
  }

  private normalizeGuid(item: RSSItem, platform: string): string {
    const fallback = item.guid || item.link || item.title || '';
    if (platform !== 'youtube') {
      return fallback;
    }

    const candidate = item.link || item.guid || '';
    const watchMatch = candidate.match(/[?&]v=([^&#]+)/i);
    if (watchMatch?.[1]) {
      return watchMatch[1];
    }

    const shortsMatch = candidate.match(/\/shorts\/([^/?#]+)/i);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }

    return fallback;
  }

  private isZhihuVoteActivity(item: RSSItem): boolean {
    const text = [item.title, item.description, item.contentSnippet, item.content]
      .filter(Boolean)
      .join(' ');

    const voteKeywords = [
      '赞同了文章',
      '赞同了回答',
      '赞同了想法',
      '收藏了文章',
      '收藏了回答',
      '收藏了想法',
      '点赞了',
      '分享了',
      '关注了',
    ];

    return voteKeywords.some((keyword) => text.includes(keyword));
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

  private parseDate(dateString?: string): Date | null {
    if (!dateString) {
      return new Date();
    }

    const normalized = dateString.trim();
    const shanghaiMatch = normalized.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (shanghaiMatch) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = shanghaiMatch;
      const isoLike = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second.padStart(2, '0')}+08:00`;
      const shanghaiDate = new Date(isoLike);
      if (!Number.isNaN(shanghaiDate.getTime())) {
        return shanghaiDate;
      }
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
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
