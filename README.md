# Google One & Gemini Pro Link Checker (Node.js)

> ⚠️ **DISCLAIMER / UNTUK TUJUAN PEMBELAJARAN & EDUKASI**
> Proyek ini dibuat semata-mata untuk tujuan riset teknis, eksplorasi teknologi Node.js, dan edukasi seputar otomatisasi HTTP request, session cookie handling, serta web scraping/automation.
> Proyek ini tidak berafiliasi dengan Google LLC. Penggunaan alat ini sepenuhnya merupakan tanggung jawab masing-masing pengguna. Penulis tidak bertanggung jawab atas segala bentuk penyalahgunaan alat ini.

---

## 📖 Deskripsi Proyek

Aplikasi batch checker berbasis Node.js untuk memeriksa validitas dan ketersediaan tautan promo aktivasi layanan (seperti Google One / Gemini AI Pro) secara massal (*batch*), memverifikasi apakah tautan masih aktif atau sudah pernah diklaim.

### ✨ Fitur Utama:
- ⚡ **Super Cepat (Fast Fetch)**: Menggunakan HTTP Request native yang ringan (~1-2 detik per link).
- 🔄 **Auto-Rotate Session Cookie**: Otomatis memperbarui cookie sesi sementara (`RotateCookies`) agar tidak cepat kedaluwarsa.
- 🕒 **Pencatatan Waktu Lengkap**: Menampilkan waktu mulai, durasi eksekusi, serta jam real-time per link.
- 📊 **Export Hasil Rapi**:
  - `results/available_links.txt` : Kumpulan tautan yang valid dan masih aktif (siap disalin).
  - `results/used.txt` : Tautan yang sudah pernah digunakan.
  - `results/summary.csv` : Rekapitulasi tabel lengkap (kompatibel langsung dengan Microsoft Excel / Google Sheets).

---

## 🖥️ Contoh Output Terminal

```text
============================================================
              GOOGLE ONE / GEMINI LINK CHECKER              
============================================================
  Waktu Mulai: 13 Sep 2026, 11:17:40 WIB
  Total Link : 9
  Mode Mesin : FAST FETCH (HTTP Request)
  Sesi Cookie: Aktif (Auto-Refreshed 🔄)
============================================================

[1/9] [11:17:40] ✓ [AVAILABLE / VALID]
      URL      : https://one.google.com/activate-plan/subsc...L4Gs35VO6R-4HUeQ==
      Paket    : Google AI Pro Anda dari Jio
      Promo    : gratis selama 18 bulan
      Berakhir : 13 Mar 2028
      Tombol   : [Aktifkan paket] Siap Klaim!

============================================================
                      RINGKASAN HASIL                       
============================================================
  Waktu Selesai            : 13 Sep 2026, 11:18:03 WIB
  Durasi Pengecekan        : 23 detik
------------------------------------------------------------
  ✓ AVAILABLE (Siap Pakai) : 9 link -> results/available_links.txt
  ✗ USED (Hangus)          : 0 link -> results/used.txt
------------------------------------------------------------
  📊 Tabel Lengkap Excel   : results/summary.csv
============================================================
```

---

## 🛠️ Panduan Instalasi & Penggunaan

### 1. Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 ke atas)

### 2. Instalasi
Clone repository ini dan install dependensinya:
```bash
git clone https://github.com/bitsmith826/gemini-ai-pro-18months-checker.git
cd gemini-ai-pro-18months-checker
npm install
```

### 3. Konfigurasi
1. Salin template konfigurasi:
   ```bash
   cp .env.example .env
   ```
2. Buka file `.env` dan masukkan cookie sesi Google Anda pada variabel `GOOGLE_COOKIE`.
3. Buat file `links.txt` (atau salin dari `links.example.txt`):
   ```bash
   cp links.example.txt links.txt
   ```
4. Tempelkan daftar tautan yang ingin diperiksa ke dalam `links.txt` (1 baris per link).

### 4. Menjalankan Script
Jalankan perintah:
```bash
npm start
```
Atau di Windows cukup klik dua kali file `run.bat`.

---

## 📄 Lisensi
Didistribusikan di bawah Lisensi MIT. Bebas digunakan untuk tujuan edukasi dan pengembangan pribadi.
