import { Router, type Request, type Response } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import { getJobMatchById } from '../db/repos.js'
import { parseId } from '../utils/route-id.js'

export function createJobMatchesRouter(db: DatabaseSync): Router {
  const router = Router()

  router.get('/:matchId', (req: Request, res: Response) => {
    const matchId = parseId(req.params.matchId ?? '')
    if (matchId === undefined) {
      res.status(404).json({ error: 'Job match tidak ditemukan.' })
      return
    }
    const match = getJobMatchById(db, matchId)
    if (match === undefined) {
      res.status(404).json({ error: 'Job match tidak ditemukan.' })
      return
    }
    res.status(200).json({
      id: match.id,
      cvId: match.cvId,
      matches: match.matches,
      modelUsed: match.modelUsed,
      status: match.status,
      errorMessage: match.errorMessage,
      createdAt: match.createdAt,
    })
  })

  return router
}
