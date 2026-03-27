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

  if (!foundCards && !emptyState) {
    throw new Error('Bilibili public video list was not rendered. The page may be rate-limited or changed.');
  }

  const cards = await page.evaluate(() => {
    const author =
      document.querySelector('.h-name')?.textContent?.trim() ||
      document.querySelector('.up-name')?.textContent?.trim() ||
      document.querySelector('.nickname')?.textContent?.trim() ||
      document.title.split('投稿视频')[0]?.trim() ||
      null;

    const empty = document.body.innerText.includes('空间主人还没投过视频');
    return Array.from(document.querySelectorAll('.bili-video-card')).map((card) => {
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
    }).filter((card) => card.title && card.link);
  });

  process.stdout.write(JSON.stringify(cards));
} finally {
  await browser.close();
}
