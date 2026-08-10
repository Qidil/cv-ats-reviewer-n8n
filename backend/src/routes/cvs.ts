import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { PDFParse } from 'pdf-parse'
import type { DatabaseSync } from 'node:sqlite'
import { analyzeCv as deterministicAnalyze, composeReport } from '../services/ats.js'
import { analyzeCv as proxyAnalyze, N8nProxyError } from '../services/n8n-proxy.js'
import { parseAnalyzeReport, ModelParseError, describeAnalyzeFailure } from '../utils/model-parser.js'
import { parseId } from '../utils/route-id.js'
import {
  getCvById,
  getLatestTargetJobByCvId,
  getReviewById,
  insertCv,
  insertReview,
  insertTargetJob,
  listCvs,
} from '../db/repos.js'

const MAX_CV_BYTES = 5 * 1024 * 1024

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CV_BYTES } })

function toReportJson(reviewId: number, cvId: number, report: ReturnType<typeof composeReport>, modelUsed: string, createdAt: string) {
  return {
    id: reviewId,
    cvId,
    overallScore: report.overallScore,
    atsChecks: report.atsChecks,
    weaknesses: report.weaknesses,
    suggestions: report.suggestions,
    modelUsed,
    createdAt,
  }
}

export function createCvsRouter(db: DatabaseSync): Router {
  const router = Router()

  router.post('/', upload.single('cv'), async (req: Request, res: Response) => {
    if (req.file === undefined) {
      res.status(400).json({ error: 'File CV tidak ditemukan.' })
      return
    }
    if (req.file.mimetype !== 'application/pdf') {
      res.status(415).json({ error: 'File harus berupa PDF.' })
      return
    }
    const body = req.body as { targetJobTitle?: unknown; targetJobDescription?: unknown }
    const description = typeof body.targetJobDescription === 'string' ? body.targetJobDescription.trim() : ''
    if (description.length === 0) {
      res.status(400).json({ error: 'Deskripsi pekerjaan target wajib diisi.' })
      return
    }
    let cvText: string
    try {
      const parser = new PDFParse({ data: req.file.buffer })
      const result = await parser.getText()
      cvText = result.text
    } catch {
      res.status(400).json({ error: 'PDF tidak dapat dibaca.' })
      return
    }
    const title =
      typeof body.targetJobTitle === 'string' && body.targetJobTitle.trim().length > 0
        ? body.targetJobTitle.trim()
        : null
    const cvId = insertCv(db, { originalFilename: req.file.originalname, cvText })
    insertTargetJob(db, { cvId, title, description })
    res.status(201).json({ id: cvId })
  })

  router.get('/', (_req: Request, res: Response) => {
    res.json(listCvs(db))
  })

  router.post('/:cvId/analyze', async (req: Request, res: Response) => {
    const cvId = parseId(req.params.cvId ?? '')
    if (cvId === undefined) {
      res.status(404).json({ error: 'CV tidak ditemukan.' })
      return
    }
    const cv = getCvById(db, cvId)
    if (cv === undefined) {
      res.status(404).json({ error: 'CV tidak ditemukan.' })
      return
    }
    const targetJob = getLatestTargetJobByCvId(db, cvId)
    if (targetJob === undefined) {
      res.status(400).json({ error: 'Deskripsi pekerjaan target belum tersedia.' })
      return
    }

    const deterministic = deterministicAnalyze(cv.cvText, targetJob.description)

    let model: string
    let raw: string
    let finishReason: string | null
    try {
      const proxyResult = await proxyAnalyze({
        cvId,
        cvText: cv.cvText,
        targetJobDescription: targetJob.description,
      })
      model = proxyResult.model
      raw = proxyResult.raw
      finishReason = proxyResult.finishReason
    } catch (error) {
      if (error instanceof N8nProxyError) {
        res.status(502).json({ error: error.message })
        return
      }
      throw error
    }

    let parsed
    try {
      parsed = parseAnalyzeReport(raw)
    } catch (error) {
      if (error instanceof ModelParseError) {
        res.status(502).json({ error: describeAnalyzeFailure(raw, finishReason) })
        return
      }
      throw error
    }

    const report = composeReport(deterministic, parsed)
    const reviewId = insertReview(db, {
      cvId,
      targetJobId: targetJob.id,
      overallScore: report.overallScore,
      atsChecks: report.atsChecks,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      modelUsed: model,
    })
    const review = getReviewById(db, reviewId)
    res.status(200).json(
      toReportJson(reviewId, cvId, report, model, review?.createdAt ?? new Date().toISOString()),
    )
  })

  return router
}
