# Google One & Gemini Pro Link Checker (Node.js)

Aplikasi Node.js untuk memeriksa link aktivasi Google One / Gemini Advanced Pro 18 bulan secara massal (*batch*), dilengkapi dengan fitur **Auto-Refresh Cookie** dan **Pencatatan Waktu Lengkap**.

---

## ⚡ Fitur Unggulan

1. **🔄 Auto-Rotate Cookie**:
   - Terintegrasi dengan endpoint resmi Google `https://accounts.google.com/RotateCookies`.
   - Secara otomatis memperbarui masa aktif cookie sesi (`SIDTS` & `SIDCC`) dan menyimpannya kembali ke file `.env`, sehingga cookie tidak mudah kedaluwarsa.
2. **🕒 Penanda Waktu Lengkap (Timestamp)**:
   - Waktu mulai & selesai pengecekan tertera di terminal beserta durasi detik.
   - Setiap link memiliki jam pengecekan real-time.
   - File output (`results/available_links.txt` dan `results/summary.csv`) dilengkapi tanggal dan jam WIB.
3. **🌐 Normalisasi Link Otomatis**:
   - Mendukung format langsung `one.google.com` maupun format redirector `serviceactivation.google.com`.

---

## 🖥️ Contoh Tampilan Terminal

```text
============================================================
              GOOGLE ONE / GEMINI LINK CHECKER              
============================================================
  Waktu Mulai: 12 Sep 2026, 16:24:55 WIB
  Total Link : 12
  Mode Mesin : FAST FETCH (HTTP Request)
  Sesi Cookie: Aktif (Auto-Refreshed 🔄)
============================================================

[1/12] [16:24:56] ✗ [USED]
      URL      : https://one.google.com/activate-plan/subsc...&g1_landing_page=5
      Catatan  : Sudah pernah digunakan / hangus

[2/12] [16:24:59] ✓ [AVAILABLE / VALID]
      URL      : https://one.google.com/activate-plan/subsc...&g1_landing_page=5
      Paket    : Google AI Pro Anda dari Jio
      Promo    : gratis selama 18 bulan
      Berakhir : 12 Mar 2028
      Tombol   : [Aktifkan paket] Siap Klaim!

============================================================
                      RINGKASAN HASIL                       
============================================================
  Waktu Selesai            : 12 Sep 2026, 16:25:26 WIB
  Durasi Pengecekan        : 31 detik
------------------------------------------------------------
  ✓ AVAILABLE (Siap Pakai) : 11 link -> results/available_links.txt
  ✗ USED (Hangus)          : 1 link  -> results/used.txt
------------------------------------------------------------
  📊 Tabel Lengkap Excel   : results/summary.csv
============================================================
```

---

## 🚀 Cara Penggunaan

1. Buka [links.txt](file:///d:/Coding/gemini-ai-pro-18months-checker/links.txt) dan tempelkan daftar URL.
2. Jalankan:
   - Klik 2x file [run.bat](file:///d:/Coding/gemini-ai-pro-18months-checker/run.bat)
   - Atau ketik `npm start` di terminal.
3. Ambil link aktif di `results/available_links.txt`!
