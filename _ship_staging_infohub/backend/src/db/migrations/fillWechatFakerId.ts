/**
 * 迁移脚本：填充 sources_wechat_ext 表的 faker_id
 * 从现有 sources 的 RSS URL 中提取 fakeid
 *
 * 运行方式: npx tsx src/db/migrations/fillWechatFakerId.ts
 */

import { sql } from '../client.js';

async function fillWechatFakerId() {
  console.log('开始填充 WeChat faker_id...');

  // 获取所有微信源
  const sources = await sql.query<{
    id: number;
    name: string;
    rss_url: string;
    platform_id: string | null;
  }>(`SELECT id, name, rss_url, platform_id FROM sources WHERE platform = 'wechat'`);

  console.log(`找到 ${sources.length} 个微信源`);

  let updated = 0;
  let skipped = 0;

  for (const source of sources) {
    // 尝试从 RSS URL 提取 fakeid
    // 格式: http://localhost:8001/feed/MP_WXS_3248194593.rss
    // 或: http://localhost:1200/wechat/csm/xxxx
    let fakeid: string | null = null;

    // 从 platform_id 提取
    if (source.platform_id) {
      const match = source.platform_id.match(/MP_WXS_(\d+)/);
      if (match) {
        fakeid = match[1];
      }
    }

    // 从 RSS URL 提取
    if (!fakeid && source.rss_url) {
      // 尝试 /feed/MP_WXS_XXX.rss 格式
      const feedMatch = source.rss_url.match(/\/feed\/MP_WXS_(\d+)/);
      if (feedMatch) {
        fakeid = feedMatch[1];
      }

      // 尝试 /wechat/csm/{base64_biz} 格式 -> 解码为纯数字 fakeid
      if (!fakeid) {
        const csmMatch = source.rss_url.match(/\/wechat\/csm\/([^/]+)/);
        if (csmMatch) {
          const rawBiz = csmMatch[1];
          try {
            const decoded = Buffer.from(rawBiz, 'base64').toString('utf8');
            if (/^\d+$/.test(decoded)) {
              fakeid = decoded;
            }
          } catch {
            // 解码失败，忽略
          }
        }
      }
    }

    if (!fakeid) {
      console.log(`  [跳过] ${source.name} (ID:${source.id}) - 无法提取 fakeid`);
      skipped++;
      continue;
    }

    // 检查是否已有记录
    const existing = await sql.get<{ source_id: number }>(
      'SELECT source_id FROM sources_wechat_ext WHERE source_id = ?',
      [source.id]
    );

    if (existing) {
      // 更新现有记录
      await sql.execute(
        'UPDATE sources_wechat_ext SET faker_id = ?, mp_name = ? WHERE source_id = ?',
        [fakeid, source.name, source.id]
      );
    } else {
      // 插入新记录
      await sql.execute(
        'INSERT INTO sources_wechat_ext (source_id, faker_id, mp_name) VALUES (?, ?, ?)',
        [source.id, fakeid, source.name]
      );
    }

    console.log(`  [更新] ${source.name} (ID:${source.id}) - fakeid: ${fakeid}`);
    updated++;
  }

  console.log(`\n完成: 更新 ${updated} 个源，跳过 ${skipped} 个`);

  // 验证
  const allExt = await sql.query<{ source_id: number; faker_id: string }>(
    'SELECT source_id, faker_id FROM sources_wechat_ext'
  );
  console.log(`\n验证: sources_wechat_ext 表共有 ${allExt.length} 条记录`);

  process.exit(0);
}

fillWechatFakerId().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
