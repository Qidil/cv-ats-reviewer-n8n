import { Router, type Request, type Response } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import {
  getApprovalById,
  getCvById,
  getRewriteById,
  getReviewById,
  getTargetJobById,
  insertRewrite,
} from '../db/repos.js'
import {
  rewriteCv,
  N8nProxyError,
  type RewriteFormat,
} from '../services/n8n-proxy.js'
import { buildAnalyzeContext, composeRewrite } from '../services/rewrite.js'
import { exportRewrite } from '../services/export.js'
import { parseId } from '../utils/route-id.js'
import { describeRewriteFailure } from '../utils/model-parser.js'

const REWRITE_FORMATS: readonly RewriteFormat[] = [
  'chronological',
  'combination',
  'functional',
]

function normalizeFormat(raw: unknown): RewriteFormat {
  if (
    typeof raw === 'string' &&
    (REWRITE_FORMATS as readonly string[]).includes(raw)
  ) {
    return raw as RewriteFormat
  }
  return 'chronological'
}

export function createRewritesRouter(db: DatabaseSync): Router {
  const router = Router()

  router.post('/approvals/:approvalId/rewrite', async (req: Request, res: Response) => {
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
    const review = getReviewById(db, approval.reviewId)
    if (review === undefined) {
      res.status(404).json({ error: 'Review tidak ditemukan.' })
      return
    }
    const cv = getCvById(db, review.cvId)
    const targetJob = review.targetJobId === null ? undefined : getTargetJobById(db, review.targetJobId)
    if (cv === undefined || targetJob === undefined) {
      res.status(500).json({ error: 'Data CV tidak lengkap.' })
      return
    }

    const format = normalizeFormat(req.body?.format)
    const analyzeContext = buildAnalyzeContext(review)

    let result
    try {
      result = await rewriteCv({
        cvId: cv.id,
        targetJobDescription: targetJob.description,
        originalCv: cv.cvText,
        approvedSuggestions: approval.approvedSuggestions,
        format,
        analyzeContext,
      })
    } catch (error) {
      if (error instanceof N8nProxyError) {
        res.status(502).json({ error: error.message })
        return
      }
      throw error
    }

    const composed = composeRewrite(result)
    if (composed.rewrittenMarkdown.trim().length === 0) {
      res.status(502).json({ error: describeRewriteFailure(result.finishReason) })
      return
    }
    const rewriteId = insertRewrite(db, {
      reviewId: review.id,
      approvalId,
      rewrittenMarkdown: composed.rewrittenMarkdown,
      postScore: composed.postScore,
      warnings: composed.warnings,
      postModelUsed: composed.postModelUsed,
    })
    const rewrite = getRewriteById(db, rewriteId)
    res.status(200).json({
      id: rewriteId,
      reviewId: review.id,
      approvalId,
      rewrittenMarkdown: composed.rewrittenMarkdown,
      postScore: composed.postScore,
      warnings: composed.warnings,
      postModelUsed: composed.postModelUsed,
      createdAt: rewrite?.createdAt ?? new Date().toISOString(),
    })
  })

  router.get('/rewrites/:rewriteId/export', async (req: Request, res: Response) => {
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
    const format = typeof req.query.format === 'string' ? req.query.format : ''
    if (format !== 'pdf' && format !== 'docx') {
      res.status(400).json({ error: 'Format tidak didukung. Gunakan pdf atau docx.' })
      return
    }
    const exported = await exportRewrite(rewrite.rewrittenMarkdown, format)
    res.setHeader('Content-Type', exported.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`)
    res.status(200).send(exported.buffer)
  })

  return router
}
