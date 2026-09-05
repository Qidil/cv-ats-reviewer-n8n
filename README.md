# CV ATS Reviewer

Aplikasi web lokal untuk menganalisis CV dengan dua mode: **Mode A** (mengukur kecocokan CV terhadap deskripsi pekerjaan target) dan **Mode B** (analisis CV tanpa deskripsi pekerjaan plus saran 5–10 pekerjaan cocok), dengan skor ATS, pemeriksaan per-aturan, kelemahan, dan saran perbaikan dari model AI gratis.

> ⚠️ **Peringatan penting:** Aplikasi ini adalah **mesin tiruan** — penilaian dan saran dihasilkan oleh **AI** untuk mengecek kualitas CV Anda. Hasilnya **belum pernah diuji terhadap mesin ATS asli** yang dipakai perusahaan perekrut, jadi gunakan sebagai panduan perbaikan, bukan jaminan lolos seleksi.

![Node.js](https://img.shields.io/badge/Node-22.5-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-38B2AC?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?logo=n8n&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)

Memeriksa CV secara manual terhadap deskripsi pekerjaan lambat dan bias. Alat ATS gratis di internet sering kali terbatas, memaksa pembuatan akun, atau mengirim CV Anda ke pihak ketiga.

Alat ini untuk pemilik tunggal yang sedang melamar kerja: aplikasi lokal yang memberitahu Anda persis bagian mana dari CV yang lemah — terhadap pekerjaan yang Anda tuju (Mode A) atau secara umum plus saran pekerjaan cocok (Mode B).

Solusinya adalah alat single-user yang berjalan sepenuhnya di mesin Anda. Unggah CV PDF → pilih mode analisis → sistem mengekstrak teks (teks putih/dekoratif otomatis ditandai agar diabaikan AI), menganalisis kecocokan (skor ATS 0–100, pemeriksaan per-aturan, kelemahan, saran perbaikan), dan untuk Mode B memberi 5–10 saran pekerjaan dengan alasan spesifik dan skor kecocokan — semuanya diproses oleh model AI gratis OpenRouter melalui orkestrasi n8n dengan rantai failover otomatis, dan tersimpan lokal di SQLite.

---

## Key Features

- **Dua Mode Analisis** — Mode A mengukur kecocokan CV dengan deskripsi pekerjaan target; Mode B menganalisis CV standalone (tanpa deskripsi pekerjaan) dan menghasilkan 5–10 saran pekerjaan beserta alasan spesifik dan skor kecocokan per pekerjaan.
- **Upload CV (PDF)** — unggah CV berbasis teks; backend mengekstrak teksnya (pdfjs-dist dengan fallback pdf-parse).
- **Deteksi Teks Putih/Dekoratif** — teks dengan warna mendekati putih (taktik manipulasi ATS / watermark) otomatis dibungkus `[IGNORED]...[/IGNORED]` agar diabaikan AI; warna lain tetap dibaca.
- **ATS Analysis** — skor keseluruhan 0–100 berbasis rubrik dengan **6 pemeriksaan**:
  - **Keyword Match** — kecocokan kata kunci CV dengan deskripsi pekerjaan target.
  - **Skills Coverage** — cakupan keterampilan yang diminta.
  - **Section Completeness** — kelengkapan bagian CV (pendidikan, pengalaman, keterampilan, dll.).
  - **Formatting** — tata letak dan format yang ramah mesin ATS.
  - **Quantified Achievements** — keberadaan pencapaian terukur (angka, persentase).
  - **Readability** — keterbacaan dan struktur teks.
  - Hasilnya memberitahukan **kelemahan** CV dan **saran perbaikan** terstruktur per aturan.
- **Job Suggestions (Mode B)** — 5–10 pekerjaan cocok dengan alasan dari isi CV dan skor kecocokan per pekerjaan; tersimpan sebagai `reviews` + `job_matches`.
- **History** — semua CV, analisis (Mode A/B), dan saran pekerjaan tersimpan lokal di SQLite; ditampilkan sebagai **panel di samping alur Upload** (Phase 20) — bersampingan di desktop/tablet, bertumpuk di mobile, dengan scroll independen (bukan halaman/route terpisah lagi). Tiap CV bisa dibuka ulang ("Lihat Analisis" / "Lihat Pekerjaan Cocok").
- **Model Failover + Continue** — jika satu model gratis gagal (429, kosong), otomatis pindah ke model berikutnya; jika terpotong batas token (`finish_reason: "length"`), model berikutnya menghasilkan **dokumen final lengkap** menggunakan output parsial sebagai referensi. Rantai analyze/jobs berakhir dengan **`openrouter/free`** (auto-router OpenRouter yang memilih model gratis yang tersedia); semua model menggunakan `reasoning: { enabled: false }` + `max_tokens: 8192` agar output JSON tidak terpotong.

---

## Challenges

Tantangan terbesar dalam pembuatan aplikasi ini:

1. **AI orchestration tanpa Code node** — aturan proyek melarang JavaScript di n8n ("TypeScript everywhere"), sehingga semua parsing & logika deterministik dipindah ke backend; n8n hanya berisi webhook + HTTP Request (failover).
2. **Rate limit model gratis OpenRouter** — model `:free` sering 429; diselesaikan dengan rantai failover (analyze & jobs: 5 model — `nemotron-3-ultra → nemotron-3-super → nemotron-3-nano → gemma-4-31b-it → openrouter/free`; rewrite: 5 model) dengan `onError: continueErrorOutput`, `reasoning` dimatikan, dan `max_tokens` 8192 per model.
3. **Output model tidak selalu JSON valid** — teks ekstra kadang menempel di sekitar JSON; backend memakai regex fallback untuk mengekstrak JSON yang benar, plus validator struktur di n8n agar fragment/ekor output parsial tidak lolos.
4. **`node:sqlite` tidak membuat folder otomatis** — `openAppDb` sempat gagal saat folder `data/` belum ada; diperbaiki dengan `mkdirSync` sebelum membuka koneksi.
5. **Output terpotong batas token (`finish_reason: "length")`** — model free kerap berhenti di tengah output sehingga JSON tidak valid. Dipecahkan dengan **FAILOVER-CONTINUE**: saat model kena token limit, model berikutnya menghasilkan dokumen final lengkap (output parsial dipakai sebagai referensi), dan If-validator memastikan struktur JSON minimum (`overallScore` + `atsChecks`) sebelum diterima.
6. **Skor konsisten dengan rubrik ATS** — skor model harus selaras dengan bobot rubrik (keyword/skills/sections/formatting/quantified/readability). Rubrik di-prompt ke model dan dikonfirmasi pada test agar hasil tidak "sembarang" atau generos.
7. **Migrasi DB tanpa framework** — tabel `reviews.target_job_id` dibuat `NOT NULL` sebelum Phase 11; setelah kolom dibuat nullable, DB lama harus dimigrasi. Solusi: migrasi in-code di `applySchema` (deteksi `PRAGMA table_info` → rebuild tabel nullable) agar data lama tidak hilang.

---

## Tech Choices

- **n8n + OpenRouter (model gratis)** — orkestrasi AI murni tanpa biaya API berbayar; dua webhook terpisah (`cv-analyze` untuk Mode A, `cv-jobs` untuk Mode B) karena kontrak I/O berbeda. Workflow rewrite (`cv-rewrite`) diarsipkan — fitur rewrite tidak aktif.
- **TypeScript di seluruh kode** — satu bahasa untuk frontend, backend, dan logika ATS; backend menangani semua parsing & aturan deterministik.
- **SQLite (`node:sqlite`)** — penyimpanan lokal tanpa step compile native (Node ≥ 22.5); n8n tidak menyentuh database.
- **Express** — REST API sekaligus proxy ke n8n; frontend hanya bicara ke Express sehingga kunci API OpenRouter tidak pernah terekspos ke browser.
- **React + Vite + Tailwind CSS v4 + shadcn/ui** — UI dashboard minimal (Upload+Riwayat 2 kolom, Analysis, Matches) dengan palet gelap navy-ink dan layout 2 kolom pada halaman hasil (Phase 19–20, direvisi via skill desain [Impeccable](https://impeccable.style)).
- **Vitest** — unit test backend (DB, ATS engine, parser, PDF extract, routes) + frontend (React Testing Library).

---

## Screenshot

> Catatan: screenshot di bawah menampilkan kondisi UI **sebelum** revisi
> visual Phase 19 (palet gelap navy-ink, via skill Impeccable) & Phase 20
> (layout 2 kolom, Mode A/B langsung tampil) — struktur laporan (skor,
> pemeriksaan, kelemahan, saran) masih sama, tampilan visual akan diperbarui.

<table>
  <tr>
    <td align="center">
      <img src="screenshot/Hasil Analisis.png" alt="Hasil analisis ATS (skor, pemeriksaan per-aturan, kelemahan)" height="300">
      <br>
      <em>Hasil Analisis</em>
    </td>
    <td align="center">
      <img src="screenshot/Analisis Kelemahan + Saran Perbaikan.png" alt="Kelemahan CV dan saran perbaikan" height="300">
      <br>
      <em>Analisis Kelemahan + Saran Perbaikan</em>
    </td>
  </tr>
</table>

---

## Catatan Model AI Gratis (OpenRouter)

Aplikasi ini memakai **model AI gratis OpenRouter** (akhiran `:free`) untuk
menganalisis CV. Model gratis dapat **dihapus, diubah batasnya, atau menjadi
tidak tersedia** sewaktu-waktu tanpa pemberitahuan. Jika model yang dipakai
sudah tidak tersedia, analisis akan gagal.

Sebelum menjalankan, cek model gratis yang **masih tersedia**:
https://openrouter.ai/models?max_price=0

### Cara memeriksa / mengganti model

Nama model ditulis langsung di node HTTP Request pada workflow n8n:

- `n8n/workflows/cv-ats-analyze.json` → node `Analyze - Model 1/2/3/4/5`
- `n8n/workflows/cv-ats-jobs.json` → node `Jobs - Model 1/2/3/4/5`

Langkah:

1. Buka UI n8n (`npm run n8n:run` → `http://localhost:5678`).
2. Buka workflow `CV ATS Analyze` / `CV ATS Jobs`.
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
| `N8N_ANALYZE_PATH` | Ya | Path webhook analyze n8n (Mode A) | `cv-analyze` |
| `N8N_JOBS_PATH` | Ya | Path webhook job-match n8n (Mode B) | `cv-jobs` |
| `N8N_REWRITE_PATH` | Tidak | Path webhook rewrite n8n (tidak digunakan — fitur rewrite non-aktif) | `cv-rewrite` |
| `N8N_TIMEOUT_MS` | Ya | Batas waktu tunggu webhook (ms) | `600000` |
| `DB_PATH` | Ya | Lokasi file database SQLite | `./data/app.db` |
| `OPENROUTER_FREE_MODELS` | Ya* | Daftar model gratis (urut = prioritas failover) | `nvidia/nemotron-3-ultra-550b-a55b:free,...` |

\* `OPENROUTER_FREE_MODELS` hanya referensi — model yang benar-benar dipakai
dikonfigurasi di node HTTP n8n (lihat section "Catatan Model AI Gratis").

> **Catatan n8n lokal vs cloud:** Proyek ini dirancang dengan **n8n lokal**
> (`http://localhost:5678`). Jika Anda memakai **n8n Cloud** (atau n8n di
> server/mesin lain), sesuaikan `N8N_URL` di `.env` dengan alamat instance
> tersebut, pastikan endpoint webhook (`cv-analyze`, `cv-jobs`) dapat diakses
> dari backend, dan periksa kembali kebijakan autentikasi/CORS webhook di sisi
> n8n — path webhook tetap sama.

> Kunci API OpenRouter **tidak** diisi di `.env` — dimasukkan langsung di
> kredensial n8n saat setup workflow di UI n8n (section Menjalankan Development).

### 3. Build Produksi

```bash
npm run build
```

### 4. Test, Lint, Typecheck & Format

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
  `n8n/workflows/cv-ats-jobs.json` di UI n8n.
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
3. **Upload** — pilih file CV (PDF); pilihan Mode A/B **langsung tampil** di
   halaman yang sama (tidak ada tombol *Lanjut* lagi — Phase 20).
4. Pilih mode:
   - **Mode A** — klik tombol Mode A, isi judul + deskripsi pekerjaan target
     (wajib), lalu klik *Analisis CV*.
   - **Mode B** — klik tombol Mode B langsung (tanpa deskripsi pekerjaan) —
     submit otomatis begitu diklik.
5. **Analysis** (Mode A) — lihat skor ATS, pemeriksaan per-aturan, kelemahan,
   dan saran perbaikan (kelemahan+saran tampil di kolom kanan pada desktop/
   tablet — Phase 20).
6. **Matches** (Mode B) — lihat laporan ATS lengkap plus 5–10 saran pekerjaan
   dengan alasan dan skor kecocokan (kolom kanan pada desktop/tablet).
7. **History** — panel Riwayat **selalu tampil di samping halaman Upload**
   (Phase 20, bukan halaman/route `/history` terpisah lagi), dengan link
   "Lihat Analisis" (Mode A) dan/atau "Lihat Pekerjaan Cocok" (Mode B).
