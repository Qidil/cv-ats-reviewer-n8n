import express, { type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { pathToFileURL } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'
import { openAppDb } from './db/connection.js'
import { createCvsRouter } from './routes/cvs.js'
import { createReviewsRouter } from './routes/reviews.js'
import { createJobMatchesRouter } from './routes/job-matches.js'

const MAX_CV_BYTES = 5 * 1024 * 1024
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

function corsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (_req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: `Ukuran file melebihi batas ${MAX_CV_BYTES / (1024 * 1024)} MB.` })
    return
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: 'Body JSON tidak valid.' })
    return
  }
  res.status(500).json({ error: 'Terjadi kesalahan internal.' })
}

export function createApp(db: DatabaseSync): express.Express {
  const app = express()
  app.use(express.json())
  app.use(corsMiddleware)
  app.use('/api/cvs', createCvsRouter(db))
  app.use('/api/reviews', createReviewsRouter(db))
  app.use('/api/job-matches', createJobMatchesRouter(db))
  app.use(errorHandler)
  return app
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return pathToFileURL(entry).href === import.meta.url
  } catch {
    return false
  }
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? 3001)
  const db = openAppDb()
  createApp(db).listen(port)
}
