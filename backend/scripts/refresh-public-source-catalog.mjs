import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const dbPath = resolve(repoRoot, 'data', 'infohub_v2.db');
const auditPath = resolve(repoRoot, 'data', 'public-source-audit.json');

const categoryDefs = [
  { slug: 'ai', name: 'AI', sort_order: 1 },
  { slug: 'dev', name: '开发', sort_order: 2 },
  { slug: 'tech', name: '科技', sort_order: 3 },
  { slug: 'business', name: '商业财经', sort_order: 4 },
  { slug: 'design', name: '设计产品', sort_order: 5 },
  { slug: 'culture', name: '生活文化', sort_order: 6 },
  { slug: 'news', name: '时事国际', sort_order: 7 },
  { slug: 'science', name: '科学教育', sort_order: 8 },
  { slug: 'digest', name: '聚合精选', sort_order: 9 },
  { slug: 'media', name: '视频播客', sort_order: 10 },
];

const additions = [
  {
    name: 'OpenAI News',
    url: 'https://openai.com/news/',
    rss_url: 'https://openai.com/news/rss.xml',
    platform: 'news',
    category: 'ai',
    description: 'OpenAI 官方新闻与产品更新。',
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/',
    rss_url: 'https://blog.google/technology/ai/rss/',
    platform: 'news',
    category: 'ai',
    description: 'Google AI 官方博客。',
  },
  {
    name: 'AI | The Verge',
    url: 'https://www.theverge.com/ai-artificial-intelligence',
    rss_url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    platform: 'news',
    category: 'ai',
    description: 'The Verge 的 AI 专栏。',
  },
  {
    name: 'The Cloudflare Blog',
    url: 'https://blog.cloudflare.com/',
    rss_url: 'https://blog.cloudflare.com/rss/',
    platform: 'custom',
    category: 'dev',
    description: 'Cloudflare 工程与产品博客。',
  },
  {
    name: "Simon Willison's Weblog",
    url: 'https://simonwillison.net/',
    rss_url: 'https://simonwillison.net/atom/everything/',
    platform: 'custom',
    category: 'dev',
    description: 'Simon Willison 的开发与 AI 博客。',
  },
  {
    name: 'JetBrains Blog',
    url: 'https://blog.jetbrains.com/',
    rss_url: 'https://blog.jetbrains.com/feed/',
    platform: 'custom',
    category: 'dev',
    description: 'JetBrains 官方博客。',
  },
  {
    name: 'Stack Overflow Blog',
    url: 'https://stackoverflow.blog/',
    rss_url: 'https://stackoverflow.blog/feed/',
    platform: 'custom',
    category: 'dev',
    description: 'Stack Overflow 官方博客。',
  },
  {
    name: 'Spotify Engineering',
    url: 'https://engineering.atspotify.com/',
    rss_url: 'https://engineering.atspotify.com/feed/',
    platform: 'custom',
    category: 'dev',
    description: 'Spotify 工程博客。',
  },
  {
    name: 'Netflix TechBlog',
    url: 'https://netflixtechblog.com/',
    rss_url: 'https://netflixtechblog.com/feed',
    platform: 'custom',
    category: 'dev',
    description: 'Netflix 工程博客。',
  },
  {
    name: "O'Reilly Radar",
    url: 'https://www.oreilly.com/radar/',
    rss_url: 'https://feeds.feedburner.com/oreilly/radar/atom',
    platform: 'custom',
    category: 'dev',
    description: "O'Reilly Radar 技术趋势博客。",
  },
  {
    name: 'Ars Technica',
    url: 'https://arstechnica.com/',
    rss_url: 'https://arstechnica.com/feed/',
    platform: 'news',
    category: 'tech',
    description: 'Ars Technica 科技新闻。',
  },
  {
    name: 'WIRED',
    url: 'https://www.wired.com/',
    rss_url: 'https://www.wired.com/feed/rss',
    platform: 'news',
    category: 'tech',
    description: 'WIRED 科技新闻与评论。',
  },
  {
    name: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com/',
    rss_url: 'https://www.smashingmagazine.com/feed/',
    platform: 'news',
    category: 'design',
    description: 'Web 设计与前端实践。',
  },
  {
    name: 'UX Collective',
    url: 'https://uxdesign.cc/',
    rss_url: 'https://uxdesign.cc/feed',
    platform: 'news',
    category: 'design',
    description: 'UX 与产品设计文章。',
  },
  {
    name: 'Product Hunt',
    url: 'https://www.producthunt.com/',
    rss_url: 'https://www.producthunt.com/feed',
    platform: 'news',
    category: 'design',
    description: '新产品与独立工具发现。',
  },
  {
    name: 'FT中文网',
    url: 'https://www.ftchinese.com/',
    rss_url: 'https://www.ftchinese.com/rss/feed',
    platform: 'news',
    category: 'business',
    description: 'FT 中文版。',
  },
  {
    name: 'NPR News',
    url: 'https://www.npr.org/sections/news/',
    rss_url: 'https://feeds.npr.org/1001/rss.xml',
    platform: 'news',
    category: 'news',
    description: 'NPR 新闻。',
  },
  {
    name: 'Nature',
    url: 'https://www.nature.com/',
    rss_url: 'https://www.nature.com/nature.rss',
    platform: 'news',
    category: 'science',
    description: 'Nature 期刊最新内容。',
  },
];

