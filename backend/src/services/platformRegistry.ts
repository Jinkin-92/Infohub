/**
 * 平台采集器注册表
 * Phase 5: 服务注册表模式
 *
 * 新平台接入只需三步:
 *   1. 实现 ContentSource 接口
 *   2. import { registerPlatform } from './platformRegistry'
 *   3. registerPlatform(new MyPlatformSource())
 */

import type { ContentSource } from '../interfaces/contentSource.js';

const registry = new Map<string, ContentSource>();

/**
 * 注册平台采集器
 */
export function registerPlatform(source: ContentSource): void {
  if (registry.has(source.platform)) {
    console.warn(`[PlatformRegistry] Overwriting existing platform: ${source.platform}`);
  }
  registry.set(source.platform, source);
  console.log(`[PlatformRegistry] Registered platform: ${source.platform}`);
}

/**
 * 获取平台采集器
 */
export function getPlatform(name: string): ContentSource | undefined {
  return registry.get(name);
}

/**
 * 检查平台是否已注册
 */
export function hasPlatform(name: string): boolean {
  return registry.has(name);
}

/**
 * 获取所有已注册平台名称
 */
export function listPlatforms(): string[] {
  return Array.from(registry.keys());
}

/**
 * 清除所有注册（主要用于测试）
 */
export function clearRegistry(): void {
  registry.clear();
}

// 自动注册内置平台适配器
// 使用动态导入避免循环依赖
async function registerBuiltinPlatforms(): Promise<void> {
  const { bilibiliAdapter, weiboAdapter, xAdapter, zhihuAdapter, youtubeAdapter } =
    await import('./platformAdapters.js');
  registerPlatform(bilibiliAdapter);
  registerPlatform(weiboAdapter);
  registerPlatform(xAdapter);
  registerPlatform(zhihuAdapter);
  registerPlatform(youtubeAdapter);
}

// 启动时注册
registerBuiltinPlatforms().catch((err) =>
  console.error('[PlatformRegistry] Failed to register builtin platforms:', err)
);
