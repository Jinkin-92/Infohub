import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// rsshub is published as CommonJS (main: lib/pkg.js). Use a default import then
// destructure — ESM named imports fail with "Named export 'init' not found".
import rsshubPkg from 'rsshub';
const { init } = rsshubPkg;

const require = createRequire(import.meta.url);

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env');
const tmpDir = path.join(rootDir, '.tmp');
const pidPath = path.join(tmpDir, 'rsshub.pid');
const rsshubPkgDir = path.join(rootDir, 'node_modules', 'rsshub');

dotenv.config({ path: envPath, override: true });

// Bootstrap global-agent BEFORE any other imports to intercept http/https modules.
// global-agent must be bootstrapped before undici/native fetch is used.
import { bootstrap } from 'global-agent';
bootstrap();

fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(pidPath, `${process.pid}\n`, 'utf8');

const port = Number.parseInt(process.env.PORT || '1200', 10);

// Force package-mode off so routes render RSS/XML instead of JSON envelopes.
// init() merges our conf over its own defaults, including IS_PACKAGE.
process.env.IS_PACKAGE = '';

await init({
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: String(port),
  LISTEN_INADDR_ANY: process.env.LISTEN_INADDR_ANY || 'true',
  CACHE_TYPE: process.env.CACHE_TYPE || 'memory',
  IS_PACKAGE: '',
  ZHIHU_COOKIES: process.env.ZHIHU_COOKIES,
  WEIBO_COOKIES: process.env.WEIBO_COOKIES,
  XIAOHONGSHU_COOKIE: process.env.XIAOHONGSHU_COOKIE,
  TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN,
});

// The Koa app lives in lib/app.js. We have to require it ourselves because
// lib/pkg.js keeps its own reference private. The second require is a cache
// hit (init() already pulled it in), so this is O(1).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require(path.join(rsshubPkgDir, 'lib', 'app.js'));

const listenHost = process.env.LISTEN_INADDR_ANY === 'true' ? null : '127.0.0.1';
app.listen(port, listenHost, () => {
  console.log(`[rsshub-local] Running at http://localhost:${port}`);
});

const cleanup = () => {
  try {
    fs.rmSync(pidPath, { force: true });
  } catch {
    // Ignore cleanup errors.
  }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
