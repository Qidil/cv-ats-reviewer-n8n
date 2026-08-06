# CV ATS Reviewer

Aplikasi web lokal untuk menganalisis CV terhadap deskripsi pekerjaan target, memberi skor ATS, dan menulis ulang CV (hanya dengan persetujuan Anda) menggunakan model AI gratis.

![Node.js](https://img.shields.io/badge/Node-22.5-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?logo=n8n&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=white)

Memeriksa CV secara manual terhadap deskripsi pekerjaan lambat dan bias. Alat ATS gratis di internet sering kali terbatas, memaksa pembuatan akun, atau mengirim CV Anda ke pihak ketiga — belum lagi risiko rewrite tanpa persetujuan atau halusinasi fakta.

Alat ini untuk pemilik tunggal yang sedang melamar kerja: aplikasi lokal yang memberitahu Anda persis bagian mana dari CV yang lemah, dan hanya menulis ulang CV saat Anda menyetujui saran tertentu.

Solusinya adalah alat single-user yang berjalan sepenuhnya di mesin Anda. Unggah CV PDF → deskripsikan pekerjaan yang Anda targetkan → sistem menganalisis kecocokan CV dengan deskripsi itu (skor ATS 0–100, cek per-aturan, kelemahan, saran), lalu menulis ulang CV dengan tetap mempertahankan semua fakta — semuanya diproses oleh model AI gratis OpenRouter melalui orkestrasi n8n dengan rantai failover otomatis, dan tersimpan lokal di SQLite.

---

## Key Features

- **Upload CV (PDF)** — unggah CV berbasis teks; backend mengekstrak teksnya untuk dianalisis.
- **Target Job Description** — wajib diisi; hasil ATS selalu mengukur kecocokan CV dengan pekerjaan target itu.
- **ATS Analysis** — skor keseluruhan, cek per-aturan, kelemahan, dan saran terstruktur JSON.
- **Approval (HITL)** — Anda memilih saran mana yang disetujui sebelum proses rewrite berjalan.
- **CV Rewrite** — tulis ulang CV sesuai saran yang disetujui, tanpa mengubah fakta asli.
- **Post-Check** — satu panggilan AI ekstra untuk skor CV hasil rewrite + peringatan informasi yang hilang.
- **Export PDF & DOCX** — unduh hasil rewrite dalam dua format dari konten yang sama.
- **History** — semua CV, analisis, persetujuan, dan rewrite tersimpan lokal di SQLite.
- **Model Failover** — jika satu model gratis rate-limited (429), otomatis pindah ke model gratis berikutnya.

---

## Challenges

Tantangan terbesar dalam pembuatan aplikasi ini:

1. **AI orchestration tanpa Code node** — aturan proyek melarang JS di n8n ("TypeScript everywhere"), sehingga semua parsing & logika deterministik dipindah ke backend; n8n hanya berisi webhook + HTTP Request (failover).
2. **Rate limit model gratis OpenRouter** — model `:free` sering 429; diselesaikan dengan rantai failover 3 model (`nemotron-3-ultra → gpt-oss-120b → nemotron-3-nano`) dengan `onError: continueErrorOutput`.
3. **Output model tidak selalu JSON valid** — teks ekstra kadang menempel di sekitar JSON; backend memakai regex fallback untuk mengekstrak JSON yang benar.
4. **`node:sqlite` tidak membuat folder otomatis** — `openAppDb` sempat gagal saat folder `data/` belum ada; diperbaiki dengan `mkdirSync` sebelum membuka koneksi.
5. **Bahasa output rewrite** — CV rewrite harus mengikuti bahasa deskripsi pekerjaan (bukan selalu English); diatur via instruksi prompt dan dikonfirmasi ulang pada test.

---

## Tech Choices

- **n8n + OpenRouter (model gratis)** — orkestrasi AI murni tanpa biaya API berbayar; dua webhook terpisah (`cv-analyze`, `cv-rewrite`) karena kontrak I/O dan waktu pemanggilan berbeda.
- **TypeScript di seluruh kode** — satu bahasa untuk frontend, backend, dan logika ATS; backend menangani semua parsing & aturan deterministik.
- **SQLite (`node:sqlite`)** — penyimpanan lokal tanpa step compile native (Node ≥ 22.5); n8n tidak menyentuh database.
- **Express** — REST API sekaligus proxy ke n8n; frontend hanya bicara ke Express sehingga kunci API OpenRouter tidak pernah terekspos ke browser.
- **React + Vite + Tailwind CSS** — UI dashboard minimal dan ringan untuk halaman Upload, Analysis, Approval, dan Rewrite.
- **Vitest** — unit test untuk koneksi database dan repository (tanpa native dep).

---

## Screenshot

> Screenshot menyusul — akan dilengkapi setelah UI final.

---

## Panduan Menjalankan & Build

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Qidil/cv-ats-reviewer-n8n.git
cd cv-ats-reviewer-n8n
npm install
npm --prefix backend install
```

### 2. Konfigurasi

```bash
cp .env.example .env
# isi nilai di .env sesuai lingkungan Anda
```

### 3. Jalankan n8n (AI orchestration)

```bash
npm run n8n:run
```

Import workflow dari `n8n/workflows/cv-ats-analyze.json` dan `cv-ats-rewrite.json` di UI n8n, lalu atur kredensial **OpenRouter** (free models).

### 4. Menjalankan Development Server

```bash
npm run dev
```

Backend berjalan di `http://localhost:3001`, frontend di `http://localhost:5173`.

### 5. Build Produksi

```bash
npm run build
```

### 6. Test, Lint & Format

```bash
npm --prefix backend run test  # unit test
npm run lint                   # cek kode
npm run typecheck              # type-check seluruh proyek
npm run format                 # rapikan format
```
