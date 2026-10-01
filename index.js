import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const config = {
  engine: (process.env.ENGINE || 'FETCH').toUpperCase(),
  cookie: process.env.GOOGLE_COOKIE || '',
  keywords: (process.env.TARGET_KEYWORDS || 'Langganan sudah digunakan, Link langganan ini sudah digunakan, sudah digunakan')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean),
  matchMode: (process.env.MATCH_MODE || 'ANY').toUpperCase(),
  caseSensitive: process.env.CASE_SENSITIVE === 'true',
  headless: process.env.HEADLESS !== 'false',
  timeoutMs: parseInt(process.env.TIMEOUT_MS || '30000', 10),
  delayMs: parseInt(process.env.DELAY_MS || '1000', 10),
  linksFile: process.env.LINKS_FILE || 'links.txt',
  saveScreenshotOnFound: process.env.SAVE_SCREENSHOT_ON_FOUND === 'true',
  resultsDir: 'results'
};

// Format tanggal lokal ramah baca (DD MMM YYYY, HH:mm:ss WIB)
function formatHumanDateTime(date = new Date()) {
  const d = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  const pad = n => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${d} ${m} ${y}, ${time} WIB`;
}

// Format tanggal standar database/CSV (YYYY-MM-DD HH:mm:ss)
function getLocalDateTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Format jam saja (HH:mm:ss)
function formatTimeOnly(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Otomatis mencari dan menyinkronkan cookie Google (seperti di gemini-jio)
async function resolveGoogleCookies() {
  let panelUrl = process.env.PANEL_API_URL;
  let panelKey = process.env.PANEL_API_KEY;
  let panelServer = process.env.PANEL_SERVER_ID;
  let panelPath = process.env.PANEL_COOKIE_PATH || '/google_keepalive/google_cookies.json';

  // 1. Coba deteksi kredensial panel dari ../gemini-jio/.env jika di folder lokal belum diset
  const neighborEnv = path.resolve('../gemini-jio/.env');
  if ((!panelUrl || !panelKey) && fs.existsSync(neighborEnv)) {
    try {
      const lines = fs.readFileSync(neighborEnv, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)\s*=\s*["']?(.*?)["']?$/);
        if (match) {
          if (match[1] === 'PANEL_API_URL') panelUrl = match[2];
          if (match[1] === 'PANEL_API_KEY') panelKey = match[2];
          if (match[1] === 'PANEL_SERVER_ID') panelServer = match[2];
          if (match[1] === 'PANEL_COOKIE_PATH') panelPath = match[2];
        }
      }
    } catch (_) {}
  }

  // 2. Tarik langsung dari Panel API Pterodactyl (Real-time auto-sync)
  if (panelUrl && panelKey && panelServer) {
    try {
      const url = panelUrl.replace(/\/+$/, '') + '/api/client/servers/' + encodeURIComponent(panelServer) +
          '/files/contents?file=' + encodeURIComponent(panelPath);
      const res = await fetch(url, {
          headers: { 'Authorization': 'Bearer ' + panelKey, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = JSON.parse(await res.text());
        fs.writeFileSync('google_cookies.json', JSON.stringify(data, null, 2), 'utf8');
        const cookieStr = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('; ');
        return { cookie: cookieStr, label: 'Otomatis dari Panel (Auto-Sync 🔄)' };
      }
    } catch (_) {}
  }

  // 3. Cek file google_cookies.json lokal atau di ../gemini-jio/
  const candidateFiles = [
    path.resolve('google_cookies.json'),
    path.resolve('../gemini-jio/google_cookies.json')
  ];
  for (const cf of candidateFiles) {
    if (fs.existsSync(cf)) {
      try {
        const data = JSON.parse(fs.readFileSync(cf, 'utf8'));
        const cookieStr = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('; ');
        if (cookieStr) {
          return { cookie: cookieStr, label: `Otomatis dari ${path.basename(cf)}` };
        }
      } catch (_) {}
    }
  }

  // 4. Fallback ke GOOGLE_COOKIE di .env
  if (process.env.GOOGLE_COOKIE) {
    return { cookie: process.env.GOOGLE_COOKIE, label: 'Manual dari .env' };
  }

  return { cookie: '', label: 'Tidak ada' };
}

// Otomatis memperbarui cookie Google via endpoint RotateCookies
async function tryRotateCookies(currentCookie) {
  if (!currentCookie) return null;

  try {
    const res = await fetch('https://accounts.google.com/RotateCookies', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cookie': currentCookie,
        'origin': 'https://accounts.google.com',
        'referer': 'https://accounts.google.com/RotateCookiesPage?og_pid=459&rot=3&origin=https%3A%2F%2Fone.google.com&exp_id=0',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
      },
      body: JSON.stringify([459, '7550153183429483664'])
    });

    if (!res.ok) return null;

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (!setCookies || setCookies.length === 0) return null;

    const cookieMap = new Map();
    currentCookie.split(';').forEach(c => {
      const parts = c.trim().split('=');
      const k = parts[0];
      const v = parts.slice(1).join('=');
      if (k) cookieMap.set(k, v);
    });

    for (const sc of setCookies) {
      const nameVal = sc.split(';')[0];
      const parts = nameVal.trim().split('=');
      const k = parts[0];
      const v = parts.slice(1).join('=');
      if (k) cookieMap.set(k, v);
    }

    const newCookie = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

    // Simpan juga ke file google_cookies.json lokal
    try {
      const obj = Object.fromEntries(cookieMap.entries());
      fs.writeFileSync('google_cookies.json', JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {}

    return newCookie;
  } catch (err) {
    return null;
  }
}

// Inisialisasi folder hasil
function initResultsDirectory() {
  if (!fs.existsSync(config.resultsDir)) {
    fs.mkdirSync(config.resultsDir, { recursive: true });
  }

  // Header CSV dengan format UTF-8 BOM untuk Excel
  const csvPath = path.join(config.resultsDir, 'summary.csv');
  fs.writeFileSync(
    csvPath,
    '\uFEFFNo,Waktu,Status,Paket,Promo,Berakhir,URL\n',
    'utf8'
  );

  // Reset file output utama
  fs.writeFileSync(path.join(config.resultsDir, 'available_links.txt'), '', 'utf8');
  fs.writeFileSync(path.join(config.resultsDir, 'used.txt'), '', 'utf8');
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
function logResultToCsv(no, status, paket = '-', promo = '-', berakhir = '-', url = '', waktu = new Date()) {
  const csvPath = path.join(config.resultsDir, 'summary.csv');
  const waktuStr = getLocalDateTime(waktu);
  const esc = str => `"${String(str || '-').replace(/"/g, '""')}"`;
  const row = `${no},${esc(waktuStr)},${esc(status)},${esc(paket)},${esc(promo)},${esc(berakhir)},${esc(url)}\n`;
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
async function checkWithFetch(links, activeCookie) {
  const stats = { total: links.length, available: 0, used: 0, needLogin: 0, error: 0 };

  const getHeaders = (cookieVal) => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(cookieVal ? { 'Cookie': cookieVal } : {})
  });

  let currentCookie = activeCookie;

  for (let i = 0; i < links.length; i++) {
    const itemNo = i + 1;
    let rawUrl = links[i];
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = 'https://' + rawUrl;
    }

    // Otomatis normalisasi link serviceactivation.google.com ke one.google.com
    if (rawUrl.includes('serviceactivation.google.com/subscription/new/')) {
      rawUrl = rawUrl.replace(
        'serviceactivation.google.com/subscription/new/',
        'one.google.com/activate-plan/subscription/new/'
      );
    }

    const now = new Date();
    const timeBadge = chalk.gray(`[${formatTimeOnly(now)}]`);
    const counter = `[${itemNo}/${links.length}]`;
    const shortUrl = formatShortUrl(rawUrl);

    try {
      let response = await fetch(rawUrl, {
        headers: getHeaders(currentCookie),
        redirect: 'follow'
      });

      let finalUrl = response.url;
      let htmlText = await response.text();
      let title = extractTitle(htmlText);

      // Cek apakah terlempar ke login
      let isLoginRedirect = finalUrl.includes('accounts.google.com') ||
        title.toLowerCase().includes('sign in') ||
        title.toLowerCase().includes('masuk - akun google');

      // Jika terlempar ke login, coba auto-refresh via RotateCookies sekali
      if (isLoginRedirect) {
        const rotated = await tryRotateCookies(currentCookie);
        if (rotated) {
          currentCookie = rotated;
          response = await fetch(rawUrl, {
            headers: getHeaders(currentCookie),
            redirect: 'follow'
          });
          finalUrl = response.url;
          htmlText = await response.text();
          title = extractTitle(htmlText);
          isLoginRedirect = finalUrl.includes('accounts.google.com') ||
            title.toLowerCase().includes('sign in') ||
            title.toLowerCase().includes('masuk - akun google');
        }
      }

      if (isLoginRedirect) {
        stats.needLogin++;
        console.log(`${counter} ${timeBadge} ` + chalk.magenta.bold('⚠️  [NEED_LOGIN]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.magenta('Sesi cookie kedaluwarsa (perlu update sesi)\n'));
        logResultToFile('need_login.txt', rawUrl);
        logResultToCsv(itemNo, 'NEED_LOGIN', '-', '-', '-', rawUrl, now);
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
        console.log(`${counter} ${timeBadge} ` + chalk.yellow.bold('✗ [USED]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.yellow('Sudah pernah digunakan / hangus\n'));
        logResultToFile('used.txt', rawUrl);
        logResultToCsv(itemNo, 'USED', '-', '-', '-', rawUrl, now);
      } else {
        // 3. AVAILABLE / VALID
        stats.available++;
        const promo = extractGoogleOneDetails(htmlText);

        console.log(`${counter} ${timeBadge} ` + chalk.green.bold('✓ [AVAILABLE / VALID]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Paket    : `) + chalk.cyan(promo.plan));
        console.log(chalk.gray(`      Promo    : `) + chalk.green.bold(promo.duration));
        console.log(chalk.gray(`      Berakhir : `) + chalk.white(promo.expiry));
        if (promo.hasButton) {
          console.log(chalk.gray(`      Tombol   : `) + chalk.green('[Aktifkan paket] Siap Klaim!'));
        }
        console.log('');

        logResultToFile('available_links.txt', rawUrl);
        logResultToCsv(itemNo, 'AVAILABLE', promo.plan, promo.duration, promo.expiry, rawUrl, now);
      }

    } catch (err) {
      stats.error++;
      console.log(`${counter} ${timeBadge} ` + chalk.red.bold('! [ERROR]'));
      console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
      console.log(chalk.gray(`      Pesan    : `) + chalk.red(err.message) + '\n');
      logResultToFile('errors.txt', `${rawUrl} | Error: ${err.message}`);
      logResultToCsv(itemNo, 'ERROR', '-', '-', '-', rawUrl, now);
    }

    if (i < links.length - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  return stats;
}

// Pemeriksaan dengan engine PUPPETEER (Browser Automation)
async function checkWithPuppeteer(links, activeCookie) {
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

  if (activeCookie) {
    const cookies = parseCookiesForPuppeteer(activeCookie);
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

    // Normalisasi serviceactivation -> one.google.com
    if (rawUrl.includes('serviceactivation.google.com/subscription/new/')) {
      rawUrl = rawUrl.replace(
        'serviceactivation.google.com/subscription/new/',
        'one.google.com/activate-plan/subscription/new/'
      );
    }

    const now = new Date();
    const timeBadge = chalk.gray(`[${formatTimeOnly(now)}]`);
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
        console.log(`${counter} ${timeBadge} ` + chalk.magenta.bold('⚠️  [NEED_LOGIN]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.magenta('Sesi login belum aktif\n'));
        logResultToFile('need_login.txt', rawUrl);
        logResultToCsv(itemNo, 'NEED_LOGIN', '-', '-', '-', rawUrl, now);
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
        console.log(`${counter} ${timeBadge} ` + chalk.yellow.bold('✗ [USED]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Catatan  : `) + chalk.yellow('Sudah pernah digunakan / hangus\n'));
        logResultToFile('used.txt', rawUrl);
        logResultToCsv(itemNo, 'USED', '-', '-', '-', rawUrl, now);
      } else {
        // 3. AVAILABLE / VALID
        stats.available++;
        const promo = extractGoogleOneDetails(pageData.html);

        console.log(`${counter} ${timeBadge} ` + chalk.green.bold('✓ [AVAILABLE / VALID]'));
        console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
        console.log(chalk.gray(`      Paket    : `) + chalk.cyan(promo.plan));
        console.log(chalk.gray(`      Promo    : `) + chalk.green.bold(promo.duration));
        console.log(chalk.gray(`      Berakhir : `) + chalk.white(promo.expiry));
        if (promo.hasButton) {
          console.log(chalk.gray(`      Tombol   : `) + chalk.green('[Aktifkan paket] Siap Klaim!'));
        }
        console.log('');

        logResultToFile('available_links.txt', rawUrl);
        logResultToCsv(itemNo, 'AVAILABLE', promo.plan, promo.duration, promo.expiry, rawUrl, now);
      }

    } catch (err) {
      stats.error++;
      console.log(`${counter} ${timeBadge} ` + chalk.red.bold('! [ERROR]'));
      console.log(chalk.gray(`      URL      : `) + chalk.white(shortUrl));
      console.log(chalk.gray(`      Pesan    : `) + chalk.red(err.message) + '\n');
      logResultToFile('errors.txt', `${rawUrl} | Error: ${err.message}`);
      logResultToCsv(itemNo, 'ERROR', '-', '-', '-', rawUrl, now);
    }

    if (i < links.length - 1 && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  await browser.close();
  return stats;
}

async function main() {
  const startTime = new Date();
  initResultsDirectory();

  const links = readLinksFromFile(config.linksFile);
  if (links.length === 0) {
    console.log(chalk.yellow(`\n[!] Tidak ada link untuk diperiksa di "${config.linksFile}".`));
    console.log(chalk.gray(`    Silakan tambahkan daftar link ke dalam file ${config.linksFile} lalu jalankan ulang.\n`));
    process.exit(0);
  }

  // 1. Dapatkan cookie secara otomatis (Panel API / google_cookies.json / .env)
  const cookieResolution = await resolveGoogleCookies();
  let activeCookie = cookieResolution.cookie;
  let cookieStatusLabel = cookieResolution.label;

  // 2. Jika ada cookie, coba lakukan rotation check agar semakin segar
  if (activeCookie) {
    const rotated = await tryRotateCookies(activeCookie);
    if (rotated) {
      activeCookie = rotated;
      cookieStatusLabel += ' + Auto-Rotated 🔄';
    }
  }

  console.log(chalk.cyan.bold('\n============================================================'));
  console.log(chalk.cyan.bold('              GOOGLE ONE / GEMINI LINK CHECKER              '));
  console.log(chalk.cyan.bold('============================================================'));
  console.log(
    chalk.white(`  Waktu Mulai: `) + chalk.yellow.bold(formatHumanDateTime(startTime)) + '\n' +
    chalk.white(`  Total Link : `) + chalk.bold(links.length) + '\n' +
    chalk.white(`  Mode Mesin : `) + chalk.green.bold(config.engine === 'FETCH' ? 'FAST FETCH (HTTP Request)' : 'PUPPETEER (Browser)') + '\n' +
    chalk.white(`  Sesi Cookie: `) + (activeCookie ? chalk.green(cookieStatusLabel) : chalk.red('Tidak ada'))
  );
  console.log(chalk.cyan.bold('============================================================\n'));

  const stats = config.engine === 'PUPPETEER'
    ? await checkWithPuppeteer(links, activeCookie)
    : await checkWithFetch(links, activeCookie);

  const endTime = new Date();
  const durationSec = Math.round((endTime - startTime) / 1000);

  // Tulis header keterangan waktu di file output results/available_links.txt
  const availablePath = path.join(config.resultsDir, 'available_links.txt');
  if (fs.existsSync(availablePath)) {
    const content = fs.readFileSync(availablePath, 'utf8').trim();
    const headerInfo = [
      `# ============================================================`,
      `# HASIL PENGECEKAN LINK AKTIF (VALID / BISA DIKLAIM)`,
      `# Waktu Pengecekan : ${formatHumanDateTime(endTime)}`,
      `# Total Ditemukan  : ${stats.available} dari ${stats.total} link`,
      `# ============================================================`,
      ``
    ].join('\n');
    fs.writeFileSync(availablePath, content ? `${headerInfo}${content}\n` : '', 'utf8');
  }

  // Tulis header di results/used.txt
  const usedPath = path.join(config.resultsDir, 'used.txt');
  if (fs.existsSync(usedPath)) {
    const content = fs.readFileSync(usedPath, 'utf8').trim();
    if (content) {
      const headerInfo = [
        `# ============================================================`,
        `# DAFTAR LINK HANGUS (SUDAH DIGUNAKAN)`,
        `# Waktu Pengecekan : ${formatHumanDateTime(endTime)}`,
        `# Total Hangus     : ${stats.used} link`,
        `# ============================================================`,
        ``
      ].join('\n');
      fs.writeFileSync(usedPath, `${headerInfo}${content}\n`, 'utf8');
    }
  }

  // Ringkasan hasil rapi dengan waktu lengkap
  console.log(chalk.cyan.bold('============================================================'));
  console.log(chalk.cyan.bold('                      RINGKASAN HASIL                       '));
  console.log(chalk.cyan.bold('============================================================'));
  console.log(chalk.white(`  Waktu Selesai            : `) + chalk.yellow(formatHumanDateTime(endTime)));
  console.log(chalk.white(`  Durasi Pengecekan        : `) + chalk.cyan(`${durationSec} detik`));
  console.log(chalk.gray('------------------------------------------------------------'));
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
