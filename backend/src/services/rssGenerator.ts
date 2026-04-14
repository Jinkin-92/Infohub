/**
 * 统一 RSS 生成器
 * 对应 WeRss core/rss.py
 *
 * 支持格式: RSS 2.0, Atom, JSON
 */

export interface RSSItem {
  id: string;
  title: string;
  link: string;
  description: string;
  content?: string;
  image?: string;
  updated: Date | string;
  mp_name?: string;
}

export interface RSSOptions {
  title: string;
  link: string;
  description: string;
  language?: string;
  imageUrl?: string;
}

/**
 * 将 datetime 对象或字符串转换为 RFC 822 格式
 * 输入可能是：
 *   - Date 对象（本地时间）
 *   - ISO 8601 UTC 字符串（来自 articleCollector.toISOString()）
 * 统一输出为 RFC 822，标注 +0800（微信公众平台使用东八区时间）
 */
function toRFC822(dt: Date | string): string {
  let date: Date;
  if (typeof dt === 'string') {
    // ISO 字符串（UTC）-> 转为东八区时间
    const utc = new Date(dt);
    date = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
  } else {
    date = dt;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');

  const dayName = days[date.getUTCDay()];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} +0800`;
}

/**
 * XML 转义
 */
function escapeXml(text: string | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class RSSGenerator {
  /**
   * 生成 RSS 2.0 XML
   */
  generateRSS(items: RSSItem[], options: RSSOptions): string {
    const { title, link, description, imageUrl } = options;

    const itemXml = items
      .map((item) => {
        let xml = `    <item>
      <id>${escapeXml(item.id)}</id>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <guid isPermaLink="false">${escapeXml(item.link)}</guid>
      <link>${escapeXml(item.link)}</link>
      <pubDate>${toRFC822(item.updated)}</pubDate>`;

        if (item.image) {
          xml += `
      <enclosure url="${escapeXml(item.image)}" length="0" type="image/jpeg" />`;
        }

        if (item.content) {
          xml += `
      <content:encoded><![CDATA[${item.content}]]></content:encoded>`;
        }

        xml += `
    </item>`;
        return xml;
      })
      .join('\n');

    let rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>zh-CN</language>
    <generator>InfoHub</generator>
    <lastBuildDate>${toRFC822(new Date())}</lastBuildDate>`;

    if (imageUrl) {
      rss += `
    <image>
      <url>${escapeXml(imageUrl)}</url>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
    </image>`;
    }

    rss += `
${itemXml}
  </channel>
</rss>`;

    return rss;
  }

  /**
   * 生成 Atom 格式
   */
  generateAtom(items: RSSItem[], options: RSSOptions): string {
    const { title, link, description } = options;

    const entryXml = items
      .map((item) => {
        let xml = `    <entry>
      <id>${escapeXml(item.id)}</id>
      <title>${escapeXml(item.title)}</title>
      <link href="${escapeXml(item.link)}" />
      <updated>${toRFC822(item.updated)}</updated>
      <summary>${escapeXml(item.description)}</summary>`;

        if (item.mp_name) {
          xml += `
      <author>
        <name>${escapeXml(item.mp_name)}</name>
      </author>`;
        }

        if (item.image) {
          xml += `
      <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="${escapeXml(item.image)}" />`;
        }

        xml += `
    </entry>`;
        return xml;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${escapeXml(link)}" rel="alternate" />
  <link href="${escapeXml(link)}" rel="self" />
  <id>${escapeXml(link)}</id>
  <updated>${toRFC822(new Date())}</updated>
  <author>
    <name>InfoHub</name>
  </author>
  <subtitle>${escapeXml(description)}</subtitle>
${entryXml}
</feed>`;
  }

  /**
   * 生成 JSON Feed
   */
  generateJSON(items: RSSItem[], options: RSSOptions): string {
    const { title, link, description, imageUrl } = options;

    const feedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.description,
      content_text: item.description,
      content_html: item.content || item.description,
      url: item.link,
      image: item.image,
      date_published: item.updated instanceof Date ? item.updated.toISOString() : item.updated,
      date_modified: item.updated instanceof Date ? item.updated.toISOString() : item.updated,
      author: {
        name: item.mp_name || 'Unknown',
      },
    }));

    return JSON.stringify(
      {
        version: 'https://jsonfeed.org/version/1.1',
        title,
        home_page_url: link,
        feed_url: link,
        description,
        image: imageUrl,
        items: feedItems,
      },
      null,
      2
    );
  }

  /**
   * 根据扩展名选择格式
   */
  generate(items: RSSItem[], options: RSSOptions & { ext: string }): string {
    const ext = options.ext.toLowerCase().trim();

    if (ext === 'atom' || ext === 'md' || ext === 'txt') {
      return this.generateAtom(items, options);
    }

    if (ext === 'json' || ext === 'jmd') {
      return this.generateJSON(items, options);
    }

    // 默认 RSS 2.0
    return this.generateRSS(items, options);
  }
}

// 单例导出
export const rssGenerator = new RSSGenerator();
