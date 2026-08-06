import type { DatabaseSync } from 'node:sqlite'

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS cvs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT    NOT NULL,
  cv_text           TEXT    NOT NULL,
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
  target_job_id      INTEGER NOT NULL REFERENCES target_jobs(id),
  overall_score      REAL    NOT NULL,
  ats_checks_json    TEXT    NOT NULL,
  weaknesses_json    TEXT    NOT NULL,
  suggestions_json   TEXT    NOT NULL,
  model_used         TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'completed',
  error_message      TEXT    NULL,
  created_at         TEXT    NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_approvals_review_id ON approvals (review_id);
CREATE INDEX IF NOT EXISTS idx_rewrites_review_id ON rewrites (review_id);
CREATE INDEX IF NOT EXISTS idx_rewrites_approval_id ON rewrites (approval_id);
`

export function applySchema(db: DatabaseSync): void {
  db.exec(CREATE_TABLES_SQL)
  db.exec(CREATE_INDEXES_SQL)
}
