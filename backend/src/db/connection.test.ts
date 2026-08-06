import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb, initDb, openAppDb } from './connection.js'

const TABLES = ['cvs', 'target_jobs', 'reviews', 'approvals', 'rewrites']
const INDEXES = [
  'idx_target_jobs_cv_id',
  'idx_reviews_cv_id',
  'idx_reviews_target_job_id',
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
})
