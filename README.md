# Cellestial Market — Netlify (Functions + Blobs)

Backend sekarang 100% di Netlify, tanpa Supabase. Data (akun, foto, nomor, testimoni, forum) disimpan di **Netlify Blobs**, dan login admin dicek di server lewat **Netlify Function**.

Isi folder: `index.html`, `backend.js`, `netlify.toml`, `package.json`, `netlify/functions/api.mjs`, `.gitignore`.
File lama `config.js` dan `supabase/` tidak dipakai lagi, hapus saja.

## 1. Deploy (lewat GitHub, disarankan)
1. Buat repo di github.com, upload semua isi folder ini (termasuk folder `netlify/` dan folder `fonts/` kalau ada), lalu commit.
2. Di Netlify: *Add new site → Import from Git* → pilih repo. Tanpa build command, publish directory `.`.
3. Setiap commit otomatis deploy.

Catatan: drag & drop folder di netlify.com/drop biasanya tidak memasang dependensi Functions, jadi pakai Git atau Netlify CLI (`netlify deploy --prod`).

## 2. Environment variable (wajib)
Netlify → Site configuration → Environment variables → tambahkan:
- `ADMIN_PASSWORD`: password login admin (bebas, buat yang panjang).
- `SESSION_SECRET`: string acak panjang (disarankan; kalau kosong dipakai `ADMIN_PASSWORD`).

Setelah menyimpan, **redeploy** (Deploys → Trigger deploy).

## 3. Cara pakai
- Admin: menu **Toko → + Tambah Akun** → masukkan password admin. Sesi berlaku 12 jam atau sampai tombol **Kunci Admin**.
- Foto akun disimpan sebagai file terpisah di Netlify Blobs (bukan base64 di data akun), jadi katalog tetap ringan dan tidak hilang saat refresh.
- Akun lama yang masih tersimpan di browser admin otomatis dipindah ke server saat login pertama (kalau server masih kosong).
- Testimoni: pengunjung kirim lewat menu **Testimoni**. Saat login admin, buka menu itu lagi untuk **Setujui** atau **Hapus**.
- Forum/Komunitas tersimpan di server dan menyegarkan diri tiap ~45 detik.

## 4. Jalankan lokal (opsional)
```
npm i -g netlify-cli
npm install
echo ADMIN_PASSWORD=passwordkamu > .env
netlify dev
```
Buka alamat yang ditampilkan. `.env` sudah ada di `.gitignore`, jangan di-commit.

## Catatan
- Batas ukuran satu permintaan simpan ke Function sekitar 6 MB. Foto dikompres di browser (±50–80 KB per foto), jadi aman untuk penggunaan normal.
- Pembatasan laju (rate limit) disimpan di memori Function, jadi sifatnya pelindung dasar, bukan anti-spam ketat.
- Like/laporan dicatat per browser, jadi bukan anti-curang yang ketat.
- Kata terlarang tambahan (menu admin) tetap lokal di browser masing-masing; daftar dasar juga dicek di server.
