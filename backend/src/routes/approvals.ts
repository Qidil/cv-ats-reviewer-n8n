import { Router, type Request, type Response } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import {
  getApprovalById,
  getReviewById,
  getRewriteById,
  insertApproval,
} from '../db/repos.js'
import { parseId } from '../utils/route-id.js'

export function createApprovalsRouter(db: DatabaseSync): Router {
  const router = Router()

  router.post('/reviews/:reviewId/approve', (req: Request, res: Response) => {
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

    const body = req.body as { approvedSuggestionIds?: unknown }
    const ids = body.approvedSuggestionIds
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id): id is string => typeof id === 'string')) {
      res.status(400).json({ error: 'approvedSuggestionIds wajib berupa array string yang tidak kosong.' })
      return
    }

    const knownIds = new Set(review.suggestions.map((suggestion) => suggestion.id))
    const unknown = ids.filter((id) => !knownIds.has(id))
    if (unknown.length > 0) {
      res.status(400).json({ error: `Saran tidak dikenal: ${unknown.join(', ')}` })
      return
    }

    const approvedSuggestions = review.suggestions.filter((suggestion) => ids.includes(suggestion.id))
    const approvalId = insertApproval(db, { reviewId, approvedSuggestions })
    res.status(200).json({ id: approvalId })
  })

  router.get('/approvals/:approvalId', (req: Request, res: Response) => {
    const approvalId = parseId(req.params.approvalId ?? '')
    if (approvalId === undefined) {
      res.status(404).json({ error: 'Approval tidak ditemukan.' })
      return
    }
    const approval = getApprovalById(db, approvalId)
    if (approval === undefined) {
      res.status(404).json({ error: 'Approval tidak ditemukan.' })
      return
    }
    res.status(200).json({
      id: approval.id,
      reviewId: approval.reviewId,
      approvedSuggestionIds: approval.approvedSuggestions.map((suggestion) => suggestion.id),
      approvedAt: approval.approvedAt,
    })
  })

  router.get('/rewrites/:rewriteId', (req: Request, res: Response) => {
    const rewriteId = parseId(req.params.rewriteId ?? '')
    if (rewriteId === undefined) {
      res.status(404).json({ error: 'Rewrite tidak ditemukan.' })
      return
    }
    const rewrite = getRewriteById(db, rewriteId)
    if (rewrite === undefined) {
      res.status(404).json({ error: 'Rewrite tidak ditemukan.' })
      return
    }
    res.status(200).json({
      id: rewrite.id,
      reviewId: rewrite.reviewId,
      approvalId: rewrite.approvalId,
      rewrittenMarkdown: rewrite.rewrittenMarkdown,
      postScore: rewrite.postScore,
      warnings: rewrite.warnings,
      postModelUsed: rewrite.postModelUsed,
      createdAt: rewrite.createdAt,
    })
  })

  return router
}
