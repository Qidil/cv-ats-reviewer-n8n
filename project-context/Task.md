# Task: CV ATS Reviewer (cv-ats-reviewer-n8n)

> **Total Phases:** 7 | **Total Tasks:** 29 | **Last Updated:** 2026-08-06

## Document Role
- **Source of Truth:** Execution plan derived from approved spec documents
- **Primary Owner:** `brainstorm-task`
- **Out of Scope:** New product scope, new schema/API decisions, and code quality review findings

## Upstream Dependencies
| Topic | Canonical Source |
|------|------------------|
| Product scope | `project-context/PRD.md` |
| Technical structure | `project-context/architecture.md` |
| Data contract | `project-context/schema.md` |
| API contract | `project-context/api.md` |
| UI contract | `project-context/StyleGuide.md` |
| Coding rules | `project-context/rules.md` |
| ATS rules | `project-context/ats-reference.md` |

## Execution Rules
- Work on tasks **one by one** in order within each phase.
- **Per-phase gate (user-defined):** after each phase is complete, **STOP** and
  wait for the user's manual review and confirmation. Then run skill
  `spec-compliance` → `code-review`. After both pass, ask for confirmation again
  before starting the next phase.
- Update status `[ ]` to `[x]` when a task is complete.
- If a task is blocked, mark it `[~]` and note the reason.
- After every completed task, run lint + typecheck (`npm run lint`,
  `npm run typecheck`) before reporting completion (rules.md §7).
- TDD: implementation tasks are preceded by test tasks (Task N.1 test, N.2
  implement; N.2 depends on N.1).

---

## Progress Overview
| Phase | Name | Status | Progress |
|------|------|--------|----------|
| 1 | Setup & Konfigurasi | [x] | 3/3 |
| 2 | n8n Workflows | [x] | 4/4 |
| 3 | Backend: Database & Models | [x] | 4/4 |
| 4 | Backend: ATS Engine & REST API | [x] | 7/7 |
| 5 | Backend: n8n Proxy & Export | [ ] | 0/5 |
| 6 | Frontend: React UI | [ ] | 0/4 |
| 7 | E2E, Export & Ship | [ ] | 0/3 |

## AI Read Order
1. Read `Execution Rules`
2. Read `Progress Overview`
3. Read only the current phase
4. Use `References` and `Traceability IDs` before searching elsewhere

---

## Phase 1: Setup & Konfigurasi
> **Dependency:** None (first phase)
> **Goal:** Root tooling, TypeScript config, lint/format/test infrastructure, and env template ready.

- [x] **Task 1.1: Root scaffolding & tooling**
  - **Files:** `package.json`, `.gitignore`, `.editorconfig`
  - **Description:** Verify/refresh root package.json with scripts
    (`dev`, `dev:backend`, `dev:frontend`, `build`, `start`, `n8n:run`),
    engines `>=22.5.0`, npm workspaces or scripts per architecture.md; ensure
    `data/` is gitignored.
  - **References:** [`project-context/architecture.md#project-structure`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-01`](project-context/PRD.md) / [`FEAT-08`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] `data/` and `.env` are gitignored
    - [~] `npm run dev` runs both backend and frontend — **diverifikasi penuh setelah frontend di-scaffold (Phase 6)**; saat ini script root sudah terorchestrasi, backend stub jalan, frontend menunggu Vite (Task 6.1)

- [x] **Task 1.2: TypeScript, ESLint, Prettier, editorconfig**
  - **Files:** `tsconfig.base.json`, `backend/tsconfig.json`, `frontend/tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.editorconfig`
  - **Description:** Strict TS config (`strict`, `noUncheckedIndexedAccess`,
    `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
    `erasableSyntaxOnly`), ESLint flat config (v9+, terinstall v10;
    `eslint:recommended`, `@typescript-eslint/recommended`), Prettier
    (`singleQuote`, `tabWidth: 2`, `printWidth: 80`). Root
    `lint`/`typecheck`/`format` scripts added.
  - **References:** [`project-context/rules.md#7`](project-context/rules.md)
  - **Traceability IDs:** [`RULE-*`](project-context/rules.md)
  - **Acceptance Criteria:**
    - [x] `npm run lint` passes on an empty-stub project
    - [x] `npm run typecheck` passes with strict flags enabled
    - [x] No `any`, no `enum` in a lint test file

