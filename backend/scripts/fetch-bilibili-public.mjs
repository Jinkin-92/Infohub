import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const uid = process.argv[2];

if (!uid) {
  console.error('Missing Bilibili uid');
  process.exit(1);
}

function resolveChromeExecutablePath() {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const commonWindowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application', 'chrome.exe'),
  ].filter(Boolean);

  for (const candidate of commonWindowsPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const cacheRoot = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (!existsSync(cacheRoot)) {
    throw new Error(
      'Chrome executable not found. Set backend/.env CHROME_EXECUTABLE_PATH or install Chrome via `npx puppeteer browsers install chrome`.'
    );
  }

  const versions = readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('win64-'))
    .map((entry) => ({
      name: entry.name,
      path: join(cacheRoot, entry.name, 'chrome-win64', 'chrome.exe'),
    }))
    .filter((entry) => existsSync(entry.path))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

  if (!versions[0]?.path) {
    throw new Error(
      'Chrome executable not found. Set backend/.env CHROME_EXECUTABLE_PATH or install Chrome via `npx puppeteer browsers install chrome`.'
    );
  }

  return versions[0].path;
}

function normalizeAuthorName(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function extractCardsFromSpacePage(page) {
  return page.evaluate(() => {
    const author =
      document.querySelector('.h-name')?.textContent?.trim() ||
      document.querySelector('.up-name')?.textContent?.trim() ||
      document.querySelector('.nickname')?.textContent?.trim() ||
      document.title.split('投稿视频')[0]?.trim() ||
      null;

    const empty = document.body.innerText.includes('空间主人还没投过视频');

    return Array.from(document.querySelectorAll('.bili-video-card'))
      .map((card) => {
        const coverLink = card.querySelector('.bili-cover-card');
        const titleLink = card.querySelector('.bili-video-card__title a');
        const stats = Array.from(card.querySelectorAll('.bili-cover-card__stat span')).map((node) =>
          node.textContent?.trim() ?? ''
        );

        return {
          title: titleLink?.textContent?.trim() || titleLink?.getAttribute('title')?.trim() || '',
          link: titleLink?.getAttribute('href') || coverLink?.getAttribute('href') || '',
          coverUrl: coverLink?.querySelector('img')?.getAttribute('src') ?? null,
          playCount: stats[0] || null,
          danmakuCount: stats[1] || null,
          duration: stats[2] || null,
          publishedLabel: card.querySelector('.bili-video-card__subtitle span')?.textContent?.trim() ?? null,
          author,
          empty,
        };
      })
      .filter((card) => card.title && card.link);
  });
}

async function extractCardsFromSearchPage(page, targetUid, targetAuthor) {
  return page.evaluate((uidValue, authorName) => {
    const normalizedTargetAuthor = (authorName || '').replace(/\s+/g, ' ').trim();

    return Array.from(document.querySelectorAll('.bili-video-card'))
      .map((card) => {
        const coverLink = card.querySelector('.bili-video-card__wrap > a');
        const infoLink = card.querySelector('.bili-video-card__info a[href*="/video/"]');
        const titleNode = card.querySelector('.bili-video-card__info--tit');
        const ownerNode = card.querySelector('.bili-video-card__info--owner');
        const ownerHref = ownerNode?.getAttribute('href') || '';
        const author = ownerNode?.querySelector('.bili-video-card__info--author')?.textContent?.trim() || null;
        const stats = Array.from(card.querySelectorAll('.bili-video-card__stats--item span:last-child')).map((node) =>
          node.textContent?.trim() ?? ''
        );

        const matchesOwner =
          ownerHref.includes(`/space.bilibili.com/${uidValue}`) ||
          ownerHref.includes(`space.bilibili.com/${uidValue}`) ||
          ((author || '').replace(/\s+/g, ' ').trim() === normalizedTargetAuthor && normalizedTargetAuthor.length > 0);

        return {
          matchesOwner,
          title:
            titleNode?.textContent?.trim() ||
            titleNode?.getAttribute('title')?.trim() ||
            '',
          link: infoLink?.getAttribute('href') || coverLink?.getAttribute('href') || '',
          coverUrl:
            card.querySelector('.bili-video-card__cover img')?.getAttribute('src') ||
            card.querySelector('.bili-video-card__cover source[type="image/webp"]')?.getAttribute('srcset') ||
            null,
          playCount: stats[0] || null,
          danmakuCount: stats[1] || null,
          duration: card.querySelector('.bili-video-card__stats__duration')?.textContent?.trim() || null,
          publishedLabel: ownerNode?.querySelector('.bili-video-card__info--date')?.textContent?.trim() || null,
          author,
          empty: false,
        };
      })
      .filter((card) => card.matchesOwner && card.title && card.link);
  }, targetUid, targetAuthor);
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: resolveChromeExecutablePath(),
  args: ['--disable-dev-shm-usage', '--no-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1440, height: 1200 });

  await page.goto(`https://space.bilibili.com/${uid}/video`, {
    waitUntil: 'networkidle2',
    timeout: 45000,
  });

  const foundCards = await page
    .waitForSelector('.bili-video-card__title a', { timeout: 45000 })
    .then(() => true)
    .catch(() => false);

  const emptyState = await page
    .waitForFunction(() => document.body.innerText.includes('空间主人还没投过视频'), { timeout: 1000 })
    .then(() => true)
    .catch(() => false);

  let cards = foundCards ? await extractCardsFromSpacePage(page) : [];

  if (cards.length === 0) {
    const authorName = normalizeAuthorName(
      await page.evaluate(() =>
        document.querySelector('.h-name')?.textContent?.trim() ||
        document.querySelector('.up-name')?.textContent?.trim() ||
        document.querySelector('.nickname')?.textContent?.trim() ||
        document.title.split('投稿视频')[0]?.trim() ||
        ''
      )
    );

    if (authorName) {
      await page.goto(`https://search.bilibili.com/all?keyword=${encodeURIComponent(authorName)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await new Promise((resolve) => setTimeout(resolve, 6000));
      cards = await extractCardsFromSearchPage(page, uid, authorName);
    }
  }

  if (cards.length === 0 && !emptyState) {
    throw new Error('Bilibili public video list was not rendered. The page may be rate-limited or changed.');
  }

  process.stdout.write(JSON.stringify(cards));
} finally {
  await browser.close();
}
