import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const config = {
  engine: (process.env.ENGINE || 'FETCH').toUpperCase(),
  cookie: process.env.GOOGLE_COOKIE || '',
  keywords: (process.env.TARGET_KEYWORDS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean),
  matchMode: (process.env.MATCH_MODE || 'ANY').toUpperCase(),
  caseSensitive: process.env.CASE_SENSITIVE === 'true',
  headless: process.env.HEADLESS !== 'false', // default true
  timeoutMs: parseInt(process.env.TIMEOUT_MS || '30000', 10),
  delayMs: parseInt(process.env.DELAY_MS || '1000', 10),
  linksFile: process.env.LINKS_FILE || 'links.txt',
  saveScreenshotOnFound: process.env.SAVE_SCREENSHOT_ON_FOUND === 'true',
  resultsDir: 'results'
};
