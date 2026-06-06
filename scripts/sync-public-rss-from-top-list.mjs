import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from '../backend/node_modules/better-sqlite3/lib/index.js'

const SOURCE_URLS = {
  topList: 'https://raw.githubusercontent.com/weekend-project-space/top-rss-list/main/README.md',
  awesomeRsshubRoutes: 'https://raw.githubusercontent.com/JackyST0/awesome-rsshub-routes/main/feeds.opml',
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_DIR = path.resolve(REPO_ROOT, 'backend')
const DB_PATH = resolveSqlitePath()
const ACCEPT_HEADER = 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/feed+json, application/json, text/plain;q=0.8, */*;q=0.5'
const CONCURRENCY = 12

const CATEGORY_ORDER = ['tech', 'news', 'finance', 'life', 'design', 'video', 'aggregator']
const CATEGORY_META = {
  tech: { name: '科技', sortOrder: 1 },
  news: { name: '新闻', sortOrder: 2 },
  finance: { name: '财经', sortOrder: 3 },
  life: { name: '生活', sortOrder: 4 },
  design: { name: '设计', sortOrder: 5 },
  video: { name: '视频', sortOrder: 6 },
  aggregator: { name: '聚合', sortOrder: 7 },
}

const AWESOME_OPML_CATEGORY_MAP = {
  'ai 专题': 'tech',
  '技术社区': 'aggregator',
  '新闻资讯': 'news',
  '科技媒体': 'tech',
  '安全资讯': 'tech',
  '前端 & 设计': 'design',
  '编程语言官方博客': 'tech',
  '大厂技术博客': 'tech',
  '技术周刊': 'aggregator',
  '学术论文': 'tech',
  'rss 工具更新': 'aggregator',
}

function decodeHtmlEntities(value) {
  return (value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function readBackendEnvValue(key) {
  const envPath = path.resolve(BACKEND_DIR, '.env')
  if (!fs.existsSync(envPath)) {
    return null
  }

  const text = fs.readFileSync(envPath, 'utf8')
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`))
  if (!line) {
    return null
  }

  return line.slice(key.length + 1).trim()
}

function resolveSqlitePath() {
  const raw = process.env.SQLITE_PATH || readBackendEnvValue('SQLITE_PATH') || './data/infohub.db'
  return path.resolve(BACKEND_DIR, raw)
}

function splitTableRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function extractMarkdownLink(markdown) {
  const match = markdown.match(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/i)
  if (!match) {
    return null
  }

  return {
    text: match[1].trim(),
    url: match[2].trim(),
  }
}

function normalizeLabel(value) {
  return decodeHtmlEntities(value || '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(value.trim())
    parsed.hash = ''
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    return parsed.toString()
  } catch {
    return value.trim()
  }
}

function deriveName(name, url) {
  const cleaned = decodeHtmlEntities(name || '').trim()
  if (cleaned) {
    return cleaned
  }

  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function classifyCategory(name, url) {
  const haystack = `${name} ${url}`.toLowerCase()

  if (/(热榜|热搜|日报|早报|周刊|readhub|hotlist|weekly|排行|ranking|话题|focusread|快讯|v2ex|开发者头条|每日精选|today|hnrss|product hunt|linuxdo)/i.test(haystack)) {
    return 'aggregator'
  }

  if (/(bilibili|youtube|播客|podcast|视频|影视|电影|动态|telegram channel|4k|游戏研究社|dribbble)/i.test(haystack)) {
    return 'video'
  }

  if (/(设计|ui|ux|css|优设|pmcaff|decohack|anyway|smashing magazine|alist apart|codrops|tailwind|chrome developer|frontend)/i.test(haystack)) {
    return 'design'
  }

  if (/(财经|商业|财富|投资|经济|金融|创业|变现|雪球|华尔街|见闻|企业家|财经周刊|财经风云|caijing|fortune|boss|bytebytego|stripe)/i.test(haystack)) {
    return 'finance'
  }

  if (/(生活|读书|书|文摘|心理|人文|一个|环球视野|人物|青年|knowyourself|国家人文历史|利维坦|读库|读小库)/i.test(haystack)) {
    return 'life'
  }

  if (/(新闻|时报|日报|周末|新华社|人民日报|人民网|联合早报|纽约时报|中国日报|bbc|voa|观察网|澎湃|凤凰|新京报|腾讯新闻|端传媒|abc\/cn|zaobao|newscn|nytimes|wsj)/i.test(haystack)) {
    return 'news'
  }

  return 'tech'
}

function classifyPlatform(category, name, url) {
  const haystack = `${name} ${url}`.toLowerCase()

  if (haystack.includes('plink.anyfeeder.com/weixin/')) return 'news'
  if (haystack.includes('plink.anyfeeder.com/weibo/')) return 'news'
  if (haystack.includes('plink.anyfeeder.com/zhihu/')) return 'news'
  if (haystack.includes('plink.anyfeeder.com/bilibili/')) return 'news'
  if (haystack.includes('plink.anyfeeder.com/youtube/')) return 'news'

  if (haystack.includes('zhihu')) return 'zhihu'
  if (haystack.includes('bilibili')) return 'bilibili'
  if (haystack.includes('youtube')) return 'youtube'
  if (haystack.includes('weibo')) return 'weibo'
  if (haystack.includes('weixin')) return 'wechat'
  if (haystack.includes('x.com') || haystack.includes('twitter')) return 'x'

  if (category === 'tech' || category === 'design' || category === 'life' || category === 'video') {
    return 'custom'
  }

  return 'news'
}

async function fetchText(url, timeoutMs = 10000) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      accept: ACCEPT_HEADER,
      'user-agent': 'InfoHub Public RSS Sync/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  const text = await response.text()
  return { response, text }
}

function looksLikeFeed(text, contentType) {
  const snippet = text.slice(0, 4000).toLowerCase()
  const type = (contentType || '').toLowerCase()
  return (
    type.includes('xml') ||
    type.includes('rss') ||
    type.includes('atom') ||
    type.includes('json') ||
    snippet.includes('<rss') ||
    snippet.includes('<feed') ||
    snippet.includes('<rdf:rdf') ||
    snippet.includes('<channel') ||
    snippet.includes('"version":"https://jsonfeed.org/version/')
  )
}

async function validateFeed(candidate) {
  try {
    const { response, text } = await fetchText(candidate.rss_url)
    if (!response.ok) {
      return { ...candidate, valid: false, reason: `HTTP ${response.status}` }
    }

    if (!looksLikeFeed(text, response.headers.get('content-type'))) {
      return { ...candidate, valid: false, reason: 'Not a feed response' }
    }

    return { ...candidate, valid: true }
  } catch (error) {
    return {
      ...candidate,
      valid: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  const results = []
  let index = 0

  async function next() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
  return results
}

function dedupeCandidates(rows) {
  const deduped = new Map()

  for (const row of rows) {
    const key = normalizeUrl(row.rss_url).toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return Array.from(deduped.values())
}

function parseTopList(markdown) {
  const rows = []

  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) {
      continue
    }

    const cells = splitTableRow(line)
    if (cells.length < 2 || cells[0] === '名称' || cells[0] === '----') {
      continue
    }

    const link = extractMarkdownLink(cells[1])
    if (!link) {
      continue
    }

    const rssUrl = normalizeUrl(link.url)
    const name = deriveName(cells[0], rssUrl)
    const category = classifyCategory(name, rssUrl)

    rows.push({
      name,
      url: rssUrl,
      rss_url: rssUrl,
      category,
      platform: classifyPlatform(category, name, rssUrl),
      description: `Imported from weekend-project-space/top-rss-list (${category})`,
    })
  }

  return dedupeCandidates(rows)
}

function parseAwesomeRsshubRoutes(opml) {
  const rows = []
  const categoryBlocks = [...opml.matchAll(/<outline\s+text="([^"]+)"\s+title="([^"]+)"\s*>([\s\S]*?)<\/outline>/g)]

  for (const match of categoryBlocks) {
    const categoryTitle = decodeHtmlEntities(match[2])
    const normalizedCategory = normalizeLabel(categoryTitle)
    const category = AWESOME_OPML_CATEGORY_MAP[normalizedCategory] || 'tech'
    const block = match[3]
    const childItems = [...block.matchAll(/<outline\s+type="rss"([\s\S]*?)\/>/g)]

    for (const itemMatch of childItems) {
      const attrs = itemMatch[1]
      const title = decodeHtmlEntities(attrs.match(/\btitle="([^"]*)"/)?.[1] || '')
      const text = decodeHtmlEntities(attrs.match(/\btext="([^"]*)"/)?.[1] || '')
      const xmlUrl = attrs.match(/\bxmlUrl="([^"]*)"/)?.[1]
      const htmlUrl = attrs.match(/\bhtmlUrl="([^"]*)"/)?.[1]
      if (!xmlUrl) {
        continue
      }

      const rssUrl = normalizeUrl(xmlUrl)
      const name = deriveName(title || text, rssUrl)
      const finalCategory = category || classifyCategory(name, rssUrl)

      rows.push({
        name,
        url: normalizeUrl(htmlUrl || rssUrl),
        rss_url: rssUrl,
        category: finalCategory,
        platform: classifyPlatform(finalCategory, name, rssUrl),
        description: `Imported from JackyST0/awesome-rsshub-routes (${categoryTitle})`,
      })
    }
  }

  return dedupeCandidates(rows)
}

function ensureCategories(db) {
  const insert = db.prepare(`
    INSERT INTO public_source_categories (slug, name, sort_order)
    VALUES (@slug, @name, @sortOrder)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      sort_order = excluded.sort_order
  `)

  for (const slug of CATEGORY_ORDER) {
    insert.run({
      slug,
      name: CATEGORY_META[slug].name,
      sortOrder: CATEGORY_META[slug].sortOrder,
    })
  }
}

function normalizeExistingCategories(db) {
  const categoryMap = new Map([
    ['ai', 'tech'],
    ['dev', 'tech'],
    ['business', 'finance'],
    ['culture', 'life'],
    ['digest', 'aggregator'],
    ['media', 'video'],
    ['science', 'tech'],
  ])

  const update = db.prepare('UPDATE public_sources SET category = ? WHERE category = ?')
  for (const [legacy, normalized] of categoryMap) {
    update.run(normalized, legacy)
  }

  const pruneCategoryRows = db.prepare(`
    DELETE FROM public_source_categories
    WHERE slug NOT IN (${CATEGORY_ORDER.map(() => '?').join(', ')})
  `)
  pruneCategoryRows.run(...CATEGORY_ORDER)
}

function syncSources(db, sources) {
  const existingByRss = new Map(
    db.prepare('SELECT id, rss_url FROM public_sources').all().map((row) => [normalizeUrl(row.rss_url).toLowerCase(), row.id])
  )

  const insert = db.prepare(`
    INSERT INTO public_sources (name, url, rss_url, platform, category, description, enabled)
    VALUES (@name, @url, @rss_url, @platform, @category, @description, 1)
  `)

  const update = db.prepare(`
    UPDATE public_sources
    SET name = @name,
        url = @url,
        platform = @platform,
        category = @category,
        description = @description,
        enabled = 1
    WHERE id = @id
  `)

  let inserted = 0
  let updated = 0

  for (const source of sources) {
    const key = normalizeUrl(source.rss_url).toLowerCase()
    const existingId = existingByRss.get(key)
    if (existingId) {
      update.run({ ...source, id: existingId })
      updated += 1
      continue
    }

    insert.run(source)
    inserted += 1
  }

  return { inserted, updated }
}

async function main() {
  console.log(`[Public RSS] Downloading ${SOURCE_URLS.topList}`)
  const topListResult = await fetchText(SOURCE_URLS.topList, 20000)
  if (!topListResult.response.ok) {
    throw new Error(`Failed to fetch top RSS list: HTTP ${topListResult.response.status}`)
  }

  console.log(`[Public RSS] Downloading ${SOURCE_URLS.awesomeRsshubRoutes}`)
  const awesomeResult = await fetchText(SOURCE_URLS.awesomeRsshubRoutes, 20000)
  if (!awesomeResult.response.ok) {
    throw new Error(`Failed to fetch awesome-rsshub-routes: HTTP ${awesomeResult.response.status}`)
  }

  const topListCandidates = parseTopList(topListResult.text)
  const awesomeCandidates = parseAwesomeRsshubRoutes(awesomeResult.text)
  const mergedCandidates = dedupeCandidates([...topListCandidates, ...awesomeCandidates])

  console.log(`[Public RSS] Parsed ${topListCandidates.length} top-rss-list candidates`)
  console.log(`[Public RSS] Parsed ${awesomeCandidates.length} awesome-rsshub-routes candidates`)
  console.log(`[Public RSS] Merged into ${mergedCandidates.length} unique feed candidates`)

  const validated = await runPool(mergedCandidates, validateFeed)
  const valid = validated.filter((item) => item.valid)
  const invalid = validated.filter((item) => !item.valid)

  console.log(`[Public RSS] Valid feeds: ${valid.length}`)
  console.log(`[Public RSS] Invalid feeds skipped: ${invalid.length}`)

  const db = new Database(DB_PATH)
  try {
    normalizeExistingCategories(db)
    ensureCategories(db)
    const { inserted, updated } = syncSources(db, valid)
    const counts = db.prepare(`
      SELECT category, COUNT(*) as total
      FROM public_sources
      WHERE enabled = 1
      GROUP BY category
      ORDER BY category
    `).all()

    console.log(JSON.stringify({
      inserted,
      updated,
      invalidSkipped: invalid.length,
      counts,
      sampleInvalid: invalid.slice(0, 20).map((item) => ({
        name: item.name,
        rss_url: item.rss_url,
        reason: item.reason,
      })),
    }, null, 2))
  } finally {
    db.close()
  }
}

main().catch((error) => {
  console.error('[Public RSS] Sync failed:', error)
  process.exitCode = 1
})
