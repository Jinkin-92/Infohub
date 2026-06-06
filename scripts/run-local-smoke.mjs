#!/usr/bin/env node

import { parseArgs, selectTargetSource } from './local-smoke-lib.mjs';

const DEFAULT_FRONTEND_URL = process.env.INFOHUB_FRONTEND_URL || 'http://localhost:3000';
const DEFAULT_BACKEND_URL = process.env.INFOHUB_BACKEND_URL || 'http://localhost:3002';

const DEFAULT_PLATFORM_TEST_URLS = {
  wechat: 'https://mp.weixin.qq.com/s/r6rCmay_PJxc9I-huNmjcA',
  weibo: 'https://weibo.com/1788911247?refer_flag=1001030103_',
  x: 'https://x.com/oooodjdjd',
  xiaohongshu:
    'https://www.xiaohongshu.com/user/profile/669f985a000000000d027d9f?xsec_token=ABcbHMoapyi56-qoJsruhheNUeFUVCBOlGY_Wdi72z4tU=&xsec_source=pc_search',
  zhihu: 'https://www.zhihu.com/people/fu-lan-ke-yang',
};

const STRICT_DEEP_PLATFORMS = new Set(['wechat', 'weibo']);

function logStep(status, message) {
  console.log(`${status} ${message}`);
}

function fail(message) {
  logStep('[FAIL]', message);
}

function pass(message) {
  logStep('[PASS]', message);
}

function info(message) {
  logStep('[INFO]', message);
}

function warn(message) {
  logStep('[WARN]', message);
}

async function requestJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function requestText(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function checkFrontend(frontendUrl) {
  const { response, text } = await requestText(frontendUrl, {}, 15000);
  if (!response.ok) {
    throw new Error(`Frontend returned HTTP ${response.status}`);
  }
  if (!text.trim()) {
    throw new Error('Frontend returned an empty document');
  }
  pass(`Frontend reachable: ${frontendUrl}`);
}

async function checkBackendHealth(backendUrl) {
  const { response, json, text } = await requestJson(`${backendUrl}/health`, {}, 15000);
  if (!response.ok) {
    throw new Error(`/health returned HTTP ${response.status}`);
  }
  if (!json || json.status !== 'healthy' || json.database !== 'connected') {
    throw new Error(`Unexpected health payload: ${text}`);
  }
  pass('Backend health check passed');
}

async function checkPlatforms(backendUrl, deep) {
  const { response, json, text } = await requestJson(`${backendUrl}/api/auth/platforms`);
  if (!response.ok || !json?.ok || !Array.isArray(json.platforms)) {
    throw new Error(`Failed to load platform status: ${text}`);
  }

  pass(`Loaded platform status for ${json.platforms.length} platforms`);

  if (!deep) {
    return json.platforms;
  }

  for (const platform of json.platforms) {
    if (platform.platform === 'wechat' && platform.status !== 'disconnected') {
      const result = await requestJson(`${backendUrl}/api/auth/wechat/verify`, { method: 'POST' });
      if (!result.response.ok || !result.json?.ok || result.json.valid !== true) {
        throw new Error(`WeChat verify failed: ${result.text}`);
      }
      pass('WeChat deep verify passed');
      continue;
    }

    if (platform.status === 'connected' && DEFAULT_PLATFORM_TEST_URLS[platform.platform]) {
      const result = await requestJson(`${backendUrl}/api/auth/${platform.platform}/test`, {
        method: 'POST',
        body: JSON.stringify({ url: DEFAULT_PLATFORM_TEST_URLS[platform.platform] }),
      }, 60000);

      if (!result.response.ok || !result.json?.ok || result.json.result?.success !== true) {
        if (STRICT_DEEP_PLATFORMS.has(platform.platform)) {
          throw new Error(`${platform.platform} deep test failed: ${result.text}`);
        }

        warn(`${platform.displayName || platform.platform} deep test reported a warning: ${result.text}`);
        continue;
      }
      pass(`${platform.displayName || platform.platform} deep test passed`);
    }
  }

  return json.platforms;
}

async function checkSources(backendUrl, sourceId, deep) {
  const { response, json, text } = await requestJson(`${backendUrl}/api/sources`);
  if (!response.ok || !json?.ok || !Array.isArray(json.sources)) {
    throw new Error(`Failed to load source list: ${text}`);
  }

  pass(`Loaded ${json.sources.length} sources`);

  if (!deep) {
    return;
  }

  const { explicitSource, targetSource, fallbackUsed } = selectTargetSource(json.sources, sourceId);

  if (fallbackUsed) {
    warn(`Requested source ${sourceId} was not found, falling back to the first enabled source`);
  }

  if (!targetSource) {
    info('No enabled source found, skipping deep collection test');
    return;
  }

  info(`Running deep collection test on source ${targetSource.id} (${targetSource.name})`);
  const collectResult = await requestJson(`${backendUrl}/api/sources/${targetSource.id}/collect`, {
    method: 'POST',
  }, 120000);

  if (!collectResult.response.ok || collectResult.json?.ok !== true || collectResult.json?.result?.success !== true) {
    throw new Error(`Source collection failed: ${collectResult.text}`);
  }

  pass(
    `Deep collection test passed for source ${targetSource.id}, itemCount=${collectResult.json.result.itemCount}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const backendUrl = DEFAULT_BACKEND_URL.replace(/\/$/, '');
  const frontendUrl = DEFAULT_FRONTEND_URL.replace(/\/$/, '');

  info(`Frontend: ${frontendUrl}`);
  info(`Backend: ${backendUrl}`);
  info(`Mode: ${args.deep ? 'deep' : 'quick'}`);

  await checkFrontend(frontendUrl);
  await checkBackendHealth(backendUrl);
  await checkPlatforms(backendUrl, args.deep);
  await checkSources(backendUrl, args.sourceId, args.deep);

  pass(`Local smoke test completed (${args.deep ? 'deep' : 'quick'})`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
