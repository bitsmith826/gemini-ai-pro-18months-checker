# Google One & Gemini Pro Link Checker (Node.js)

Aplikasi Node.js untuk memeriksa daftar tautan aktivasi promo Google One / Gemini Advanced Pro 18 bulan secara massal (*batch*) dengan tampilan output rapi dan akurat.

---

## 🖥️ Contoh Tampilan Terminal

```text
============================================================
             GOOGLE ONE & GEMINI LINK CHECKER               
============================================================
Total Link: 2 | Mode: FETCH | Cookie: Aktif
------------------------------------------------------------

[1/2] ✗ [USED]
      Link    : https://one.google.com/activate-plan/subsc...?g1_landing_page=5
      Status  : Sudah pernah digunakan / hangus

[2/2] ✓ [AVAILABLE / VALID]
      Link    : https://one.google.com/activate-plan/subsc...&g1_landing_page=5
      Paket   : Aktifkan paket Google AI Pro Anda dari Jio
      Promo   : gratis selama 18 bulan
      Expired : paket Google AI Pro Anda akan berakhir pada 11 Mar 2028
      Tombol  : [Aktifkan paket] Siap Klaim!

============================================================
                      RINGKASAN HASIL                       
============================================================
  ✓ AVAILABLE (Siap Pakai) : 1 link -> results/available.txt
  ✗ USED (Hangus)          : 1 link -> results/used.txt
------------------------------------------------------------
  📊 Laporan Lengkap Excel : results/summary.csv
============================================================
```

---

## 📁 Struktur File & Hasil Output

- [links.txt](file:///d:/Coding/gemini-ai-pro-18months-checker/links.txt) : Tempat memasukkan daftar URL yang ingin dicek (1 link per baris).
- [.env](file:///d:/Coding/gemini-ai-pro-18months-checker/.env) : Konfigurasi cookie Google dan delay antar request.
- [index.js](file:///d:/Coding/gemini-ai-pro-18months-checker/index.js) : Script utama checker.
- `results/` :
  - `results/available.txt` : **Link yang VALID / MASIH BISA DIKLAIM** beserta detail paketnya.
  - `results/used.txt` : **Link yang SUDAH DIGUNAKAN / HANGUS**.
  - `results/need_login.txt` : Link yang butuh update cookie login Google.
  - `results/summary.csv` : Laporan lengkap tabel Excel.

---

## 🚀 Cara Penggunaan

1. Buka [links.txt](file:///d:/Coding/gemini-ai-pro-18months-checker/links.txt) dan tempelkan semua URL yang ingin dicek.
2. Jalankan di terminal:
   ```bash
   npm start
   ```
3. Link yang aktif dan siap diklaim akan tersimpan langsung di `results/available.txt`!
