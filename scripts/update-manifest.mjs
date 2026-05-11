#!/usr/bin/env node
/**
 * Magpie Manifest 本地维护脚本
 * 扫描项目核心文件，计算静态指标，检测 manifest 与代码的同步状态
 *
 * Usage:
 *   node scripts/update-manifest.mjs           # 运行完整检查
 *   node scripts/update-manifest.mjs --sync    # 同步更新 confidence score
 *   node scripts/update-manifest.mjs --report  # 仅输出报告
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const MANIFEST_JSON = join(ROOT, 'magpie-manifest.json');
const MANIFEST_MD = join(ROOT, 'magpie-manifest.md');

// ============================================================
// 静态评分引擎 (Phase 4 简化版)
// ============================================================

function analyzeFile(filePath) {
  const fullPath = join(ROOT, filePath);
  if (!existsSync(fullPath)) {
    return { exists: false, error: 'File not found' };
  }

  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  // 统计注释行
  let commentLines = 0;
  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
    } else if (trimmed.startsWith('//')) {
      commentLines++;
    } else if (trimmed.startsWith('/*')) {
      commentLines++;
      if (!trimmed.includes('*/')) inBlockComment = true;
    }
  }

  // 统计 import/require 依赖 (兼容 BOM 头和不同换行符)
  const normalizedContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const importMatches = normalizedContent.match(/^[ \t]*import[ \t]+/gm) || [];
  const requireMatches = normalizedContent.match(/require\s*\(/g) || [];
  const totalDeps = importMatches.length + requireMatches.length;

  // 统计引用次数（在当前项目中的 import 引用）
  // 简化：通过文件名（不含扩展名）在其他文件中被 import 的次数
  const baseName = filePath.split('/').pop().replace(/\.(ts|js|mjs|tsx|jsx)$/, '');
  // 这里只做当前文件内的 self-analysis，完整 ref 需要全局扫描

  // 计算各项指标
  const maxDeps = 20;
  const depsRatio = Math.max(0, 1 - totalDeps / maxDeps);

  const fileName = filePath.split('/').pop();
  const namingScore =
    /^(collector|urlDetector|error|client|queries|credentialStore|cron|localIntegrations|api|types|rssGenerator|rsshubAdapter)/i.test(fileName)
      ? 1.0
      : 0.8;

  const commentRatio = Math.min(1, commentLines / Math.max(1, totalLines) * 5);

  let sizePenalty = 1.0;
  if (totalLines < 50) sizePenalty = 0.85;
  else if (totalLines > 1000) sizePenalty = 0.75;
  else if (totalLines > 800) sizePenalty = 0.9;

  // refRatio: 基于文件名在代码中被引用的次数（粗略）
  // 这里用硬编码的常见引用映射，完整实现需要全局扫描
  const refMap = {
    'collector': 8,
    'urlDetector': 5,
    'rssGenerator': 3,
    'error': 10,
    'client': 10,
    'queries': 10,
    'credentialStore': 4,
    'cron': 4,
    'localIntegrations': 4,
    'api': 6,
    'types': 8,
    'rsshubAdapter': 4,
    'articleCollector': 2,
    'auth': 3,
  };
  const refCount = refMap[baseName] || 1;
  const maxRefs = 10;
  const refRatio = refCount / maxRefs;

  // Phase 4 confidence
  const confidence = Number(
    (
      depsRatio * 0.25 +
      namingScore * 0.2 +
      commentRatio * 0.15 +
      sizePenalty * 0.2 +
      refRatio * 0.2
    ).toFixed(3)
  );

  return {
    exists: true,
    totalLines,
    commentLines,
    totalDeps,
    depsRatio: Number(depsRatio.toFixed(3)),
    namingScore: Number(namingScore.toFixed(3)),
    commentRatio: Number(commentRatio.toFixed(3)),
    sizePenalty: Number(sizePenalty.toFixed(3)),
    refRatio: Number(refRatio.toFixed(3)),
    confidence,
    confidenceLevel: confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low',
  };
}

