# Schema

Project: cv-ats-reviewer-n8n
Last updated: 2026-08-05
Database: SQLite local file `./data/app.db`, managed by the backend
(Node.js `node:sqlite` / `DatabaseSync`).

## Purpose

Local persistence for CVs, analyses, approvals, and rewrites. The n8n
workflows never access the database; everything is stored through the
TypeScript backend.

## Storage Engine

- Engine: SQLite via Node built-in `node:sqlite` (`DatabaseSync`)
- File: `./data/app.db`
- Foreign keys: enabled (`PRAGMA foreign_keys = ON`)
- JSON stored as `TEXT` columns; the backend serializes/deserializes.
- All timestamps stored as UTC ISO-8601 strings (`TEXT`).

## Conventions

- Primary keys are integers (`INTEGER PRIMARY KEY AUTOINCREMENT`).
- `*_json` columns store `TEXT` (JSON serialized).
- Indexes created on foreign-key columns and frequently queried fields.

---

## Tables

### 1. cvs

Stores each uploaded CV and its extracted text.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | CV id |
| original_filename | TEXT | NOT NULL | Uploaded PDF filename |
| cv_text | TEXT | NOT NULL | Extracted text (pdf-parse) |
| created_at | TEXT | NOT NULL | UTC ISO-8601 |
| updated_at | TEXT | NOT NULL | UTC ISO-8601 |

Notes:
- `cv_text` is the source of truth for analysis; the PDF file itself is not
  persisted (text only). If binary PDF storage is needed later, add a
  `pdf_blob` BLOB column (deferred).
- `cvs.latest_review_id` is **not stored** — it is a computed value (latest
  `reviews` row per `cv_id`) exposed by the API (`GET /api/cvs`).

### 2. target_jobs

Stores the target job descriptions the user provides per analysis.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | Target job id |
| cv_id | INTEGER | FK → cvs.id NOT NULL | Owning CV |
| title | TEXT | NULL | Optional role/title label |
| description | TEXT | NOT NULL | User's description of the targeted job (required) |
| created_at | TEXT | NOT NULL | UTC ISO-8601 |

Notes:
- One CV may have several analyses against different target jobs (BR-02).
- `description` is the mandatory target job description from FEAT-02.

### 3. reviews (analyses)

Stores the ATS analysis results.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | Analysis id |
| cv_id | INTEGER | FK → cvs.id NOT NULL | Analyzed CV |
| target_job_id | INTEGER | FK → target_jobs.id NOT NULL | Target job used |
| overall_score | REAL | NOT NULL | 0–100 composite score |
| ats_checks_json | TEXT | NOT NULL | `atsChecks[]` from the report |
| weaknesses_json | TEXT | NOT NULL | `weaknesses[]` from the report |
| suggestions_json | TEXT | NOT NULL | `suggestions[]` from the report |
| model_used | TEXT | NOT NULL | Model that produced the result |
| status | TEXT | NOT NULL DEFAULT 'completed' | 'completed' \| 'failed' |
| error_message | TEXT | NULL | Message when status='failed' |
| created_at | TEXT | NOT NULL | UTC ISO-8601 |

Notes:
- Mirrors the analyze report shape (PRD AC-05): `overallScore`,
  `atsChecks[]`, `weaknesses[]`, `suggestions[]`, `modelUsed`.
- `status='failed'` records a failed run without wiping prior data.

### 4. approvals

Records which suggestions the user approved before rewriting.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | Approval id |
| review_id | INTEGER | FK → reviews.id NOT NULL | Source analysis |
| approved_suggestions_json | TEXT | NOT NULL | Subset of suggestions approved by the user |
| approved_at | TEXT | NOT NULL | UTC ISO-8601 |

Notes:
- Only approved suggestions are sent to the rewrite workflow (BR-04 / AC-07).
- Storing JSON keeps the subset flexible; no separate suggestion table in v1.

### 5. rewrites

Stores the rewritten CV and its post-check result.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | Rewrite id |
| review_id | INTEGER | FK → reviews.id NOT NULL | Source analysis |
| approval_id | INTEGER | FK → approvals.id NOT NULL | Approval that triggered it |
| rewritten_markdown | TEXT | NOT NULL | Rewritten CV (markdown) |
| post_score | REAL | NULL | Post-check ATS score (0–100) |
| dropped_info_warnings_json | TEXT | NULL | `warnings[]` from post-check |
| post_model_used | TEXT | NULL | Model used for the rewrite |
| status | TEXT | NOT NULL DEFAULT 'completed' | 'completed' \| 'failed' |
| error_message | TEXT | NULL | Message when status='failed' |
| created_at | TEXT | NOT NULL | UTC ISO-8601 |

Notes:
- `rewritten_markdown` is the canonical rewrite source for PDF/DOCX export.
- Post-check fields nullable because a failed post-check should not lose the
  rewrite (NFR-08).

---

## Relationships

```
cvs 1───n target_jobs
cvs 1───n reviews          (reviews.target_job_id → target_jobs.id)
reviews 1───n approvals
reviews 1───1 rewrites     (rewrites.review_id; rewrites.approval_id → approvals.id)
```

Flow: `cvs → target_jobs → reviews → approvals → rewrites`

---

## Indexes

| Index | Table | Columns |
|---|---|---|
| idx_target_jobs_cv_id | target_jobs | cv_id |
| idx_reviews_cv_id | reviews | cv_id |
| idx_reviews_target_job_id | reviews | target_job_id |
| idx_approvals_review_id | approvals | review_id |
| idx_rewrites_review_id | rewrites | review_id |
| idx_rewrites_approval_id | rewrites | approval_id |

---

## Migration Notes

- v1 created directly via `CREATE TABLE IF NOT EXISTS` at backend startup.
- No migration framework in v1 (single-user local tool).
- Future: add `pdf_blob` to `cvs` if PDF retention is needed.
