import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, initDb, openAppDb } from './connection.js'

const TABLES = ['cvs', 'target_jobs', 'reviews', 'approvals', 'rewrites', 'job_matches']
const INDEXES = [
  'idx_target_jobs_cv_id',
  'idx_reviews_cv_id',
  'idx_reviews_target_job_id',
  'idx_job_matches_cv_id',
  'idx_approvals_review_id',
  'idx_rewrites_review_id',
  'idx_rewrites_approval_id',
]

let db: DatabaseSync | undefined
let dir: string | undefined

afterEach(() => {
  db?.close()
  db = undefined
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = undefined
  }
})

function createTempDb(): DatabaseSync {
  dir = mkdtempSync(join(tmpdir(), 'cv-ats-'))
  db = openDb(join(dir, 'test.db'))
  initDb(db)
  return db
}

function tableNames(): string[] {
  const rows = db!
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name).sort()
}

function indexNames(): string[] {
  const rows = db!
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name).sort()
}

describe('db connection', () => {
  it('enables PRAGMA foreign_keys', () => {
    createTempDb()
    const row = db!.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(row.foreign_keys).toBe(1)
  })

  it('creates all schema tables on initDb()', () => {
    createTempDb()
    expect(tableNames()).toEqual([...TABLES].sort())
  })

  it('creates all schema indexes on initDb()', () => {
    createTempDb()
    expect(indexNames()).toEqual([...INDEXES].sort())
  })

  it('enforces foreign key constraints', () => {
    createTempDb()
    expect(() =>
      db!
        .prepare(
          `INSERT INTO reviews (cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json, suggestions_json, model_used, created_at)
           VALUES (999, 999, 0, '[]', '[]', '[]', 'test', '2026-01-01T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow()
  })

  it('openAppDb creates the parent directory when missing', () => {
    const base = mkdtempSync(join(tmpdir(), 'cv-ats-app-'))
    const nested = join(base, 'nested', 'data')
    const previous = process.env.DB_PATH
    process.env.DB_PATH = join(nested, 'app.db')
    try {
      const appDb = openAppDb()
      appDb.close()
      const dirExists = existsSync(nested)
      expect(dirExists).toBe(true)
    } finally {
      process.env.DB_PATH = previous
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('migrates a pre-Phase-14 cvs table by adding the typography_json column (Phase 14)', () => {
    dir = mkdtempSync(join(tmpdir(), 'cv-ats-p14-'))
    db = openDb(join(dir, 'legacy.db'))
    db.exec(`
      CREATE TABLE cvs (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        original_filename TEXT    NOT NULL,
        cv_text           TEXT    NOT NULL,
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL
      );
    `)
    db.exec(
      `INSERT INTO cvs (original_filename, cv_text, created_at, updated_at)
       VALUES ('cv.pdf', 'text', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )

    initDb(db)

    const cols = db.prepare('PRAGMA table_info(cvs)').all() as Array<{ name: string }>
    expect(cols.some((col) => col.name === 'typography_json')).toBe(true)

    const preserved = db.prepare('SELECT original_filename, cv_text FROM cvs WHERE id = 1').get() as {
      original_filename: string
      cv_text: string
    }
    expect(preserved).toEqual({ original_filename: 'cv.pdf', cv_text: 'text' })
  })

  it('migrates a pre-Phase-11 reviews table from NOT NULL to NULL target_job_id (finding #7)', () => {
    dir = mkdtempSync(join(tmpdir(), 'cv-ats-legacy-'))
    db = openDb(join(dir, 'legacy.db'))
    db.exec(`
      CREATE TABLE cvs (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        original_filename TEXT    NOT NULL,
        cv_text           TEXT    NOT NULL,
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL
      );
      CREATE TABLE target_jobs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        cv_id       INTEGER NOT NULL REFERENCES cvs(id),
        title       TEXT    NULL,
        description TEXT    NOT NULL,
        created_at  TEXT    NOT NULL
      );
      CREATE TABLE reviews (
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
    `)
    db.exec(
      `INSERT INTO cvs (original_filename, cv_text, created_at, updated_at)
       VALUES ('cv.pdf', 'text', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
    db.exec(
      `INSERT INTO target_jobs (cv_id, title, description, created_at)
       VALUES (1, 'Backend', 'desc', '2026-01-01T00:00:00.000Z')`,
    )
    db.exec(
      `INSERT INTO reviews
         (cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json,
          suggestions_json, model_used, status, error_message, created_at)
       VALUES (1, 1, 77, '[]', '[]', '[]', 'nvidia/test:free', 'completed', NULL,
               '2026-01-01T00:00:00.000Z')`,
    )

    initDb(db)

    const cols = db.prepare('PRAGMA table_info(reviews)').all() as Array<{
      name: string
      notnull: number
    }>
    expect(cols.find((col) => col.name === 'target_job_id')?.notnull).toBe(0)

    const preserved = db.prepare('SELECT overall_score, model_used FROM reviews WHERE id = 1').get() as {
      overall_score: number
      model_used: string
    }
    expect(preserved).toEqual({ overall_score: 77, model_used: 'nvidia/test:free' })

    db.exec(
      `INSERT INTO reviews
         (cv_id, target_job_id, overall_score, ats_checks_json, weaknesses_json,
          suggestions_json, model_used, status, error_message, created_at)
       VALUES (1, NULL, 55, '[]', '[]', '[]', 'nvidia/test:free', 'completed', NULL,
               '2026-01-02T00:00:00.000Z')`,
    )
    expect(db.prepare('SELECT COUNT(*) AS n FROM reviews').get()).toEqual({ n: 2 })
  })
})
