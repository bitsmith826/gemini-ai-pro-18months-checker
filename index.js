import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import chalk from 'chalk';
import { config } from './config.js';

// Format tanggal lokal (YYYY-MM-DD HH:mm:ss)
function getLocalDateTime() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// Inisialisasi & reset folder hasil per batch agar selalu rapi
function initResultsDirectory() {
  if (!fs.existsSync(config.resultsDir)) {
    fs.mkdirSync(config.resultsDir, { recursive: true });
  }

  // Header CSV yang terstruktur rapi untuk Excel
  const csvPath = path.join(config.resultsDir, 'summary.csv');
  fs.writeFileSync(
    csvPath,
    '\uFEFFNo,Waktu,Status,Paket,Promo,Berakhir,URL\n',
    'utf8'
  );

  // Reset file output batch
  fs.writeFileSync(path.join(config.resultsDir, 'available_links.txt'), '', 'utf8');
  fs.writeFileSync(path.join(config.resultsDir, 'available.txt'), '', 'utf8');
  fs.writeFileSync(path.join(config.resultsDir, 'used.txt'), '', 'utf8');
  fs.writeFileSync(path.join(config.resultsDir, 'need_login.txt'), '', 'utf8');
  fs.writeFileSync(path.join(config.resultsDir, 'errors.txt'), '', 'utf8');
}

// Baca daftar link dari file
function readLinksFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`[!] File "${filePath}" belum ada. Membuat file contoh...`));
    fs.writeFileSync(filePath, '# Masukkan daftar tautan URL di sini (1 per baris)\n', 'utf8');
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

// Format URL agar ringkas di terminal
function formatShortUrl(url, maxLen = 65) {
  if (url.length <= maxLen) return url;
  const start = url.substring(0, 42);
  const end = url.substring(url.length - 18);
  return `${start}...${end}`;
}

// Append hasil ke file teks
function logResultToFile(filename, line) {
  const filePath = path.join(config.resultsDir, filename);
  fs.appendFileSync(filePath, line + '\n', 'utf8');
}

// Append record ke CSV dengan kolom rapi
function logResultToCsv(no, status, paket = '-', promo = '-', berakhir = '-', url = '') {
  const csvPath = path.join(config.resultsDir, 'summary.csv');
  const waktu = getLocalDateTime();
  const esc = str => `"${String(str || '-').replace(/"/g, '""')}"`;
  const row = `${no},${esc(waktu)},${esc(status)},${esc(paket)},${esc(promo)},${esc(berakhir)},${esc(url)}\n`;
  fs.appendFileSync(csvPath, row, 'utf8');
}

// Helper sleep
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper ekstrak title dari HTML
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

// Helper ekstrak detail promo Google One / Gemini
function extractGoogleOneDetails(html) {
  const planMatch = html.match(/>([^<]*Aktifkan paket[^<]*)</i);
  const durationMatch = html.match(/>([^<]*gratis selama[^<]*)</i);
  const expiryMatch = html.match(/>([^<]*akan berakhir pada[^<]*)</i);
  const buttonMatch = html.match(/>([^<]*Aktifkan[^<]*)</i);

  const plan = planMatch
    ? planMatch[1].replace(/Aktifkan paket\s*/i, '').replace(/seharga\s*$/i, '').trim()
    : 'Google One';
  const duration = durationMatch ? durationMatch[1].trim() : '-';
  const expiry = expiryMatch ? expiryMatch[1].replace(/^.*akan berakhir pada\s*/i, '').trim() : '-';
  const hasButton = !!buttonMatch;

  return {
    plan,
    duration,
    expiry,
    hasButton,
    summary: `${plan} | ${duration} | Berakhir: ${expiry}`
  };
}

// Parse string cookie untuk Puppeteer
function parseCookiesForPuppeteer(cookieStr, domain = '.google.com') {
  if (!cookieStr) return [];
  return cookieStr
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) return null;
      const name = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      return { name, value, domain };
    })
    .filter(Boolean);
}