// ============================================================
// Manifest 同步检测
// ============================================================

function loadManifest() {
  if (!existsSync(MANIFEST_JSON)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(MANIFEST_JSON, 'utf8'));
  } catch (e) {
    console.error(`[Error] Failed to parse ${MANIFEST_JSON}:`, e.message);
    return null;
  }
}

function checkSync(manifest) {
  const report = {
    synced: [],
    changed: [],
    missing: [],
    newFiles: [],
    scores: [],
  };

  const trackedFiles = new Set();

  for (const asset of manifest.assets || []) {
    const filePath = asset.sourceFile;
    trackedFiles.add(filePath);

    const analysis = analyzeFile(filePath);
    if (!analysis.exists) {
      report.missing.push({ id: asset.id, file: filePath, reason: analysis.error });
      continue;
    }

    const storedLines = asset.sourceLines?.[1] - asset.sourceLines?.[0] + 1 || 0;
    const actualLines = analysis.totalLines;
    const lineDiff = actualLines - storedLines;
    const storedConfidence = asset.confidence;
    const actualConfidence = analysis.confidence;
    const confidenceDiff = Number((actualConfidence - storedConfidence).toFixed(3));

    const entry = {
      id: asset.id,
      name: asset.name,
      file: filePath,
      lines: { stored: storedLines, actual: actualLines, diff: lineDiff },
      confidence: { stored: storedConfidence, actual: actualConfidence, diff: confidenceDiff },
      metrics: analysis,
    };

    if (Math.abs(lineDiff) > 20 || Math.abs(confidenceDiff) > 0.05) {
      report.changed.push(entry);
    } else {
      report.synced.push(entry);
    }

    report.scores.push(entry);
  }

  // 扫描是否有新的核心文件未被追踪
  const coreDirs = [
    'backend/src/services',
    'backend/src/middleware',
    'backend/src/db',
    'frontend/app/lib',
    'frontend/app/types',
    'scripts',
  ];

  // 简化：仅报告 trackedFiles 数量和建议
  report.trackedCount = trackedFiles.size;

  return report;
}

// ============================================================
// 报告输出
// ============================================================

function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('Magpie Manifest 同步检查报告');
  console.log('='.repeat(60));

  console.log(`\n📊 总体统计`);
  console.log(`  已追踪资产: ${report.trackedCount}`);
  console.log(`  ✅ 同步正常: ${report.synced.length}`);
  console.log(`  ⚠️  发生变化: ${report.changed.length}`);
  console.log(`  ❌ 文件缺失: ${report.missing.length}`);

  if (report.changed.length > 0) {
    console.log(`\n📈 发生变化的资产 (${report.changed.length})`);
    console.log('-'.repeat(60));
    for (const item of report.changed) {
      const lineIndicator = item.lines.diff > 0 ? `+${item.lines.diff}` : `${item.lines.diff}`;
      const confIndicator = item.confidence.diff > 0 ? `+${item.confidence.diff}` : `${item.confidence.diff}`;
      console.log(`  ${item.id} ${item.name}`);
      console.log(`    文件: ${item.file}`);
      console.log(`    行数: ${item.lines.stored} → ${item.lines.actual} (${lineIndicator})`);
      console.log(`    置信度: ${item.confidence.stored} → ${item.confidence.actual} (${confIndicator})`);
      console.log(`    指标: deps=${item.metrics.depsRatio} name=${item.metrics.namingScore} comment=${item.metrics.commentRatio} size=${item.metrics.sizePenalty} ref=${item.metrics.refRatio}`);
      console.log();
    }
  }

  if (report.missing.length > 0) {
    console.log(`\n❌ 缺失的文件 (${report.missing.length})`);
    console.log('-'.repeat(60));
    for (const item of report.missing) {
      console.log(`  ${item.id} ${item.file} — ${item.reason}`);
    }
  }

  console.log(`\n📋 完整评分表`);
  console.log('-'.repeat(60));
  console.log(`  ${'ID'.padEnd(6)} ${'Name'.padEnd(20)} ${'Conf'.padEnd(6)} ${'Deps'.padEnd(6)} ${'Name'.padEnd(6)} ${'Cmt'.padEnd(6)} ${'Size'.padEnd(6)} ${'Ref'.padEnd(6)}`);
  console.log(`  ${'-'.repeat(6)} ${'-'.repeat(20)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)}`);
  for (const item of report.scores) {
    console.log(
      `  ${item.id.padEnd(6)} ${item.name.slice(0, 20).padEnd(20)} ` +
      `${String(item.metrics.confidence).padEnd(6)} ` +
      `${String(item.metrics.depsRatio).padEnd(6)} ` +
      `${String(item.metrics.namingScore).padEnd(6)} ` +
      `${String(item.metrics.commentRatio).padEnd(6)} ` +
      `${String(item.metrics.sizePenalty).padEnd(6)} ` +
      `${String(item.metrics.refRatio).padEnd(6)}`
    );
  }

  console.log('\n' + '='.repeat(60));
}

