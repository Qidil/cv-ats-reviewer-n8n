import type { DatabaseSync } from 'node:sqlite'

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS cvs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT    NOT NULL,
  cv_text           TEXT    NOT NULL,
  typography_json   TEXT    NULL,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS target_jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cv_id       INTEGER NOT NULL REFERENCES cvs(id),
  title       TEXT    NULL,
  description TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cv_id              INTEGER NOT NULL REFERENCES cvs(id),
  target_job_id      INTEGER NULL REFERENCES target_jobs(id),
  overall_score      REAL    NOT NULL,
  ats_checks_json    TEXT    NOT NULL,
  weaknesses_json    TEXT    NOT NULL,
  suggestions_json   TEXT    NOT NULL,
  model_used         TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'completed',
  error_message      TEXT    NULL,
  created_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS job_matches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cv_id         INTEGER NOT NULL REFERENCES cvs(id),
  matches_json  TEXT    NOT NULL,
  model_used    TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'completed',
  error_message TEXT    NULL,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id                 INTEGER NOT NULL REFERENCES reviews(id),
  approved_suggestions_json TEXT    NOT NULL,
  approved_at               TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS rewrites (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id                   INTEGER NOT NULL REFERENCES reviews(id),
  approval_id                 INTEGER NOT NULL REFERENCES approvals(id),
  rewritten_markdown          TEXT    NOT NULL,
  post_score                  REAL    NULL,
  dropped_info_warnings_json  TEXT    NULL,
  post_model_used             TEXT    NULL,
  status                      TEXT    NOT NULL DEFAULT 'completed',
  error_message               TEXT    NULL,
  created_at                  TEXT    NOT NULL
);
`

const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_target_jobs_cv_id ON target_jobs (cv_id);
CREATE INDEX IF NOT EXISTS idx_reviews_cv_id ON reviews (cv_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target_job_id ON reviews (target_job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_cv_id ON job_matches (cv_id);
CREATE INDEX IF NOT EXISTS idx_approvals_review_id ON approvals (review_id);
CREATE INDEX IF NOT EXISTS idx_rewrites_review_id ON rewrites (review_id);
CREATE INDEX IF NOT EXISTS idx_rewrites_approval_id ON rewrites (approval_id);
`

// Phase 12, finding #7: DB yang dibuat sebelum Phase 11 masih punya
// `reviews.target_job_id INTEGER NOT NULL`. Mode B (jobs) menyimpan review dengan
// `targetJobId: null` → insert null ke kolom NOT NULL → SQLITE_CONSTRAINT tak
// tertangani → 500. `CREATE TABLE IF NOT EXISTS` tidak mengubah tabel yang sudah
// ada, jadi kita rebuild tabel reviews ke nullable saat constraint lama terdeteksi.
// FK aman: `PRAGMA foreign_keys = OFF` di luar transaksi, lalu create-copy-drop-
// rename dalam satu transaksi, lalu nyalakan kembali. Data dipertahankan.
function migrateReviewsTargetJobNullable(db: DatabaseSync): void {
  const cols = db.prepare('PRAGMA table_info(reviews)').all() as Array<{
    name: string
    notnull: number
  }>
  const targetJobColumn = cols.find((col) => col.name === 'target_job_id')
  if (targetJobColumn === undefined || targetJobColumn.notnull === 0) {
    return
  }

  db.exec('PRAGMA foreign_keys = OFF')
  try {
    db.exec('BEGIN')
    db.exec(`
      CREATE TABLE reviews_new (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        cv_id              INTEGER NOT NULL REFERENCES cvs(id),
        target_job_id      INTEGER NULL REFERENCES target_jobs(id),
        overall_score      REAL    NOT NULL,
        ats_checks_json    TEXT    NOT NULL,
        weaknesses_json    TEXT    NOT NULL,
        suggestions_json   TEXT    NOT NULL,
        model_used         TEXT    NOT NULL,
        status             TEXT    NOT NULL DEFAULT 'completed',
        error_message      TEXT    NULL,
        created_at         TEXT    NOT NULL
      );
    `)
    db.exec(`
      INSERT INTO reviews_new
        (id, cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json,
         suggestions_json, model_used, status, error_message, created_at)
      SELECT
        id, cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json,
        suggestions_json, model_used, status, error_message, created_at
      FROM reviews;
    `)
    db.exec('DROP TABLE reviews;')
    db.exec('ALTER TABLE reviews_new RENAME TO reviews;')
    db.exec("UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM reviews) WHERE name = 'reviews';")
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

// Phase 14: kolom `cvs.typography_json` menyimpan metadata tipografi/layout hasil
// ekstraksi pdfjs (family font, ukuran, line-spacing, margin, layout kolom,
// grafis). `CREATE TABLE IF NOT EXISTS` tidak mengubah tabel lama, jadi tambahkan
// kolom via ALTER TABLE saat belum ada. Kolom nullable → migrasi aman tanpa
// rebuild tabel.
function migrateCvsTypographyColumn(db: DatabaseSync): void {
  const cols = db.prepare('PRAGMA table_info(cvs)').all() as Array<{
    name: string
  }>
  const hasColumn = cols.some((col) => col.name === 'typography_json')
  if (hasColumn) {
    return
  }
  db.exec('ALTER TABLE cvs ADD COLUMN typography_json TEXT NULL;')
}

export function applySchema(db: DatabaseSync): void {
  db.exec(CREATE_TABLES_SQL)
  migrateReviewsTargetJobNullable(db)
  migrateCvsTypographyColumn(db)
  db.exec(CREATE_INDEXES_SQL)
}