- [x] **Task 1.3: Env template**
  - **Files:** `.env.example`
  - **Description:** Confirm/refresh `.env.example` with `PORT=3001`,
    `N8N_URL=http://localhost:5678`, `N8N_ANALYZE_PATH=cv-analyze`,
    `N8N_REWRITE_PATH=cv-rewrite`, `DB_PATH=./data/app.db`,
    `OPENROUTER_FREE_MODELS` (3 free models), and a local `.env` loader note.
    Loader note added at top of file (copy to `.env`, gitignored).
  - **References:** [`project-context/architecture.md#ai-strategy`](project-context/architecture.md)
  - **Traceability IDs:** [`BR-07`](project-context/PRD.md) / [`NFR-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] All vars referenced in `rules.md §4` exist in `.env.example`
    - [x] No secrets are committed (no real key in the file)

---

## Phase 2: n8n Workflows
> **Dependency:** Phase 1 must be complete
> **Goal:** `cv-analyze` and `cv-rewrite` workflows built with webhook + HTTP Request failover chain, **no Code nodes**, returning raw model output.

- [x] **Task 2.1: n8n workflow — CV ATS Analyze**
  - **Files:** n8n workflow `CV ATS Analyze` (exported later to `n8n/workflows/`)
  - **Description:** Webhook trigger `cv-analyze` → HTTP Request failover chain
    (3 models, `onError: continueErrorOutput`) to OpenRouter chat completions →
    return `{ model, raw }`. Uses `openRouterApi` credential. **No Code nodes.**
    Source `n8n/workflows-src/cv-ats-analyze.ts` ditulis eksplisit (tanpa factory
    function) agar konsisten dengan yang di-deploy dan lolos `validate_workflow`.
  - **References:** [`project-context/architecture.md#ai-strategy`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-03`](project-context/PRD.md) / [`BR-07`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Workflow has no Code nodes
    - [x] Failover chain order matches `OPENROUTER_FREE_MODELS`
    - [x] Returns `{ model, raw }` on success

- [x] **Task 2.2: n8n workflow — CV ATS Rewrite**
  - **Files:** n8n workflow `CV ATS Rewrite` (exported later)
  - **Description:** Webhook `cv-rewrite` → failover chain → return
    `{ model, raw }`. Rewrite prompt preserves facts (BR-05), then one post-check
    call returning `{ model, raw }` (BR-06). **No Code nodes.**
  - **References:** [`project-context/architecture.md#core-flow`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-05`](project-context/PRD.md) / [`FEAT-06`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Workflow has no Code nodes
    - [x] Both rewrite and post-check calls use the failover chain
    - [x] Returns rewrite raw output + post-check raw output

- [x] **Task 2.3: Webhook response contract test**
  - **Files:** n8n workflows (test data)
  - **Description:** Manually execute both webhooks with sample CV text + JD and
    verify responses match `api.md` webhook contract (`{ model, raw }`).
  - **References:** [`project-context/api.md#backend--n8n`](project-context/api.md)
  - **Traceability IDs:** [`API-*`](project-context/api.md)
  - **Acceptance Criteria:**
    - [x] `cv-analyze` returns `{ model, raw }` for sample input
    - [x] `cv-rewrite` returns rewrite + post-check outputs
    - [x] Raw output shape documented for the parser task

- [x] **Task 2.4: Export workflow JSON**
  - **Files:** `n8n/workflows/cv-ats-analyze.json`, `n8n/workflows/cv-ats-rewrite.json`
  - **Description:** Export both workflows as JSON into `n8n/workflows/` for
    version control (publish first per build order).
  - **References:** [`project-context/architecture.md#build-order`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] JSON files exist under `n8n/workflows/`
    - [x] JSON contains webhook + HTTP nodes only (no Code node)

---

## Phase 2: Code Review Notes (backlog)
> **Reviewed:** 2026-08-05 | **Status:** ✅ PASS (0 BLOCKER / 0 MAJOR) |
> Dilaporkan ke Task.md agar tidak lupa saat phase selanjutnya.

- **[MINOR] SEC-05 — Webhook n8n tanpa autentikasi.** Kedua webhook
  (`cv-analyze`, `cv-rewrite`) terbuka untuk siapa pun yang bisa menjangkau
  n8n. Saat ini aman karena lokal, tapi perlu dilindungi saat deploy.
  **Fix ditunda ke Task 5.3** (backend proxy jadi pintu tunggal + sekaligus
  pasang `httpHeaderAuth` credential pada kedua webhook). Backend n8n-proxy
  harus menyertakan header auth tersebut.
- **[INFO] CR-18 — Semua model gagal → workflow error tanpa output
  terstruktur.** Dipetakan ke error code (mis. 502/504) di Task 5.3 backend
  n8n-proxy.
- **[INFO] CR-17 — Tidak ada automated test untuk konfigurasi workflow.**
  Ditambahkan sebagai integration test backend (memanggil webhook via proxy dan
  memvalidasi bentuk respons `{ model, raw }`) di Phase 4/5.
- **[INFO] CR-23 — 3 node model nyaris identik per chain (keterbatasan SDK,
  tanpa factory function).** Backlog: refactor ke satu helper jika SDK
  mendukung factory function di versi mendatang. Sudah didokumentasikan di
  `architecture.md`.

---

## Phase 3: Backend — Database & Models
> **Dependency:** Phase 1 must be complete
> **Goal:** SQLite schema init via `node:sqlite` matching `schema.md`, plus DB layer tests.

- [x] **Task 3.1: Backend scaffold + DB connection (tests)**
  - **Files:** `backend/src/db/connection.test.ts`
  - **Description:** Write tests for the DB connection module: opens `node:sqlite`
    `DatabaseSync`, enables `PRAGMA foreign_keys`, creates schema tables.
  - **References:** [`project-context/schema.md#storage-engine`](project-context/schema.md)
  - **Traceability IDs:** [`DATA-*`](project-context/schema.md)
  - **Acceptance Criteria:**
    - [x] Test asserts tables are created on `initDb()`
    - [x] Test asserts `PRAGMA foreign_keys` is ON
  - **Implementation:** Vitest diinstall sebagai devDependency backend + script `npm test`; test memakai temp dir (db dibersihkan via `afterEach`).

- [x] **Task 3.2: DB connection implementation**
  - **Files:** `backend/src/db/connection.ts`, `backend/src/db/schema.ts`
  - **Description:** Implement `DatabaseSync` connection + `CREATE TABLE IF NOT
    EXISTS` for all 5 tables (cvs, target_jobs, reviews, approvals, rewrites)
    with FKs and indexes. **Dependencies:** Task 3.1
  - **References:** [`project-context/schema.md#tables`](project-context/schema.md)
  - **Traceability IDs:** [`DATA-*`](project-context/schema.md) / [`FEAT-08`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] All tables + indexes from schema.md created
    - [x] FKs enabled and enforced
    - [x] Task 3.1 tests pass
  - **Implementation:** `openDb` (PRAGMA foreign_keys ON) + `initDb` (applySchema); `openAppDb` baca `DB_PATH` (default `./data/app.db`). Timezone tetap string UTC ISO via caller.
  - **Fix (code review):** `openAppDb` kini membuat folder induk DB_PATH otomatis via `mkdirSync` (cek gagal saat `data/` belum ada); ditambah test `openAppDb creates the parent directory when missing`.

- [x] **Task 3.3: Repository/DAO layer tests**
  - **Files:** `backend/src/db/repos.test.ts`
  - **Description:** Write tests for CRUD + query behavior for cvs, target_jobs,
    reviews, approvals, rewrites (prepared statements only).
  - **References:** [`project-context/schema.md#relationships`](project-context/schema.md)
  - **Traceability IDs:** [`DATA-*`](project-context/schema.md)
  - **Acceptance Criteria:**
    - [x] Tests cover insert + get-by-id for each table
    - [x] Tests cover `latestReviewId` computed query (per cv_id)
    - [x] Tests cover review → approval → rewrite traversal
  - **Implementation:** 10 test kasus (insert/get per 5 tabel, latestReviewId computed, traversal rewrite via approval & review).

- [x] **Task 3.4: Repository/DAO implementation**
  - **Files:** `backend/src/db/repos.ts`
  - **Description:** Implement prepared-statement repository functions used by
    routes/services. **Dependencies:** Task 3.2, Task 3.3
  - **References:** [`project-context/rules.md#4`](project-context/rules.md)
  - **Traceability IDs:** [`DATA-*`](project-context/schema.md) / [`F-03`](project-context/rules.md)
  - **Acceptance Criteria:**
    - [x] All queries use prepared statements (no string concatenation)
    - [x] Task 3.3 tests pass
  - **Implementation:** Getter mengembalikan domain object camelCase (JSON columns
    di-parse); insert via prepared statement `lastInsertRowid`. Tipe domain
    (`AtsCheck`, `Suggestion`, `Review`, dll.) dipakai route/service di Phase 4/5.

---

## Phase 4: Backend — ATS Engine & REST API
> **Dependency:** Phase 3 must be complete
> **Goal:** Upload + analyze + report + approve endpoints, deterministic ATS checks in TypeScript, regex parser with tests.

- [x] **Task 4.1: ATS engine tests**
  - **Files:** `backend/src/services/ats.test.ts`
  - **Description:** Write tests for the 6 deterministic checks (keyword,
    skills, sections, formatting, quantified, readability), composite score
    composition, and weakness/suggestion derivation (Pattern B, ats-reference).
  - **References:** [`project-context/ats-reference.md#5`](project-context/ats-reference.md)
  - **Traceability IDs:** [`FEAT-03`](project-context/PRD.md) / [`BR-02`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Each of the 6 checks has a test case
    - [x] Composite score bounded 0–100
    - [x] Low-scoring checks map to weaknesses/suggestions
  - **Implementation:** 8 test kasus; bobot composite (keyword 30, skills 20, sections 15, formatting 10, quantified 15, readability 10) dikunci di `ats.ts`; test quantified memakai fixture terpisah karena tanggal pada bullet ikut terhitung sebagai metrik.

- [x] **Task 4.2: ATS engine implementation**
  - **Files:** `backend/src/services/ats.ts`
  - **Description:** Implement deterministic ATS logic: keyword overlap, skills
    coverage, section completeness, formatting/parse-safety, quantified
    achievements, readability; weighted composite; suggestions derivation.
    **Dependencies:** Task 4.1
  - **References:** [`project-context/ats-reference.md#5`](project-context/ats-reference.md)
  - **Traceability IDs:** [`FEAT-03`](project-context/PRD.md) / [`BR-02`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] All 6 checks return `{ id, name, status, score, detail }`
    - [x] `overallScore` = weighted composite (weights locked at build time)
    - [x] Task 4.1 tests pass
  - **Implementation:** `analyzeCv(cvText, targetJobDescription)` → `{ overallScore, atsChecks, weaknesses, suggestions }`. Deteksi section via heading normalisasi (EN+ID), ekstraksi keyword JD via regex token + stopwords, whole-word match. Suggestion id `sug-N`, priority dari score (<40 high, <60 medium, else low), maks 3 dari cek terendah. Tipe `AtsCheck`/`Suggestion` dipakai ulang dari `db/repos.ts`.

- [x] **Task 4.3: Model output parser tests**
  - **Files:** `backend/src/utils/model-parser.test.ts`
  - **Description:** Write tests for parsing raw model output into the report
    shape with regex fallback (JSON extraction from markdown fenced blocks,
    malformed JSON tolerance).
  - **References:** [`project-context/api.md#report-shape`](project-context/api.md)
  - **Traceability IDs:** [`AC-06`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Parses JSON from ```json fenced blocks
    - [x] Falls back to regex extraction for malformed output
    - [x] Returns clear error when nothing parseable
  - **Implementation:** 6 test kasus: clean JSON, fenced `json`, fenced tanpa marker, malformed dgn teks bebas di sekitar, error saat tidak ada JSON, dan normalisasi field out-of-range (overallScore 500→100, status 'wat'→'warn', priority 'urgent'→'medium', id non-string→`sug-N`).

- [x] **Task 4.4: Model output parser implementation**
  - **Files:** `backend/src/utils/model-parser.ts`
  - **Description:** Implement parser with runtime guard + regex fallback,
    returning typed `AnalyzeReport` or error. **Dependencies:** Task 4.3
  - **References:** [`project-context/rules.md#3`](project-context/rules.md)
  - **Traceability IDs:** [`AC-06`](project-context/PRD.md) / [`F-01`](project-context/rules.md)
  - **Acceptance Criteria:**
    - [x] Never trusts raw output shape without a guard
    - [x] Task 4.3 tests pass
  - **Implementation:** `parseAnalyzeReport(raw)` → coba fenced block, lalu scan balanced-object (string-aware) untuk regex fallback; normalisasi setiap field via helper guard (`clampScore`, `asStatus`, `asPriority`). Throws `ModelParseError` bila tidak ada JSON valid.

- [x] **Task 4.5: REST API routes tests**
  - **Files:** `backend/src/routes/api.test.ts`
  - **Description:** Write supertest integration tests for `POST /api/cvs`
    (multipart, 201/400/415), `POST /api/cvs/:cvId/analyze`, `GET
    /api/reviews/:reviewId`, `POST /api/reviews/:reviewId/approve`, `GET
    /api/cvs`, `GET /api/approvals/:approvalId`, `GET /api/rewrites/:rewriteId`
    (mock the n8n proxy).
  - **References:** [`project-context/api.md#frontend--backend`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-01`](project-context/PRD.md) / [`FEAT-04`](project-context/PRD.md) / [`FEAT-08`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Each endpoint has success + error-case tests
    - [x] 400/404/415 codes per api.md error codes
    - [x] Upload size limit enforced

- [x] **Task 4.6: REST routes — upload, list, report**
  - **Files:** `backend/src/routes/cvs.ts`, `backend/src/routes/reviews.ts`, `backend/src/index.ts`
  - **Description:** Implement `POST /api/cvs` (multipart + pdf-parse + store
    cvs + target_jobs), `GET /api/cvs` (with computed `latestReviewId`),
    `GET /api/reviews/:reviewId` (with `approvalId`/`rewriteId`). **Dependencies:** Task 3.4, Task 4.5
  - **References:** [`project-context/api.md#upload`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-01`](project-context/PRD.md) / [`FEAT-02`](project-context/PRD.md) / [`BR-01`](project-context/PRD.md) / [`BR-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Upload returns 201 `{ id }`; missing job → 400; non-PDF → 415
    - [x] Analysis endpoint waits synchronously and returns the report
    - [x] Task 4.5 tests pass
  - **Implementation (note):** `backend/src/services/n8n-proxy.ts` (fungsi `analyzeCv`)
    diimplementasikan di fase ini karena endpoint analyze membutuhkan proxy ke webhook
    `cv-analyze`. File ini secara resmi adalah milik Task 5.2 — status Task 5.1/5.2 tetap
    `[ ]` dan `rewriteCv` belum ditambahkan.

- [x] **Task 4.7: REST routes — approve**
  - **Files:** `backend/src/routes/approvals.ts`
  - **Description:** Implement `POST /api/reviews/:reviewId/approve` storing
    `approvals.approved_suggestions_json`; 400 on empty/unknown ids. **Dependencies:** Task 4.6
  - **References:** [`project-context/api.md#approve`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-04`](project-context/PRD.md) / [`BR-04`](project-context/PRD.md) / [`AC-07`](project-context/PRD.md) / [`AC-08`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [x] Only approved suggestion ids stored
    - [x] Zero approvals → no rewrite record possible (BR-04)
    - [x] Task 4.5 tests pass

> **Fixtures (testing manual):** `project-context/cv-test/` berisi CV pribadi
> (PDF) milik user untuk uji end-to-end setelah produk jadi. Folder ini
> **gitignored** (`project-context/cv-test/`) — jangan commit. Dipakai pada
> testing manual Phase 6-7 (upload nyata ke backend + frontend), bukan untuk
> unit test.

---

## Phase 4: Code Review Notes (backlog)
> **Reviewed:** 2026-08-06 | **Status:** ✅ PASS (0 BLOCKER / 0 MAJOR, 2 MINOR
> + 1 INFO) | Minor CR-18 & CR-08 sudah difix. Sisanya dicatat di sini agar
> ditangani saat task/phase terkait.

- **[INFO] CR-07 — `getLatestReviewIdByCvId` hanya dipakai test, bukan kode
  produksi.** `listCvs` menghitung review terakhir via subquery SQL, jadi ada
  dua jalur logika serupa. **Fix saat Task 5.1/5.2 atau 6.2:** pakai fungsi
  repo itu di dalam `listCvs` (hilangkan subquery) ATAU beri komentar
  `tradeoff:` bahwa ia disimpan untuk keperluan Phase 5/6.
- **[MINOR → FIXED] CR-18 — Skor model `0` dianggap gagal.** Model yang
  menilai CV 0/100 akan diganti skor deterministik. Sudah difix:
  `AnalyzeReport.overallScore` menjadi `number | null` (null = tidak ada skor),
  `composeReport` memakai `??` fallback. **Pola ini WAJIB ditiru di Phase 5**
  saat komposisi `postScore` (Task 5.3) agar post-check skor 0 tidak diabaikan.
- **[MINOR → FIXED] CR-08 — `parseId` diduplikasi 3 router.** Sudah dipindah ke
  `backend/src/utils/route-id.ts`. **Gunakan util ini saat menambah route baru**
  (mis. `rewrites.ts` di Task 5.4).

---

## Phase 5: Backend — n8n Proxy & Export
> **Dependency:** Phase 4 must be complete
> **Goal:** Proxy to n8n webhooks with failover, rewrite + post-check composition, PDF/DOCX export.

- [ ] **Task 5.1: n8n proxy tests**
  - **Files:** `backend/src/services/n8n-proxy.test.ts`
  - **Description:** Write tests for the n8n proxy: builds webhook URL from env,
    posts payload, returns `{ model, raw }`, surfaces 502 on failure.
  - **References:** [`project-context/api.md#backend--n8n`](project-context/api.md)
  - **Traceability IDs:** [`BR-07`](project-context/PRD.md) / [`FEAT-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] URL built from `N8N_URL` + path env vars
    - [ ] 502 when the workflow returns failure
    - [ ] `{ model, raw }` returned on success

- [ ] **Task 5.2: n8n proxy implementation**
  - **Files:** `backend/src/services/n8n-proxy.ts`
  - **Description:** Implement HTTP client to `cv-analyze` / `cv-rewrite`
    webhooks with timeout. **Dependencies:** Task 5.1
  - **References:** [`project-context/architecture.md#core-flow`](project-context/architecture.md)
  - **Traceability IDs:** [`BR-07`](project-context/PRD.md) / [`NFR-02`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Analyze + rewrite calls implemented
    - [ ] Request timeout configured (via `N8N_TIMEOUT_MS`, default 300000 ms — model free bisa lambat, lihat NFR-02)
    - [ ] Task 5.1 tests pass
  - **Implementation (note):** `analyzeCv` di `backend/src/services/n8n-proxy.ts` sudah
    diimplementasikan lebih awal (dibutuhkan endpoint analyze, Task 4.6). Task 5.2 tinggal
    menambahkan `rewriteCv` + post-check call; Task 5.1 (`n8n-proxy.test.ts`) belum ada.

- [ ] **Task 5.3: Rewrite + post-check composition tests**
  - **Files:** `backend/src/services/rewrite.test.ts`
  - **Description:** Write tests for composing the rewrite record: merge rewrite
    raw output + post-check raw output, compute post-score, collect dropped-info
    warnings (BR-05/BR-06).
  - **References:** [`project-context/api.md#rewrite-shape`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-05`](project-context/PRD.md) / [`FEAT-06`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Rewrite record matches `rewrites` schema fields
    - [ ] Post-check failure does not discard the rewrite (NFR-08)

- [ ] **Task 5.4: Rewrite endpoint + export tests**
  - **Files:** `backend/src/routes/rewrites.test.ts`
  - **Description:** Write tests for `POST /api/approvals/:approvalId/rewrite`
    and `GET /api/rewrites/:rewriteId/export?format=pdf|docx` (mock proxy).
  - **References:** [`project-context/api.md#rewrite`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-07`](project-context/PRD.md) / [`AC-11`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Rewrite returns rewrite record (200)
    - [ ] Export returns PDF and DOCX for `format=pdf|docx`
    - [ ] 400 on unsupported format

- [ ] **Task 5.5: Rewrite endpoint + export implementation**
  - **Files:** `backend/src/routes/rewrites.ts`, `backend/src/services/export.ts`
  - **Description:** Implement rewrite endpoint (proxy → compose → store) and
    export service generating PDF (pdfmake) and DOCX (docx) from
    `rewritten_markdown`. **Dependencies:** Task 5.3, Task 5.4
  - **References:** [`project-context/architecture.md#core-flow`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-05`](project-context/PRD.md) / [`FEAT-07`](project-context/PRD.md) / [`BR-05`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Both PDF and DOCX generated from the same markdown source (AC-11)
    - [ ] Export honors BR-08 (ATS-friendly formatting) for PDF
    - [ ] Task 5.4 tests pass

---

## Phase 6: Frontend — React UI
> **Dependency:** Phase 5 must be complete
> **Goal:** 4 pages (Upload, Analysis, Approval, Result) with typed API client, minimalism styling per StyleGuide.

- [ ] **Task 6.1: Frontend scaffold + design tokens**
  - **Files:** `frontend/` (Vite + TS + Tailwind v4), `src/index.css` (tokens)
  - **Description:** Scaffold Vite React-TS app, Tailwind v4 via
    `@tailwindcss/vite`, `@theme` tokens from StyleGuide (Inter font, navy/blue/
    green palette, 8px grid, radius 0–6, no shadows), shadcn/ui init.
  - **References:** [`project-context/StyleGuide.md#color-tokens`](project-context/StyleGuide.md)
  - **Traceability IDs:** [`FEAT-*`](project-context/PRD.md) / [`NFR-06`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] `npm run dev:frontend` renders the app with tokens applied
    - [ ] No hardcoded hex in components (tokens only)
    - [ ] Inter font applied via Tailwind `fontFamily.sans`

- [ ] **Task 6.2: API client (typed)**
  - **Files:** `frontend/src/lib/api.ts`, `frontend/src/types/*.ts`
  - **Description:** Typed client for all REST endpoints; shared report/rewrite
    types matching api.md shapes; no raw `fetch` in components.
  - **References:** [`project-context/api.md#report-shape`](project-context/api.md)
  - **Traceability IDs:** [`FEAT-*`](project-context/PRD.md) / [`F-08`](project-context/rules.md)
  - **Acceptance Criteria:**
    - [ ] All 10 REST endpoints covered by client functions
    - [ ] Types mirror api.md report/rewrite shapes

- [ ] **Task 6.3: Pages — Upload & Analysis**
  - **Files:** `frontend/src/pages/upload.tsx`, `frontend/src/pages/analysis.tsx`
  - **Description:** Upload page (PDF + target job description form, 2 UI steps,
    single request), Analysis page (ATS gauge + checks breakdown + weaknesses +
    suggestions), loading feedback on submit.
  - **References:** [`project-context/StyleGuide.md#layout-rules`](project-context/StyleGuide.md)
  - **Traceability IDs:** [`FEAT-01`](project-context/PRD.md) / [`FEAT-02`](project-context/PRD.md) / [`FEAT-03`](project-context/PRD.md) / [`AC-01`](project-context/PRD.md) / [`AC-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Upload blocks submission when job description empty (AC-03)
    - [ ] Analysis page renders gauge + breakdown (color + label, not color alone)
    - [ ] Errors surfaced inline

- [ ] **Task 6.4: Pages — Approval & Result**
  - **Files:** `frontend/src/pages/approval.tsx`, `frontend/src/pages/result.tsx`
  - **Description:** Approval page (checkbox suggestions → "Setujui & Rewrite"),
    Result page (rewritten markdown, post-check score, warnings, PDF/DOCX
    download buttons), History list (CV list → review → approval → rewrite).
  - **References:** [`project-context/StyleGuide.md#component-conventions`](project-context/StyleGuide.md)
  - **Traceability IDs:** [`FEAT-04`](project-context/PRD.md) / [`FEAT-05`](project-context/PRD.md) / [`FEAT-07`](project-context/PRD.md) / [`FEAT-08`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] Rewrite disabled until ≥1 suggestion approved (AC-08)
    - [ ] PDF + DOCX downloads available from Result page
    - [ ] History traversal (CV → review → approval → rewrite) works (AC-12)

---

## Phase 7: E2E, Export & Ship
> **Dependency:** Phase 6 must be complete
> **Goal:** Full end-to-end test, workflow JSON committed, re-index codebase-memory, final commit.

- [ ] **Task 7.1: End-to-end integration test**
  - **Files:** e2e test or manual run doc
  - **Description:** Run the full flow locally: upload PDF → analyze → approve →
    rewrite → export PDF/DOCX, with real n8n + OpenRouter free models.
  - **References:** [`project-context/architecture.md#core-flow`](project-context/architecture.md)
  - **Traceability IDs:** [`AC-01`](project-context/PRD.md) / [`AC-11`](project-context/PRD.md) / [`BR-07`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] End-to-end flow completes without error
    - [ ] PDF and DOCX exports download successfully
    - [ ] Failover behavior verified (rate-limit path)

- [ ] **Task 7.2: Workflow JSON + final docs sync**
  - **Files:** `n8n/workflows/*.json`, `project-context/*.md` (if needed)
  - **Description:** Ensure exported workflow JSONs are committed; Task.md status
    fully updated; any discovered deviations reflected back in specs.
  - **References:** [`project-context/architecture.md#build-order`](project-context/architecture.md)
  - **Traceability IDs:** [`FEAT-03`](project-context/PRD.md)
  - **Acceptance Criteria:**
    - [ ] `n8n/workflows/` contains both workflows
    - [ ] Task.md progress overview fully checked

- [ ] **Task 7.3: Re-index codebase-memory + final commit**
  - **Files:** repo-wide
  - **Description:** Run codebase-memory re-index (persistence true), run lint +
    typecheck, then commit (user-confirmed, Conventional Commits, `.codebase-memory/`
    not committed by default).
  - **References:** [`project-context/rules.md#6`](project-context/rules.md)
  - **Traceability IDs:** [`RULE-*`](project-context/rules.md)
  - **Acceptance Criteria:**
    - [ ] `npm run lint` + `npm run typecheck` pass
    - [ ] Final commit created only after explicit user confirmation
    - [ ] `.codebase-memory/` binaries excluded

---

## Traceability Matrix
| Requirement ID | Source | Covering Tasks |
|----------------|--------|----------------|
| FEAT-01 (CV Upload) | `project-context/PRD.md` | 4.6, 6.2, 6.3 |
| FEAT-02 (Target Job Description) | `project-context/PRD.md` | 4.6, 6.3 |
| FEAT-03 (ATS Analysis) | `project-context/PRD.md` | 2.1, 4.1, 4.2, 4.3, 4.4, 5.1, 6.3, 7.2 |
| FEAT-04 (Approval HITL) | `project-context/PRD.md` | 4.7, 6.4 |
| FEAT-05 (CV Rewrite) | `project-context/PRD.md` | 2.2, 5.3, 5.5, 6.4 |
| FEAT-06 (Post-Check) | `project-context/PRD.md` | 2.2, 5.3 |
| FEAT-07 (Export) | `project-context/PRD.md` | 5.4, 5.5, 6.4, 7.1 |
| FEAT-08 (History) | `project-context/PRD.md` | 3.2, 3.3, 4.5, 4.6, 6.4 |
| BR-01 (JD required) | `project-context/PRD.md` | 4.6, 6.3 |
| BR-02 (fit = CV↔JD) | `project-context/PRD.md` | 4.1, 4.2 |
| BR-03 (valid PDF) | `project-context/PRD.md` | 4.6 |
| BR-04 (approval before rewrite) | `project-context/PRD.md` | 4.7, 6.4 |
| BR-05 (preserve facts) | `project-context/PRD.md` | 2.2, 5.3, 5.5 |
| BR-06 (post-check warnings) | `project-context/PRD.md` | 2.2, 5.3 |
| BR-07 (failover) | `project-context/PRD.md` | 1.3, 2.1, 2.2, 5.1, 5.2, 7.1 |
| BR-08 (structured output) | `project-context/PRD.md` | 5.5 |
| BR-09 (output language) | `project-context/PRD.md` | 2.2 |
| BR-10 (no auth) | `project-context/PRD.md` | 1.1, 4.6 |
| AC-01, AC-02 | `project-context/PRD.md` | 4.6, 6.3, 7.1 |
| AC-03, AC-04 | `project-context/PRD.md` | 4.6, 6.3 |
| AC-05, AC-06 | `project-context/PRD.md` | 4.2, 4.3, 4.4 |
| AC-07, AC-08 | `project-context/PRD.md` | 4.7, 6.4 |
| AC-09, AC-10 | `project-context/PRD.md` | 5.3, 5.5 |
| AC-11, AC-12 | `project-context/PRD.md` | 5.5, 6.4, 7.1 |
| NFR-02, NFR-03, NFR-06, NFR-08 | `project-context/PRD.md` | 1.3, 5.2, 6.1, 5.3 |
| DATA-* | `project-context/schema.md` | 3.1, 3.2, 3.3, 3.4 |
| API-* | `project-context/api.md` | 2.3, 4.5, 4.6, 4.7, 5.1, 5.4, 6.2 |
| RULE-* (incl. F-01…F-09) | `project-context/rules.md` | 1.2, 3.4, 4.4, 6.2, 7.3 |

## Assumptions & Open Questions
- **Assumption:** Task granularity is **modular** (1 task = 1 endpoint/component/service), per user preference.
- **Assumption:** Per-phase gate is authoritative: manual review → confirmation → `spec-compliance` → `code-review` → confirmation before next phase.
- **Assumption:** n8n workflows are built via the n8n MCP tooling and exported to JSON; no Code nodes anywhere.
- **Open question:** exact `overallScore` weights are locked at build time (Task 4.2) — pending Fachri during implementation.
- **Open question:** history UI as full page vs simple list (PRD Open Questions) — resolved during Task 6.4 as a list view.