const exactCategory = new Map([
  ['V2EX', 'digest'],
  ['V2EX - 技术', 'digest'],
  ['知乎日报', 'digest'],
  ['少数派 -- Matrix', 'digest'],
  ['MIT 科技评论 - 本周热榜', 'tech'],
  ['InfoQ 推荐', 'dev'],
  ['理想生活实验室', 'culture'],
  ['张鑫旭-鑫空间-鑫生活', 'dev'],
  ['机核', 'media'],
  ['游戏研究社', 'media'],
  ['Anyway.FM 设计杂谈', 'media'],
  ['触乐', 'media'],
  ['iDaily 每日环球视野', 'news'],
  ['今日话题 - 雪球', 'business'],
  ['商业 - 财富中文网 - FORTUNEChina.com', 'business'],
  ['财富中文网', 'business'],
  ['科技 - 财富中文网 - FORTUNEChina.com', 'business'],
  ['钛媒体：引领未来商业与生活新知', 'business'],
  ['经济日报', 'business'],
  ['阮一峰的网络日志', 'dev'],
  ['云风的 BLOG', 'dev'],
  ['Tony Bai', 'dev'],
  ['web.dev', 'dev'],
  ["Tony Bai", 'dev'],
  ['CSS-Tricks', 'dev'],
  ['HelloGitHub 月刊', 'dev'],
  ['新浪专栏-创事记', 'business'],
  ['果壳网 科学人', 'science'],
  ['维基百科优良条目供稿', 'culture'],
  ['豆瓣最受欢迎的书评', 'culture'],
  ['简书首页', 'culture'],
  ['人民日报', 'news'],
  ['新华社新闻_新华网', 'news'],
  ['首页头条--人民网', 'news'],
  ['头条 - 求是网', 'news'],
  ['纽约时报', 'news'],
  ['纽约时报双语版', 'news'],
  ['纽约时报中文网 国际纵览', 'news'],
  ['法广', 'news'],
  ['أخبار - آخر أخبار اليوم   الجزيرة نت', 'news'],
]);

function inferCategory(source) {
  const exact = exactCategory.get(source.name);
  if (exact) {
    return exact;
  }

  const text = `${source.name} ${source.url} ${source.rss_url}`.toLowerCase();

  if (/openai|google.*\/ai|the verge|ai /.test(text)) {
    return 'ai';
  }

  if (/cloudflare|simonwillison|jetbrains|stack overflow|netflix|spotify engineering|oreilly|josh comeau|tony bai|ruanyifeng|web\.dev|blog|coding|开发|编程|程序|前端|架构/.test(text)) {
    return 'dev';
  }

  if (/财富|经济|财经|business|finance|雪球|ftchinese|fortune|钛媒体|36kr|huxiu|虎嗅/.test(text)) {
    return 'business';
  }

  if (/design|ux|product hunt|人人都是产品经理|matrix|decohack|设计|产品/.test(text)) {
    return 'design';
  }

  if (/nature|科学|science|scientific|guokr/.test(text)) {
    return 'science';
  }

  if (/matrix|日报|weekly|推荐|热门|v2ex|精选|榜/.test(text)) {
    return 'digest';
  }

  if (/podcast|游戏|机核|播客|video|anyway/.test(text)) {
    return 'media';
  }

  if (/新闻|时报|新华社|人民日报|人民网|nyt|npr|world|international|法广|bbc|aljazeera|联合早报|daily/.test(text)) {
    return 'news';
  }

  if (/生活|书评|culture|douban|理想生活实验室/.test(text)) {
    return 'culture';
  }

  return 'tech';
}

function normalizePlatform(source) {
  if (source.platform === 'x') {
    return 'custom';
  }
  if (source.platform === 'wechat') {
    return 'custom';
  }
  return source.platform || 'custom';
}

function normalizeName(source) {
  return source.name
    .replace(/^\[(https?:\/\/.+?)\]\(\1\)$/u, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

async function main() {
  const db = new Database(dbPath);
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  const validCurrent = audit.results.filter((row) => row.status === 'valid');
  const keepIds = new Set(validCurrent.map((row) => row.id));

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM public_source_categories').run();
    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('public_source_categories');

    const insertCategory = db.prepare(
      'INSERT INTO public_source_categories (slug, name, sort_order) VALUES (?, ?, ?)'
    );
    for (const category of categoryDefs) {
      insertCategory.run(category.slug, category.name, category.sort_order);
    }

    db.prepare('UPDATE public_sources SET enabled = 0').run();

    const updateSource = db.prepare(
      `UPDATE public_sources
       SET name = ?, url = ?, rss_url = ?, platform = ?, category = ?, enabled = 1
       WHERE id = ?`
    );

    for (const source of validCurrent) {
      updateSource.run(
        normalizeName(source),
        source.url,
        source.rss_url,
        normalizePlatform(source),
        inferCategory(source),
        source.id
      );
    }

    const selectByRss = db.prepare('SELECT id FROM public_sources WHERE rss_url = ?');
    const insertSource = db.prepare(
      `INSERT INTO public_sources (name, url, rss_url, platform, category, description, enabled, subscribed_count)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0)`
    );

    for (const source of additions) {
      const existing = selectByRss.get(source.rss_url);
      if (existing?.id) {
        updateSource.run(
          source.name,
          source.url,
          source.rss_url,
          source.platform,
          source.category,
          existing.id
        );
        db.prepare('UPDATE public_sources SET description = ? WHERE id = ?').run(
          source.description ?? null,
          existing.id
        );
      } else {
        insertSource.run(
          source.name,
          source.url,
          source.rss_url,
          source.platform,
          source.category,
          source.description ?? null
        );
      }
    }
  });

  transaction();

  const enabledCount = db.prepare('SELECT COUNT(*) AS count FROM public_sources WHERE enabled = 1').get();
  console.log(
    JSON.stringify(
      {
        keptExisting: keepIds.size,
        added: additions.length,
        enabledAfterRefresh: enabledCount?.count ?? 0,
      },
      null,
      2
    )
  );
}

await main();
