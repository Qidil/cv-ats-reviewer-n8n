import { Router, type Request, type Response } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import {
  getLatestApprovalByReviewId,
  getReviewById,
  getRewriteByReviewId,
} from '../db/repos.js'
import { parseId } from '../utils/route-id.js'

export function createReviewsRouter(db: DatabaseSync): Router {
  const router = Router()

  router.get('/:reviewId', (req: Request, res: Response) => {
    const reviewId = parseId(req.params.reviewId ?? '')
    if (reviewId === undefined) {
      res.status(404).json({ error: 'Review tidak ditemukan.' })
      return
    }
    const review = getReviewById(db, reviewId)
    if (review === undefined) {
      res.status(404).json({ error: 'Review tidak ditemukan.' })
      return
    }
    const approval = getLatestApprovalByReviewId(db, reviewId)
    const rewrite = getRewriteByReviewId(db, reviewId)
    res.status(200).json({
      id: review.id,
      cvId: review.cvId,
      overallScore: review.overallScore,
      atsChecks: review.atsChecks,
      weaknesses: review.weaknesses,
      suggestions: review.suggestions,
      modelUsed: review.modelUsed,
      createdAt: review.createdAt,
      approvalId: approval?.id ?? null,
      rewriteId: rewrite?.id ?? null,
    })
  })

  return router
}
