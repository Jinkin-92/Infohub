import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { serve } from '@hono/node-server';
import { init } from 'rsshub';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env');
const tmpDir = path.join(rootDir, '.tmp');
const pidPath = path.join(tmpDir, 'rsshub.pid');

dotenv.config({ path: envPath });
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(pidPath, `${process.pid}\n`, 'utf8');

function findServerAppModule() {
  const distDir = path.join(rootDir, 'node_modules', 'rsshub', 'dist-lib');
  const files = fs.readdirSync(distDir).filter((file) => file.startsWith('app-') && file.endsWith('.mjs'));

  for (const file of files) {
    const fullPath = path.join(distDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('export { app as default }')) {
      return fullPath;
    }
  }

  throw new Error('Could not locate the RSSHub server app module');
}

const port = Number.parseInt(process.env.PORT || '1200', 10);

await init({
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: String(port),
  LISTEN_INADDR_ANY: process.env.LISTEN_INADDR_ANY || 'true',
  CACHE_TYPE: process.env.CACHE_TYPE || 'memory',
  ZHIHU_COOKIES: process.env.ZHIHU_COOKIES,
});

// Force the local wrapper to behave like the normal RSSHub server so routes
// render RSS/XML instead of package-mode JSON responses.
process.env.IS_PACKAGE = '';

const appModulePath = findServerAppModule();
const { default: app } = await import(pathToFileURL(appModulePath).href);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[rsshub-local] Running at http://localhost:${info.port}`);
  }
);

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