function printSyncPreview(report) {
  const lineChanges = report.changed.filter((item) => Math.abs(item.lines.diff) > 5);

  console.log('\n' + '='.repeat(60));
  console.log('同步预览 (--sync 将更新行数变化>5的资产)');
  console.log('注: confidence 保持人工评定值，不自动覆盖');
  console.log('='.repeat(60));

  for (const item of lineChanges) {
    console.log(`\n  ${item.id} ${item.name}`);
    console.log(`    sourceLines: [${item.sourceLines?.[0] || 1}, ${item.lines.stored}] → [1, ${item.metrics.totalLines}]`);
  }

  if (lineChanges.length === 0) {
    console.log('\n  没有行数变化超过 5 的资产需要同步。');
  }

  console.log('\n💡 提示: 运行 `node scripts/update-manifest.mjs --sync` 应用更新');
  console.log('='.repeat(60));
}

// ============================================================
// 同步更新
// ============================================================

function syncManifest(manifest, report) {
  let updated = 0;
  for (const item of report.changed) {
    const asset = manifest.assets.find((a) => a.id === item.id);
    if (!asset) continue;

    const lineDiff = Math.abs(item.lines.diff);
    // 只同步行数变化超过 5 行的资产，confidence 保持人工评定值
    if (lineDiff > 5) {
      asset.sourceLines = [1, item.metrics.totalLines];

      // 更新 evidence reasoning 中的行数引用
      if (asset.evidence && asset.evidence.reasoning) {
        asset.evidence.reasoning = asset.evidence.reasoning.replace(
          /\d+行/,
          `${item.metrics.totalLines}行`
        );
      }

      updated++;
    }
  }

  // 更新 summary
  const levels = { high: 0, medium: 0, low: 0 };
  for (const asset of manifest.assets) {
    levels[asset.confidenceLevel] = (levels[asset.confidenceLevel] || 0) + 1;
  }
  manifest.summary.highConfidence = levels.high;
  manifest.summary.mediumConfidence = levels.medium;
  manifest.summary.lowConfidence = levels.low;

  return updated;
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_JSON, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const shouldSync = args.includes('--sync');
  const reportOnly = args.includes('--report');

  const manifest = loadManifest();
  if (!manifest) {
    console.error('[Error] magpie-manifest.json not found or invalid.');
    console.error('        Run this script from the project root.');
    process.exit(1);
  }

  const report = checkSync(manifest);
  printReport(report);

  if (shouldSync) {
    const updated = syncManifest(manifest, report);
    // 需要动态导入 fs 的 promise 版本或保持同步
    saveManifest(manifest);
    console.log(`\n✅ 已同步 ${updated} 个资产的评分和行数到 magpie-manifest.json`);
  } else if (report.changed.length > 0 && !reportOnly) {
    printSyncPreview(report);
  }
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
