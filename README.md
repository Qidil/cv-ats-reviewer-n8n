# CV ATS Reviewer

Aplikasi web lokal untuk menganalisis CV terhadap deskripsi pekerjaan target, memberi skor ATS, dan menulis ulang CV (hanya dengan persetujuan Anda) menggunakan model AI gratis.

![Node.js](https://img.shields.io/badge/Node-22.5-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
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
- **React + Vite + Tailwind CSS + shadcn/ui** — UI dashboard minimal dan ringan untuk halaman Upload, Analysis, Approval, Result, dan History.
- **Vitest** — unit test backend (repository, ATS engine, parser, export) + frontend (React Testing Library).

---

## Screenshot

> Screenshot menyusul — akan dilengkapi setelah UI final.

---

## Catatan Model AI Gratis (OpenRouter)

Aplikasi ini memakai **model AI gratis OpenRouter** (akhiran `:free`) untuk
menganalisis dan menulis ulang CV. Model gratis dapat **dihapus, diubah
batasnya, atau menjadi tidak tersedia** sewaktu-waktu tanpa pemberitahuan.
Jika model yang dipakai sudah tidak tersedia, analisis/rewrite akan gagal.

Sebelum menjalankan, cek model gratis yang **masih tersedia**:
https://openrouter.ai/models?max_price=0

### Cara memeriksa / mengganti model

Nama model ditulis langsung di node HTTP Request pada workflow n8n:

- `n8n/workflows/cv-ats-analyze.json` → node `Analyze - Model 1/2/3`
- `n8n/workflows/cv-ats-rewrite.json` → node `Rewrite - Model 1/2/3` dan
  `Post-Check Model 1/2/3`

Langkah:

1. Buka UI n8n (`npm run n8n:run` → `http://localhost:5678`).
2. Buka workflow `CV ATS Analyze` / `CV ATS Rewrite`.
3. Ganti nilai kolom **model** pada tiap node HTTP Request dengan model baru —
   bisa model gratis lain yang masih tersedia, atau model berbayar (mis.
   `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, dsb.).
4. Simpan workflow. (Jika mengganti lewat file JSON, impor ulang di n8n.)

> Catatan: variabel `OPENROUTER_FREE_MODELS` di `.env` hanya dokumentasi urutan
> failover untuk referensi — nilai yang benar-benar dipakai adalah model yang
> dikonfigurasi di node HTTP n8n di atas. Keduanya harus diselaraskan.

---

## Panduan Menjalankan & Build

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Qidil/cv-ats-reviewer-n8n.git
cd cv-ats-reviewer-n8n
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 2. Konfigurasi `.env`

```bash
cp .env.example .env
```

Lalu isi variabel berikut di file `.env`:

| Variabel | Wajib? | Penjelasan | Contoh |
|----------|--------|-----------|--------|
| `PORT` | Ya | Port backend Express API | `3001` |
| `FRONTEND_ORIGIN` | Ya | Origin frontend yang diizinkan CORS | `http://localhost:5173` |
| `N8N_URL` | Ya | Alamat instance n8n (lihat catatan lokal/cloud di bawah) | `http://localhost:5678` |
| `N8N_ANALYZE_PATH` | Ya | Path webhook analyze n8n | `cv-analyze` |
| `N8N_REWRITE_PATH` | Ya | Path webhook rewrite n8n | `cv-rewrite` |
| `N8N_TIMEOUT_MS` | Ya | Batas waktu tunggu webhook (ms); model free lambat | `300000` |
| `DB_PATH` | Ya | Lokasi file database SQLite | `./data/app.db` |
| `OPENROUTER_FREE_MODELS` | Ya* | Daftar model gratis (urut = prioritas failover) | `nvidia/nemotron-3-ultra-550b-a55b:free,...` |

\* `OPENROUTER_FREE_MODELS` hanya referensi — model yang benar-benar dipakai
dikonfigurasi di node HTTP n8n (lihat section "Catatan Model AI Gratis").

> **Catatan n8n lokal vs cloud:** Proyek ini dirancang dengan **n8n lokal**
> (`http://localhost:5678`). Jika Anda memakai **n8n Cloud** (atau n8n di
> server/mesin lain), sesuaikan `N8N_URL` di `.env` dengan alamat instance
> tersebut (mis. `https://<subdomain>.n8n.cloud`), pastikan endpoint webhook
> (`cv-analyze`, `cv-rewrite`) dapat diakses dari backend, dan periksa kembali
> kebijakan autentikasi/CORS webhook di sisi n8n — path webhook tetap sama.

> Kunci API OpenRouter **tidak** diisi di `.env` — dimasukkan langsung di
> kredensial n8n saat setup workflow di UI n8n (section Menjalankan Development).

### 3. Build Produksi

```bash
npm run build
```

### 4. Test, Lint & Format

```bash
npm --prefix backend run test   # unit test backend
npm --prefix frontend run test  # unit test frontend (Vitest + RTL)
npm run lint                    # cek kode
npm run typecheck               # type-check seluruh proyek
npm run format                  # rapikan format
```

### 5. Menjalankan Development (butuh 3 terminal / PowerShell)

Proyek ini terdiri dari tiga proses yang berjalan bersamaan: **n8n**, **backend**,
dan **frontend**. Buka tiga jendela terminal/PowerShell di folder proyek lalu
jalankan satu per satu.

**Terminal 1 — n8n (AI orchestration):**

```bash
npm run n8n:run
```

- UI n8n terbuka di `http://localhost:5678` (asumsi **n8n lokal**; jika memakai
  n8n Cloud, skip langkah ini dan buka UI instance cloud Anda).
- Import workflow `n8n/workflows/cv-ats-analyze.json` dan
  `cv-ats-rewrite.json` di UI n8n.
- Buat/isi kredensial **OpenRouter** (masukkan kunci API Anda) di node HTTP
  tiap workflow.
- **Aktifkan** (toggle aktif) kedua workflow.
- Sesuaikan `N8N_URL` di `.env` bila instance n8n bukan lokal
  (lihat panduan Konfigurasi).

**Terminal 2 — Backend (Express API):**

```bash
npm run dev:backend
```

- Backend berjalan di `http://localhost:3001`.

**Terminal 3 — Frontend (React/Vite):**

```bash
npm run dev:frontend
```

- Frontend berjalan di `http://localhost:5173`.

> Alternatif: `npm run dev` menjalankan backend + frontend sekaligus dalam satu
> terminal (via `concurrently`) — praktis bila n8n sudah berjalan di terminal
> terpisah (total 2 terminal).

### 6. Alur Tes Manual (end-to-end via UI)

1. Pastikan ketiga proses di atas berjalan dan kedua workflow n8n aktif.
2. Buka `http://localhost:5173` di browser.
3. **Upload** — pilih file CV (PDF), klik *Lanjut*, isi judul + deskripsi
   pekerjaan target (wajib), klik *Analisis CV*. Tunggu hasil (model free bisa
   1–5 menit).
4. **Analysis** — lihat skor ATS, cek per-aturan, kelemahan, dan saran.
5. **Approval** — centang minimal satu saran, klik *Setujui & Rewrite*. Tunggu
   proses rewrite (1–5 menit).
6. **Result** — lihat CV hasil rewrite, skor post-check, peringatan informasi
   yang hilang; unduh **PDF** dan **DOCX**.
7. **History** — buka halaman Riwayat (`/history`) untuk melihat semua CV yang
   pernah diunggah.
