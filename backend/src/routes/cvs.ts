import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import type { DatabaseSync } from 'node:sqlite'
import { extractPdfText } from '../services/pdf-extract.js'
import { analyzeCv as deterministicAnalyze, composeReport } from '../services/ats.js'
import { analyzeCv as proxyAnalyze, matchJobs, N8nProxyError } from '../services/n8n-proxy.js'
import { parseAnalyzeReport, parseJobsReport, ModelParseError, describeAnalyzeFailure, describeJobsFailure } from '../utils/model-parser.js'
import { parseId } from '../utils/route-id.js'
import {
  getCvById,
  getJobMatchById,
  getLatestTargetJobByCvId,
  getReviewById,
  insertCv,
  insertJobMatch,
  insertReview,
  insertTargetJob,
  listCvs,
  type Cv,
} from '../db/repos.js'

const MAX_CV_BYTES = 5 * 1024 * 1024

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CV_BYTES } })

function toReportJson(
  reviewId: number,
  cvId: number,
  targetJobId: number | null,
  report: ReturnType<typeof composeReport>,
  modelUsed: string,
  createdAt: string,
) {
  return {
    id: reviewId,
    cvId,
    targetJobId,
    overallScore: report.overallScore,
    atsChecks: report.atsChecks,
    weaknesses: report.weaknesses,
    suggestions: report.suggestions,
    modelUsed,
    createdAt,
  }
}

function loadCv(db: DatabaseSync, raw: string | string[], res: Response): { cvId: number; cv: Cv } | null {
  const cvId = parseId(raw)
  if (cvId === undefined) {
    res.status(404).json({ error: 'CV tidak ditemukan.' })
    return null
  }
  const cv = getCvById(db, cvId)
  if (cv === undefined) {
    res.status(404).json({ error: 'CV tidak ditemukan.' })
    return null
  }
  return { cvId, cv }
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
    let cvText: string
    try {
      const result = await extractPdfText(req.file.buffer)
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
    if (description.length > 0) {
      insertTargetJob(db, { cvId, title, description })
    }
    res.status(201).json({ id: cvId })
  })

  router.get('/', (_req: Request, res: Response) => {
    res.json(listCvs(db))
  })

  router.post('/:cvId/analyze', async (req: Request, res: Response) => {
    const loaded = loadCv(db, req.params.cvId ?? '', res)
    if (loaded === null) return
    const { cvId, cv } = loaded
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
      toReportJson(reviewId, cvId, targetJob.id, report, model, review?.createdAt ?? new Date().toISOString()),
    )
  })

  router.post('/:cvId/jobs', async (req: Request, res: Response) => {
    const loaded = loadCv(db, req.params.cvId ?? '', res)
    if (loaded === null) return
    const { cvId, cv } = loaded

    const deterministic = deterministicAnalyze(cv.cvText, '')

    let model: string
    let raw: string
    let finishReason: string | null
    try {
      const proxyResult = await matchJobs({ cvId, cvText: cv.cvText })
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
      parsed = parseJobsReport(raw)
    } catch (error) {
      if (error instanceof ModelParseError) {
        res.status(502).json({ error: describeJobsFailure(raw, finishReason) })
        return
      }
      throw error
    }

    // Phase 12: model output yang lolos parse tapi tanpa saran pekerjaan atau
    // tanpa hasil analisis inti tetap dianggap gagal (bukan 500, tapi 502 jelas).
    if (parsed.jobs.length === 0 || parsed.atsChecks.length === 0) {
      res.status(502).json({ error: describeJobsFailure(raw, finishReason) })
      return
    }

    const report = composeReport(deterministic, parsed)
    const reviewId = insertReview(db, {
      cvId,
      targetJobId: null,
      overallScore: report.overallScore,
      atsChecks: report.atsChecks,
      weaknesses: report.weaknesses,
      suggestions: report.suggestions,
      modelUsed: model,
    })
    const matchId = insertJobMatch(db, { cvId, matches: parsed.jobs, modelUsed: model })
    const review = getReviewById(db, reviewId)
    const match = getJobMatchById(db, matchId)
    res.status(200).json({
      review: toReportJson(reviewId, cvId, null, report, model, review?.createdAt ?? new Date().toISOString()),
      jobMatch: {
        id: matchId,
        cvId,
        matches: match?.matches ?? [],
        modelUsed: match?.modelUsed ?? model,
        status: match?.status ?? 'completed',
        errorMessage: match?.errorMessage ?? null,
        createdAt: match?.createdAt ?? new Date().toISOString(),
      },
    })
  })

  return router
}
