import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const chromePath = join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe');
console.log('Chrome path:', chromePath);
console.log('Chrome exists:', existsSync(chromePath));

// Also check puppeteer cache
const puppeteerPath = 'C:\\Users\\DELL\\.cache\\puppeteer\\chrome\\win64-146.0.7680.153\\chrome-win64\\chrome.exe';
console.log('Puppeteer Chrome exists:', existsSync(puppeteerPath));

const pathToUse = existsSync(chromePath) ? chromePath : puppeteerPath;

try {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: pathToUse,
    args: ['--disable-gpu', '--no-sandbox'],
    timeout: 15000,
  });
  console.log('Browser launched! PID:', browser.process()?.pid);

  const page = await browser.newPage();
  console.log('Page created!');

  await page.goto('https://weibo.com/1788911247', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Navigated! URL:', page.url());

  await new Promise(r => setTimeout(r, 5000));
  console.log('Waited 5s');

  const cookies = await page.cookies('https://weibo.com/');
  console.log('Cookies count:', cookies.length);
  console.log('Cookie names:', cookies.map(c => c.name).join(', '));

  await browser.close();
  console.log('DONE - Browser closed cleanly');
} catch(e) {
  console.error('ERROR:', e.message);
  console.error('Stack:', e.stack);
}
