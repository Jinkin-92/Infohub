---
title: "Bilibili 订阅源名称采集后未回写数据库"
date: 2026-04-08
category: docs/solutions/logic-errors/
module: infohub-collector
problem_type: logic_error
component: service_object
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
tags: [bilibili, source-name, collector, scraper]
---

# Bilibili 订阅源名称采集后未回写数据库

## Problem

Bilibili 订阅源显示 "Bilibili · UID 1630402457" 而不是真实作者名 "历史小吏-"，导致用户无法从订阅源列表中识别内容来源的真实 up 主。

## Symptoms

- 订阅源列表中 Bilibili 源显示为 "Bilibili · UID 1630402457" 而非作者名
- scraper 能正确抓取到作者名 "历史小吏-"，但 sources 表中的 name 字段未更新

## What Didn't Work

尝试直接使用 `cards[0].author` 值，但发现 `collectBilibiliPublicItems` 只返回 `RSSItem[]`，没有单独传递 `authorName`，导致调用方（collector.ts）无法获取并更新到数据库。

## Solution

### 1. 修改 `bilibiliPublicCollector.ts` — 扩展返回类型

`collectItems` 的返回类型从 `RSSItem[]` 改为 `{ items: RSSItem[]; authorName: string | null }`，从 cards 中显式提取第一个非空作者名：

```typescript
// backend/src/services/bilibiliPublicCollector.ts

export async function collectBilibiliPublicItems(source: Source): Promise<{ items: RSSItem[]; authorName: string | null }> {
  const uid = source.platform_id?.trim();
  if (!uid) {
    throw new Error('Bilibili source is missing platform_id.');
  }

  const cards = await runBilibiliScraper(uid);
  if (cards.length === 0) {
    return { items: [], authorName: null };
  }

  if (cards.every((card) => card.empty)) {
    return { items: [], authorName: null };
  }

  const authorName = cards.find((c) => c.author)?.author ?? null;

  const items: RSSItem[] = cards.map((card) => {
    // ... 构建 RSSItem
  });

  return { items, authorName };
}
```

### 2. 修改 `collector.ts` — 回写 authorName 到 sources 表

在 `collectItems` 中对 bilibili 解构取出 `items`，采集完成后检查并更新源名称：

```typescript
// backend/src/services/collector.ts (collectItems 方法内)
if (source.platform === 'bilibili') {
  const { items } = await bilibiliPublicCollector.collectItems(source);
  return items;
}

// collectSource 方法内，items 采集完成后：
if (source.platform === 'bilibili' && items.length > 0) {
  const authorName = items[0].author;
  if (authorName && source.name !== authorName) {
    await sourcesQueries.update(sourceId, { name: authorName });
    console.log(`[Collector] Bilibili source ${sourceId} name updated to "${authorName}"`);
  }
}
```

## Why This Works

`runBilibiliScraper` 返回的 `cards` 数组中包含正确的 `author` 字段（"历史小吏-"）。原实现在 `collectBilibiliPublicItems` 中只提取了 `RSSItem[]`，丢弃了独立的 `authorName`。修改后：

1. 从 cards 中显式提取 `authorName` 并通过返回对象一并传递
2. `collector.ts` 接收 `authorName` 后检查其与当前 `source.name` 是否一致
3. 若不一致则调用 `sourcesQueries.update` 更新数据库中的订阅源名称

## Prevention

- [ ] 为 bilibili 平台添加集成测试，验证 authorName 能正确同步到 sources 表
- [ ] 在 collector 采集流程中添加日志，记录 authorName 同步结果
- [ ] 对其他平台（微信公众号等）做类似检查，防止同类问题 — 微信公众号已有 `maybeRepairWeChatSource` 等修复逻辑，Bilibili 也应遵循同一模式

## Related Issues

- InfHub 项目：[d:/code/aggregation/infohub](d:/code/aggregation/infohub)
- 相关文件：
  - [backend/src/services/bilibiliPublicCollector.ts](infohub/backend/src/services/bilibiliPublicCollector.ts)
  - [backend/src/services/collector.ts](infohub/backend/src/services/collector.ts)
  - [backend/scripts/fetch-bilibili-public.mjs](infohub/backend/scripts/fetch-bilibili-public.mjs)
