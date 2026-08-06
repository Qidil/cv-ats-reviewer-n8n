import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applySchema } from './schema.js'

export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

export function initDb(db: DatabaseSync): void {
  applySchema(db)
}

export function openAppDb(): DatabaseSync {
  const dbPath = process.env.DB_PATH ?? './data/app.db'
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = openDb(dbPath)
  initDb(db)
  return db
}
