import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import Parser from 'rss-parser';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const dbPath = resolve(repoRoot, 'data', 'infohub_v2.db');
const reportPath = resolve(repoRoot, 'data', 'public-source-audit.json');
const parser = new Parser({ timeout: 20000 });
const now = Date.now();
const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

function classifyWechat(source) {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    platform: source.platform,
    rss_url: source.rss_url,
    status: 'incompatible',
    latest_item_at: null,
    item_count: 0,
    reason: 'Current product uses the built-in local WeChat collector; public external WeChat RSS presets are not compatible.',
  };
}

function parseDate(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getLatestDate(items) {
  let latest = null;

  for (const item of items) {
    const candidate =
      parseDate(item.isoDate) ??
      parseDate(item.pubDate) ??
      parseDate(item.published) ??
      parseDate(item.updated);

    if (!candidate) {
      continue;
    }

    if (!latest || candidate.getTime() > latest.getTime()) {
      latest = candidate;
    }
  }

  return latest;
}

async function fetchFeedBody(url) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '-L',
      '--max-time',
      '20',
      '--connect-timeout',
      '10',
      '-A',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      '-H',
      'Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      url,
    ],
    {
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }
  );

  return stdout;
}

async function auditSource(source) {
  if (source.platform === 'wechat') {
    return classifyWechat(source);
  }

  try {
    const body = await fetchFeedBody(source.rss_url);
    const trimmed = body.trim();

    if (!trimmed) {
      return {
        ...source,
        status: 'invalid',
        latest_item_at: null,
        item_count: 0,
        reason: 'Feed response body is empty.',
      };
    }

    if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return {
        ...source,
        status: 'invalid',
        latest_item_at: null,
        item_count: 0,
        reason: 'URL returned HTML instead of RSS/Atom.',
      };
    }

    const feed = await parser.parseString(trimmed);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const latest = getLatestDate(items);

    if (!latest) {
      return {
        ...source,
        status: 'invalid',
        latest_item_at: null,
        item_count: items.length,
        reason: 'Feed is readable, but none of the items expose a valid publish date.',
      };
    }

    if (latest.getTime() < thirtyDaysAgo) {
      return {
        ...source,
        status: 'stale',
        latest_item_at: latest.toISOString(),
        item_count: items.length,
        reason: 'Latest item is older than 30 days.',
      };
    }

    return {
      ...source,
      status: 'valid',
      latest_item_at: latest.toISOString(),
      item_count: items.length,
      reason: 'Feed is reachable and has updates within 30 days.',
    };
  } catch (error) {
    return {
      ...source,
      status: 'invalid',
      latest_item_at: null,
      item_count: 0,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function main() {
  const db = new Database(dbPath, { readonly: true });
  const sources = db
    .prepare(
      `SELECT id, name, url, rss_url, platform, category, enabled, subscribed_count
       FROM public_sources
       ORDER BY id ASC`
    )
    .all();

  const results = [];
  for (const source of sources) {
    results.push(await auditSource(source));
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total: results.length,
    valid: results.filter((row) => row.status === 'valid').length,
    stale: results.filter((row) => row.status === 'stale').length,
    invalid: results.filter((row) => row.status === 'invalid').length,
    incompatible: results.filter((row) => row.status === 'incompatible').length,
  };

  await writeFile(reportPath, JSON.stringify({ summary, results }, null, 2), 'utf8');
  console.log(JSON.stringify({ summary, reportPath }, null, 2));
}

await main();
