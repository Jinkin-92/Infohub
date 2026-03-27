import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RSSItem, Source } from '../types/index.js';

type BilibiliCard = {
  title: string;
  link: string;
  coverUrl: string | null;
  playCount: string | null;
  danmakuCount: string | null;
  duration: string | null;
  publishedLabel: string | null;
  author: string | null;
  empty: boolean;
};

const SCRIPT_TIMEOUT_MS = 90_000;

function normalizeBilibiliUrl(link: string): string {
  const normalized = link.startsWith('//') ? `https:${link}` : link;
  const url = new URL(normalized);
  url.search = '';
  return url.toString();
}

function buildSummary(card: BilibiliCard): string {
  const parts = ['B站视频'];
  if (card.playCount) {
    parts.push(`${card.playCount} 播放`);
  }
  if (card.danmakuCount) {
    parts.push(`${card.danmakuCount} 弹幕`);
  }
  if (card.duration) {
    parts.push(`时长 ${card.duration}`);
  }
  return parts.join(' · ');
}

function parseBilibiliDate(label: string | null, now = new Date()): Date {
  if (!label) {
    return now;
  }

  const text = label.trim();
  const hoursAgo = text.match(/^(\d+)\s*小时前$/);
  if (hoursAgo) {
    return new Date(now.getTime() - Number.parseInt(hoursAgo[1], 10) * 60 * 60 * 1000);
  }

  const daysAgo = text.match(/^(\d+)\s*天前$/);
  if (daysAgo) {
    return new Date(now.getTime() - Number.parseInt(daysAgo[1], 10) * 24 * 60 * 60 * 1000);
  }

  if (text === '昨天') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const monthDay = text.match(/^(\d{2})-(\d{2})$/);
  if (monthDay) {
    const date = new Date(now);
    date.setMonth(Number.parseInt(monthDay[1], 10) - 1, Number.parseInt(monthDay[2], 10));
    date.setHours(0, 0, 0, 0);
    if (date.getTime() > now.getTime()) {
      date.setFullYear(date.getFullYear() - 1);
    }
    return date;
  }

  const fullDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullDate) {
    return new Date(
      Number.parseInt(fullDate[1], 10),
      Number.parseInt(fullDate[2], 10) - 1,
      Number.parseInt(fullDate[3], 10)
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

async function runBilibiliScraper(uid: string): Promise<BilibiliCard[]> {
  const scriptPath = resolve(process.cwd(), 'scripts', 'fetch-bilibili-public.mjs');
  if (!existsSync(scriptPath)) {
    throw new Error(`Bilibili scraper script not found: ${scriptPath}`);
  }

  return new Promise<BilibiliCard[]>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath, uid], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error('Bilibili scraper timed out.'));
    }, SCRIPT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectPromise(new Error(stderr.trim() || `Bilibili scraper exited with code ${code}.`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as BilibiliCard[];
        resolvePromise(parsed);
      } catch (error) {
        rejectPromise(
          new Error(
            `Bilibili scraper returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`
          )
        );
      }
    });
  });
}

export async function collectBilibiliPublicItems(source: Source): Promise<RSSItem[]> {
  const uid = source.platform_id?.trim();
  if (!uid) {
    throw new Error('Bilibili source is missing platform_id.');
  }

  const cards = await runBilibiliScraper(uid);
  if (cards.length === 0) {
    return [];
  }

  if (cards.every((card) => card.empty)) {
    return [];
  }

  return cards.map((card) => {
    const link = normalizeBilibiliUrl(card.link);
    const guid = link.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? link;
    const publishedAt = parseBilibiliDate(card.publishedLabel).toISOString();
    const summary = buildSummary(card);

    return {
      title: card.title,
      link,
      guid,
      author: card.author ?? source.name,
      isoDate: publishedAt,
      description: summary,
      contentSnippet: summary,
      enclosure: card.coverUrl
        ? {
            url: card.coverUrl.startsWith('//') ? `https:${card.coverUrl}` : card.coverUrl,
            type: 'image/webp',
            length: '0',
          }
        : undefined,
    };
  });
}

export const bilibiliPublicCollector = {
  collectItems: collectBilibiliPublicItems,
  parseBilibiliDate,
};