// Pemeriksaan dengan engine FETCH (Super Cepat)
async function checkWithFetch(links) {
  const stats = { total: links.length, available: 0, used: 0, needLogin: 0, error: 0 };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };

  if (config.cookie) {
    headers['Cookie'] = config.cookie;
  }

  for (let i = 0; i < links.length; i++) {
    const itemNo = i + 1;
    let rawUrl = links[i];
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = 'https://' + rawUrl;
    }

    const counter = `[${itemNo}/${links.length}]`;
    const shortUrl = formatShortUrl(rawUrl);

    try {
      const response = await fetch(rawUrl, {
        headers,
        redirect: 'follow'
      });

      const finalUrl = response.url;
      const htmlText = await response.text();
      const title = extractTitle(htmlText);

      // 1. Cek login redirect
      const isLoginRedirect = finalUrl.includes('accounts.google.com') ||
        title.toLowerCase().includes('sign in') ||
        title.toLowerCase().includes('masuk - akun google');

      if (isLoginRedirect) {
        stats.needLogin++;
        console.log(chalk.magenta.bold(`${counter} ⚠️  [NEED_LOGIN]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.magenta('Cookie login belum aktif / kedaluwarsa\n'));
        logResultToFile('need_login.txt', rawUrl);
        logResultToCsv(itemNo, 'NEED_LOGIN', '-', '-', '-', rawUrl);
        continue;
      }

      // 2. Cek apakah sudah digunakan (USED)
      const checkText = config.caseSensitive ? htmlText : htmlText.toLowerCase();
      const matchedKeywords = [];
      for (const kw of config.keywords) {
        const target = config.caseSensitive ? kw : kw.toLowerCase();
        if (checkText.includes(target)) {
          matchedKeywords.push(kw);
        }
      }

      const isUsed = matchedKeywords.length > 0;

      if (isUsed) {
        stats.used++;
        console.log(chalk.yellow.bold(`${counter} ✗ [USED]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.yellow('Sudah pernah digunakan / hangus\n'));
        logResultToFile('used.txt', rawUrl);
        logResultToCsv(itemNo, 'USED', '-', '-', '-', rawUrl);
      } else {
        // 3. AVAILABLE / VALID
        stats.available++;
        const promo = extractGoogleOneDetails(htmlText);

        console.log(chalk.green.bold(`${counter} ✓ [AVAILABLE / VALID]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Paket    : `) + chalk.cyan(promo.plan));
        console.log(chalk.gray(`      Promo    : `) + chalk.green.bold(promo.duration));
        console.log(chalk.gray(`      Berakhir : `) + chalk.white(promo.expiry));
        if (promo.hasButton) {
          console.log(chalk.gray(`      Tombol   : `) + chalk.green('[Aktifkan paket] Siap Klaim!'));
        }
        console.log('');

        // Simpan hanya link murni di available_links.txt untuk kemudahan copy-paste
        logResultToFile('available_links.txt', rawUrl);
        // Simpan link + detail di available.txt
        logResultToFile('available.txt', `${rawUrl} | ${promo.summary}`);
        logResultToCsv(itemNo, 'AVAILABLE', promo.plan, promo.duration, promo.expiry, rawUrl);
      }

    } catch (err) {
      stats.error++;
      console.log(chalk.red.bold(`${counter} ! [ERROR]`));
      console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
      console.log(chalk.gray(`      Pesan    : `) + chalk.red(err.message) + '\n');
      logResultToFile('errors.txt', `${rawUrl} | Error: ${err.message}`);
      logResultToCsv(itemNo, 'ERROR', '-', '-', '-', rawUrl);
    }

    if (i < links.length - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  return stats;
}

// Pemeriksaan dengan engine PUPPETEER (Browser Automation)
async function checkWithPuppeteer(links) {
  const stats = { total: links.length, available: 0, used: 0, needLogin: 0, error: 0 };

  console.log(chalk.gray('⏳ Membuka browser Chromium...'));
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--remote-debugging-port=0',
      '--lang=id-ID,id'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
  });

  if (config.cookie) {
    const cookies = parseCookiesForPuppeteer(config.cookie);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }
  }

  console.log('');

  for (let i = 0; i < links.length; i++) {
    const itemNo = i + 1;
    let rawUrl = links[i];
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = 'https://' + rawUrl;
    }

    const counter = `[${itemNo}/${links.length}]`;
    const shortUrl = formatShortUrl(rawUrl);

    try {
      try {
        await page.goto(rawUrl, {
          waitUntil: 'networkidle2',
          timeout: config.timeoutMs
        });
      } catch (navErr) {
        if (navErr.message.includes('timeout') || navErr.message.includes('Navigation timeout')) {
          await page.goto(rawUrl, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeoutMs
          });
        } else {
          throw navErr;
        }
      }

      await sleep(1000);

      const currentUrl = page.url();
      const pageData = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const title = document.title || '';
        const html = document.documentElement.outerHTML || '';
        return { title, bodyText, html };
      });

      // 1. Cek login redirect
      const isLoginRedirect = currentUrl.includes('accounts.google.com') ||
        pageData.title.toLowerCase().includes('sign in') ||
        pageData.title.toLowerCase().includes('masuk - akun google');

      if (isLoginRedirect) {
        stats.needLogin++;
        console.log(chalk.magenta.bold(`${counter} ⚠️  [NEED_LOGIN]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.magenta('Cookie login belum aktif / kedaluwarsa\n'));
        logResultToFile('need_login.txt', rawUrl);
        logResultToCsv(itemNo, 'NEED_LOGIN', '-', '-', '-', rawUrl);
        continue;
      }

      // 2. Cek apakah sudah digunakan (USED)
      const fullText = config.caseSensitive
        ? `${pageData.title}\n${pageData.bodyText}\n${pageData.html}`
        : `${pageData.title}\n${pageData.bodyText}\n${pageData.html}`.toLowerCase();

      const matchedKeywords = [];
      for (const kw of config.keywords) {
        const target = config.caseSensitive ? kw : kw.toLowerCase();
        if (fullText.includes(target)) {
          matchedKeywords.push(kw);
        }
      }

      const isUsed = matchedKeywords.length > 0;

      if (isUsed) {
        stats.used++;
        console.log(chalk.yellow.bold(`${counter} ✗ [USED]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.yellow('Sudah pernah digunakan / hangus\n'));
        logResultToFile('used.txt', rawUrl);
        logResultToCsv(itemNo, 'USED', '-', '-', '-', rawUrl);
      } else {
        // 3. AVAILABLE / VALID
        stats.available++;
        const promo = extractGoogleOneDetails(pageData.html);

        console.log(chalk.green.bold(`${counter} ✓ [AVAILABLE / VALID]`));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Paket    : `) + chalk.cyan(promo.plan));
        console.log(chalk.gray(`      Promo    : `) + chalk.green.bold(promo.duration));
        console.log(chalk.gray(`      Berakhir : `) + chalk.white(promo.expiry));
        if (promo.hasButton) {
          console.log(chalk.gray(`      Tombol   : `) + chalk.green('[Aktifkan paket] Siap Klaim!'));
        }
        console.log('');

        logResultToFile('available_links.txt', rawUrl);
        logResultToFile('available.txt', `${rawUrl} | ${promo.summary}`);
        logResultToCsv(itemNo, 'AVAILABLE', promo.plan, promo.duration, promo.expiry, rawUrl);
      }

    } catch (err) {
      stats.error++;
      console.log(chalk.red.bold(`${counter} ! [ERROR]`));
      console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
      console.log(chalk.gray(`      Pesan    : `) + chalk.red(err.message) + '\n');
      logResultToFile('errors.txt', `${rawUrl} | Error: ${err.message}`);
      logResultToCsv(itemNo, 'ERROR', '-', '-', '-', rawUrl);
    }

    if (i < links.length - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  await browser.close();
  return stats;
}

async function main() {
  initResultsDirectory();

  const links = readLinksFromFile(config.linksFile);
  if (links.length === 0) {
    console.log(chalk.yellow(`\n[!] Tidak ada link untuk diperiksa di "${config.linksFile}".`));
    console.log(chalk.gray(`    Silakan tambahkan daftar link ke dalam file ${config.linksFile} lalu jalankan ulang.\n`));
    process.exit(0);
  }

  if (config.keywords.length === 0) {
    console.log(chalk.red('\n[!] Error: TARGET_KEYWORDS belum ditentukan di .env!\n'));
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n============================================================'));
  console.log(chalk.cyan.bold('              GOOGLE ONE / GEMINI LINK CHECKER              '));
  console.log(chalk.cyan.bold('============================================================'));
  console.log(
    chalk.white(`  Total Link : `) + chalk.bold(links.length) + '\n' +
    chalk.white(`  Mode Mesin : `) + chalk.green.bold(config.engine === 'FETCH' ? 'FAST FETCH (HTTP Request)' : 'PUPPETEER (Browser)') + '\n' +
    chalk.white(`  Sesi Cookie: `) + (config.cookie ? chalk.green('Aktif (Valid)') : chalk.red('Tidak ada'))
  );
  console.log(chalk.cyan.bold('============================================================\n'));

  const stats = config.engine === 'PUPPETEER'
    ? await checkWithPuppeteer(links)
    : await checkWithFetch(links);

  // Ringkasan hasil rapi
  console.log(chalk.cyan.bold('============================================================'));
  console.log(chalk.cyan.bold('                      RINGKASAN HASIL                       '));
  console.log(chalk.cyan.bold('============================================================'));
  console.log(
    chalk.green.bold(`  ✓ AVAILABLE (Siap Pakai) : `) +
    chalk.green.bold(`${stats.available} link`) +
    chalk.gray(` -> results/available_links.txt`)
  );
  console.log(
    chalk.yellow.bold(`  ✗ USED (Hangus)          : `) +
    chalk.yellow.bold(`${stats.used} link`) +
    chalk.gray(` -> results/used.txt`)
  );
  if (stats.needLogin > 0) {
    console.log(
      chalk.magenta.bold(`  ⚠️ NEED_LOGIN (Perlu Sesi): `) +
      chalk.magenta.bold(`${stats.needLogin} link`) +
      chalk.gray(` -> results/need_login.txt`)
    );
  }
  if (stats.error > 0) {
    console.log(
      chalk.red.bold(`  ! ERROR (Gagal)          : `) +
      chalk.red.bold(`${stats.error} link`) +
      chalk.gray(` -> results/errors.txt`)
    );
  }
  console.log(chalk.gray('------------------------------------------------------------'));
  console.log(chalk.white(`  📊 Tabel Lengkap Excel   : `) + chalk.cyan(`results/summary.csv`));
  console.log(chalk.cyan.bold('============================================================\n'));
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err);
  process.exit(1);
});
